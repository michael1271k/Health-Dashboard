import Foundation
import GRDB
import OnyxCore

/// Editing a workout that is already history.
///
/// ── WHY THIS IS NOT THE LOGGER ──────────────────────────────────────────────
/// `LoggerModel` writes through `set_events` into a session whose `ended_at` is
/// still NULL, and everything about it assumes the session is happening now:
/// `liveSession` finds only today's, `closeSession` derives the duration from a
/// clock that is still running, and `PrRecorder` only ever RAISES, because a
/// set being logged cannot make an older one smaller.
///
/// None of that holds for a session from three weeks ago. Correcting a mistyped
/// 100 kg to 60 has to be able to take a record BACK; changing a duration has
/// to leave the finished clock alone; and the tonnage the web reads has to be
/// rewritten, or the two clients describe different workouts.
///
/// ── EVERY EDIT GOES THROUGH THE EVENT LOG, INCLUDING A WEB SESSION'S ────────
/// `reproject` DELETES a session's `workout_sets` and rebuilds them from the
/// log. So a direct row edit on a session that HAS events is erased by the next
/// append — and a session that has NO events (every workout logged on the web
/// and pulled down here) would be erased the other way, wholesale, the first
/// time anything appended to it.
///
/// So the log is SEEDED from the projection before the first edit: one `append`
/// per existing row, carrying every column, in the order the rows already sit
/// in. Re-folding reproduces the session byte for byte, and from that moment
/// the invariant `applyPulledSets` states — "a session with events is a session
/// whose sets are a fold over them" — is true of this session too. Which is
/// also what stops the next delta pull from overwriting the edit.
public enum SessionEditing {

    /// What an edit did, and what the caller must do next.
    ///
    /// `date` is the anchor for the cascade: hand it to
    /// `RescoreQueue.request(from:reason:)`. The rescore is deliberately NOT
    /// run in here — it is up to forty-nine day-computations, and a store write
    /// the UI has to wait a second and a half for is a store write nobody uses.
    public struct Outcome: Sendable, Equatable {
        public var sessionId: String
        /// The session's own date — where the cascade starts.
        public var date: String
        public var totalVolumeKg: Double
        public var setCount: Int
        public var prCount: Int
        /// The ledger keys whose records were rebuilt from scratch.
        public var replayed: [String]
    }

    public enum EditError: Error, Equatable {
        case noSuchSession(String)
        case noSuchSet(String)
        /// The logger owns a live session; this API is for finished ones.
        case sessionIsLive(String)
    }

    /// What a session-average heart rate can be and still be one.
    ///
    /// Deliberately absurd at both ends rather than physiologically tight: the
    /// floor is below any resting rate ever recorded and the ceiling is above
    /// any maximum, so the only thing this rejects is a figure nobody could
    /// have measured. It exists because the finish sheet's `+` starts an empty
    /// cell at zero and steps by one — `avg_bpm = 2` is two taps, and it was
    /// stamped measured and therefore permanent.
    public static let plausibleBpm = 25...260
    /// Active energy for one lifting session. The ceiling is a Tour de France
    /// mountain stage; the floor is one minute of standing up.
    public static let plausibleCalories = 5...5000

    /// Σ tonnage and the committed-set count for a session's rows.
    ///
    /// Both are the WEB's definitions, because both columns are the web's:
    /// `sessionVolumeKg` collapses a genuine L/R pair to its weaker side and
    /// skips a ghost; `countCommittedSets` counts each `pair_id` once and every
    /// unpaired row once — warm-ups included, in both. The two treat a pair
    /// differently on purpose, and `save.ts` says so where it calls them.
    public static func totals(_ sets: [WorkoutSet]) -> (volumeKg: Double, count: Int) {
        let volume = SessionVolume.sessionVolumeKg(
            sets.map {
                VolumeSet(
                    weightKg: $0.weightKg, reps: Double($0.reps),
                    // ── `left` HERE, `L` THERE ──────────────────────────────
                    // The store spells a side out; every OnyxCore rule that
                    // folds a pair tests for the one letter. Handed over
                    // unmapped, a pair is scored as two lone sides — silently,
                    // and the tonnage comes out nearly double. Same door
                    // `ScoringInputsBuilder` goes through.
                    side: (try? SyncTranslation.side($0.side)) ?? nil,
                    pairId: $0.pairId, setType: $0.setType
                )
            }
        )
        var paired = Set<String>()
        var solo = 0
        for set in sets {
            if let pairId = set.pairId, !pairId.isEmpty { paired.insert(pairId) } else { solo += 1 }
        }
        return (volume, solo + paired.count)
    }
}

public extension AppDatabase {

    // MARK: - Metrics

    /// The three figures the athlete knows: duration, average heart rate,
    /// active energy. `nil` leaves one alone rather than clearing it — clearing
    /// is not something the sheet can ask for, and inventing the distinction
    /// here would be a state nothing reads.
    ///
    /// ── WHY A TYPED DURATION IS A ONE-WAY DOOR ──────────────────────────────
    /// `closeSession` derives `duration_min` from the clock and the pause
    /// ledger, and it is right to — that arithmetic is why 6 September recorded
    /// 385 minutes. But a person correcting it knows something the clock does
    /// not: that the deck stayed open on the drive home. So a correction sets
    /// `duration_edited` and the close path is then forbidden to re-derive over
    /// it. The flag is LOCAL — see `WorkoutSession.durationEdited`.
    ///
    /// ── THE ONE ENTRY POINT HERE THAT ACCEPTS A LIVE SESSION ───────────────
    /// The set edits refuse one (`edit` throws `sessionIsLive`) because they
    /// would race the deck the athlete is looking at. This does not, and must
    /// not: the finish sheet sets a typed duration on the session it is ABOUT
    /// to close, and that is the whole point of `duration_edited`. It touches
    /// no sets, so there is nothing for the logger to disagree with.
    ///
    /// Returns nil when the id names nothing — the set edits throw there
    /// instead, because a set edit that silently did nothing is a lost
    /// correction, while a metrics write is fire-and-forget from a sheet.
    /// - Parameter measured: whether the figures are the athlete's own answer.
    ///   `true` — the default, and what the finish sheet's steppers and every
    ///   existing caller mean — stamps them measured, which takes the session
    ///   out of `sessionsNeedingMetrics` so a later Health sync cannot replace
    ///   what a person typed. `false` is the finish sheet's PRE-FILL: a figure
    ///   carried over from the previous session of the same split is a good
    ///   default and is not a measurement, so the watch must still be allowed
    ///   to correct it when its workout arrives a day late.
    @discardableResult
    func updateMetrics(
        sessionId: String,
        durationMin: Double? = nil,
        avgBpm: Int? = nil,
        calories: Int? = nil,
        sessionRpe: Double? = nil,
        measured: Bool = true
    ) throws -> SessionEditing.Outcome? {
        try writer.write { db in
            guard var session = try WorkoutSession.fetchOne(db, key: sessionId) else { return nil }
            // ── WHY THE EFFORT IS HERE AND NOT IN `closeSession` ────────────
            // `closeSession` writes it because closing is when it is first
            // asked. Re-opening a finished session for editing (§U4.5) asks
            // again — the dial is the same dial — and closing a session that
            // already ended would rewrite `ended_at` and re-derive a duration
            // over a clock that has not been running for three weeks. Clamped
            // to the CR-10 scale the dial can produce; a keyboard cannot reach
            // this, but `session_rpe` is an ACWR input and every other write to
            // it is clamped.
            if let sessionRpe {
                session.sessionRpe = min(10, max(0, sessionRpe))
            }
            if let durationMin {
                // Clamped, not trusted. A stepper cannot produce a negative and
                // a keyboard can, and `duration_min` is an ACWR input.
                session.durationMin = max(0, durationMin)
                session.durationEdited = true
            }
            // ── CLAMPED, FOR THE SAME REASON THE OTHER TWO ARE ──────────────
            // `session_rpe` and `duration_min` are clamped here because a
            // keyboard can reach them and they are ACWR inputs. These two were
            // not, and a stepper CAN reach them: two taps on `+` from an empty
            // Avg HR cell wrote `avg_bpm = 2` — and stamped it MEASURED, which
            // takes the session out of `sessionsNeedingMetrics` and so forbids
            // the watch from ever correcting it. A figure that survives the one
            // mechanism built to fix it has to be plausible before it lands.
            //
            // The bounds are the widest a human body reaches, not a tight
            // physiological window: rejecting an unusual truth is worse than
            // storing one, and this only has to stop a mis-tap becoming
            // permanent. A value outside them is DROPPED rather than clamped
            // into range — a 2 clamped to 30 is still a number nobody measured,
            // and leaving the column nil is what keeps the session in the
            // Health sync's queue.
            if let avgBpm, SessionEditing.plausibleBpm.contains(avgBpm) {
                session.avgBpm = avgBpm
                session.avgBpmEstimated = !measured
            }
            if let calories, SessionEditing.plausibleCalories.contains(calories) {
                session.caloriesBurned = calories
                session.caloriesEstimated = !measured
            }
            let outcome = try Self.recount(
                db, session: &session, replayed: [],
                authoritative: try Self.holdsSets(db, sessionId: sessionId)
            )
            try session.update(db)
            try Self.enqueueSessionUpsert(sessionId: sessionId, in: db)
            return outcome
        }
    }

    // MARK: - Sets

    /// Change a logged set on a finished session.
    ///
    /// Every argument is optional and `nil` means "leave it": the sheet edits
    /// one field at a time, and a patch carrying the others as nulls would
    /// clear a rating nobody touched. `SetPatch.clearedQuality` is the one
    /// sentinel that takes a value back off — see the field.
    @discardableResult
    /// `est1rmKg` travels with a changed load on purpose: `PrEngine` reads the
    /// STORED estimate with `||` — a value that is present and wrong is not
    /// missing, so it does not fall through to Epley — and the ledger, the
    /// sparkline and the next session's baselines would all keep the estimate of
    /// the weight you just corrected. `setIndex` is here for the same class of
    /// reason: the logger's deck knows a set's position within its exercise and
    /// the patch is the only way to say so.
    func amendSet(
        sessionId: String,
        setId: String,
        weightKg: Double? = nil,
        reps: Int? = nil,
        rpe: Double? = nil,
        setType: String? = nil,
        quality: String? = nil,
        est1rmKg: Double? = nil,
        setIndex: Int? = nil,
        exerciseOrder: Int? = nil
    ) throws -> SessionEditing.Outcome? {
        let patch = SetPatch(
            setIndex: setIndex, weightKg: weightKg, reps: reps, setType: setType,
            est1rmKg: est1rmKg, rpe: rpe, quality: quality, exerciseOrder: exerciseOrder
        )
        // An amend that changes nothing is permanent noise in a log that is
        // never compacted — the rule `EventStore.amendSet` states. Checked HERE
        // rather than inside the transaction because `edit` seeds the event log
        // on the way in, and seeding is a ONE-WAY DOOR: a no-op amend would
        // permanently take a pulled session out of the mirror's reach (see
        // `seedEventLog`) and queue an upload for a session nothing touched.
        //
        // ── AND `isEmpty` IS NOT ENOUGH ─────────────────────────────────────
        // `SetPatch.isEmpty` is "every field is nil", which the logger's own
        // amend can never be: it sends the whole row on every commit, and
        // `ExerciseCardView` commits on every focus LOSS, changed or not. So
        // tapping into a set's weight field to read it and tapping away was a
        // full edit — a seed, a PR replay, a recount, an outbox upsert and a
        // forty-nine-day rescore, for a session nobody had touched, and it took
        // that session permanently out of the mirror's reach. The patch is
        // compared against the row it describes, which is the only check that
        // can tell "I retyped 40" from "I changed 40 to 60".
        guard !patch.isEmpty else { return nil }
        guard try changesSomething(patch, sessionId: sessionId, setId: setId) else { return nil }
        return try edit(sessionId: sessionId) { db, _ in
            guard let existing = try WorkoutSet.fetchOne(db, key: setId), existing.sessionId == sessionId
            else { throw SessionEditing.EditError.noSuchSet(setId) }
            try Self.appendEvent(db, sessionId: sessionId, setId: setId, body: .amend(patch))
            return [existing.exerciseId]
        }
    }

    /// Add a set the logger never captured — the one you did and forgot to tick.
    ///
    /// `snapshot.setIndex` is the position within the exercise. Only the caller
    /// knows the deck, so choosing the next free one is its job.
    @discardableResult
    func addSet(
        sessionId: String,
        _ snapshot: SetSnapshot,
        setId: String = newOnyxID()
    ) throws -> SessionEditing.Outcome? {
        try edit(sessionId: sessionId) { db, _ in
            try Self.appendEvent(db, sessionId: sessionId, setId: setId, body: .append(snapshot))
            return [snapshot.exerciseId]
        }
    }

    /// Remove a set — a tombstone in the log, never a DELETE.
    ///
    /// The event that created it stays, for the reason `voidSet` gives: another
    /// device may not have heard about the deletion, and when its append finally
    /// arrives the tombstone is what stops the set coming back.
    @discardableResult
    func deleteSet(sessionId: String, setId: String) throws -> SessionEditing.Outcome? {
        try edit(sessionId: sessionId) { db, _ in
            guard let existing = try WorkoutSet.fetchOne(db, key: setId), existing.sessionId == sessionId
            else { throw SessionEditing.EditError.noSuchSet(setId) }
            try Self.appendEvent(db, sessionId: sessionId, setId: setId, body: .void)
            return [existing.exerciseId]
        }
    }

    // MARK: - The shape every set edit has

    /// Seed, apply, replay, recount — in ONE transaction.
    ///
    /// ── WHY THE PR REPLAY IS INSIDE IT ──────────────────────────────────────
    /// The same reason `closeSession` puts the recorder inside its own: a
    /// ledger that exists only because a later write succeeded is a ledger that
    /// disappears when it does not. It matters more here, because this write
    /// can RETRACT — a crash between the set edit and the replay would leave a
    /// record standing for a set that no longer exists, and nothing would ever
    /// go looking for it again.
    ///
    /// `apply` returns the `exercise_id`s it touched; they become ledger keys.
    private func edit(
        sessionId: String,
        _ apply: (Database, WorkoutSession) throws -> [String]
    ) throws -> SessionEditing.Outcome? {
        try writer.write { db in
            guard var session = try WorkoutSession.fetchOne(db, key: sessionId) else {
                throw SessionEditing.EditError.noSuchSession(sessionId)
            }
            // A live session belongs to the logger, which appends through
            // `EventStore` and closes through `closeSession`. Editing one here
            // would race the deck the athlete is looking at.
            guard session.endedAt != nil else {
                throw SessionEditing.EditError.sessionIsLive(sessionId)
            }
            // Asked BEFORE the edit: `addSet` on a session whose sets were
            // never mirrored would otherwise leave exactly one row behind and
            // call that the whole workout.
            let held = try Self.holdsSets(db, sessionId: sessionId)
            try Self.seedEventLog(db, sessionId: sessionId)

            let touched = try apply(db, session)
            let name = try PrRecorder.nameResolver(db)
            var replayed: [String] = []
            for key in Set(touched.map(name)).sorted() {
                _ = try PrRecorder.replay(db, userId: session.userId, exerciseKey: key)
                replayed.append(key)
            }
            let outcome = try Self.recount(
                db, session: &session, replayed: replayed, authoritative: held
            )
            try session.update(db)
            try Self.enqueueSessionUpsert(sessionId: sessionId, in: db)
            return outcome
        }
    }

    /// Would applying `patch` produce a different row?
    ///
    /// Read in its own transaction, before `edit` opens the write one. That is
    /// a race in principle — the row could change in between — and it is the
    /// harmless direction: the worst case is one redundant event, which is what
    /// the check exists to reduce and not a correctness claim.
    ///
    /// `SetSnapshot` is the shape the fold applies a patch to, so this asks the
    /// question with exactly the arithmetic `reproject` would use. Missing rows
    /// answer `true` — `amendSet` throws `noSuchSet` inside the transaction and
    /// that error belongs there, not swallowed here as a no-op.
    private func changesSomething(_ patch: SetPatch, sessionId: String, setId: String) throws -> Bool {
        try writer.read { db in
            guard let existing = try WorkoutSet.fetchOne(db, key: setId),
                  existing.sessionId == sessionId
            else { return true }
            let before = SetSnapshot(
                exerciseId: existing.exerciseId,
                setIndex: existing.setIndex,
                weightKg: existing.weightKg,
                reps: existing.reps,
                setType: existing.setType,
                side: existing.side,
                pairId: existing.pairId,
                est1rmKg: existing.est1rmKg,
                rpe: existing.rpe,
                quality: existing.quality,
                exerciseOrder: existing.exerciseOrder
            )
            return patch.applied(to: before) != before
        }
    }

    /// Does this device hold the session's sets?
    ///
    /// ── WHY THE AGGREGATES NEED THE QUESTION ASKED ──────────────────────────
    /// `recount` derives `total_volume_kg` and `set_count` from the rows this
    /// device has, and those columns are then PUSHED. On a session the mirror
    /// has never brought down — the session row arrives before its sets, and a
    /// pull can fail between the two — that is one set of arithmetic over an
    /// empty table, and the answer is a confident zero written over a figure
    /// the web computed correctly from eighteen sets. `encodeIfPresent` cannot
    /// catch it: the value is not unknown, it is wrong.
    ///
    /// So an empty local set list means the aggregates are left ALONE. Deleting
    /// the last set of a session this device does hold is a different case and
    /// still writes zero, which is the truth about it.
    private static func holdsSets(_ db: Database, sessionId: String) throws -> Bool {
        try Int.fetchOne(
            db, sql: "SELECT count(*) FROM workout_sets WHERE session_id = ?", arguments: [sessionId]
        ) ?? 0 > 0
    }

    /// Stamp, commit and reproject one event inside the caller's transaction.
    ///
    /// `appendSet` / `amendSet` / `voidSet` each open their OWN `writer.write`,
    /// and GRDB's writer is not reentrant — calling one from inside this
    /// transaction deadlocks. This is their shared body without the outer
    /// transaction, and it deliberately does not claim the pencil: that lock is
    /// about who is logging a session LIVE, and a session that ended weeks ago
    /// has nobody to take it from.
    private static func appendEvent(
        _ db: Database, sessionId: String, setId: String, body: SetEvent.Body
    ) throws {
        let event = SetEvent(
            sessionId: sessionId,
            setId: setId,
            deviceId: try deviceId(db),
            seq: try tickClock(db),
            body: body
        )
        try commit(event, in: db)
    }

    /// Give a pulled session a log of its own, once.
    ///
    /// One `append` per existing row, in the projection's own order, carrying
    /// every column the snapshot has. Re-folding these reproduces the same rows
    /// with the same ids, so seeding is invisible: `reproject` deletes the
    /// projection and rebuilds it, and what comes back is what was there.
    ///
    /// A session that already has events is left alone — it IS its log.
    ///
    /// ── AND IT IS A ONE-WAY DOOR, PERMANENTLY ───────────────────────────────
    /// `applyPulledSets` skips any session that has events, and it does not
    /// un-skip. So the first edit to a web-logged session takes it out of the
    /// mirror's reach FOREVER, not merely for the pull that might have raced
    /// it: edit a set here, then edit the same session on the web, and this
    /// device keeps its own version with no symptom on either side.
    ///
    /// That is the trade, and it is the right one — the alternative is an edit
    /// this device made being silently overwritten by a pull it did not ask
    /// for — but it is wider than "stops the next delta pull from overwriting
    /// the edit", and a reader deserves to be told which.
    /// Give these sessions a log, if they do not have one, from the rows they
    /// already hold.
    ///
    /// ── WHY THE PULLER NEEDS THIS AND THE EDITOR ALREADY DID ────────────────
    /// `seedEventLog` has been a private step of `editSession` since Wave 2: a
    /// session pulled from the server has rows and no events, and the first
    /// edit has to seed the log or the fold would rebuild the session from the
    /// single event that edit produced — a thirty-set workout collapsing to one.
    ///
    /// The Watch adds the same shape from the other direction. A session can
    /// straddle the day `set_events` was created server-side: the early sets
    /// exist only as rows, the later ones as events. Ingesting the events alone
    /// re-folds the session from the later half and the early sets disappear
    /// from a workout that is complete on the server. Seeding first means the
    /// fold sees all of it.
    ///
    /// Idempotent and cheap: `seedEventLog` returns immediately for any session
    /// that already has an event, which is every session this device logged.
    func seedEventLogs(sessionIds: Set<String>) throws {
        guard !sessionIds.isEmpty else { return }
        try writer.write { db in
            for sessionId in sessionIds.sorted() {
                try Self.seedEventLog(db, sessionId: sessionId)
            }
        }
    }

    static func seedEventLog(_ db: Database, sessionId: String) throws {
        let existing = try Int.fetchOne(
            db, sql: "SELECT count(*) FROM set_events WHERE session_id = ?", arguments: [sessionId]
        ) ?? 0
        guard existing == 0 else { return }

        let rows = try WorkoutSet
            .filter(Column("session_id") == sessionId)
            .order(Column("set_index"), Column("fold_order"), Column("rowid"))
            .fetchAll(db)
        guard !rows.isEmpty else { return }

        let device = try deviceId(db)
        for row in rows {
            let event = SetEvent(
                sessionId: sessionId,
                setId: row.id,
                deviceId: device,
                seq: try tickClock(db),
                body: .append(
                    SetSnapshot(
                        exerciseId: row.exerciseId,
                        setIndex: row.setIndex,
                        weightKg: row.weightKg,
                        reps: row.reps,
                        setType: row.setType,
                        side: row.side,
                        pairId: row.pairId,
                        est1rmKg: row.est1rmKg,
                        rpe: row.rpe,
                        quality: row.quality,
                        // Carried, not re-derived. A pulled session's rows come
                        // down with the web's own order on them, and seeding is
                        // supposed to reproduce the session byte for byte —
                        // dropping it here would blank the column on the first
                        // edit of every workout logged on the other client.
                        exerciseOrder: row.exerciseOrder,
                        // Same argument, three more columns: a treadmill set
                        // pulled from the server is five minutes at incline 2
                        // for 0.37 km, and a seed that drops those re-renders
                        // it as `0kg × 0` on the first edit of the session.
                        durationSec: row.durationSec,
                        incline: row.incline,
                        distanceKm: row.distanceKm,
                        elevationM: row.elevationM
                    )
                )
            )
            try event.insert(db)
            // ── BORN SYNCED, LIKE A CLOCK EVENT ─────────────────────────────
            // These describe rows the server ALREADY HAS — that is where they
            // came from. Left unsynced they would queue an upsert per set on
            // the next drain, re-pushing an untouched session; and `reproject`
            // reads `is_synced` to decide `is_pending_sync`, so the whole
            // session would render as awaiting upload. The edit that follows
            // writes its own event, and THAT one syncs.
            try db.execute(
                sql: "UPDATE set_events SET is_synced = 1 WHERE id = ?", arguments: [event.id]
            )
        }
        try reproject(sessionId: sessionId, in: db)
    }

    /// Recompute the session's stored aggregates from its rows, and report.
    ///
    /// `pr_count` is the SESSION's number — distinct axis-PRs across every
    /// exercise in it — which is not the count of ledger rows a replay wrote
    /// for one of them. Recomputed over the whole session so it agrees with
    /// what the web would write for these rows.
    private static func recount(
        _ db: Database, session: inout WorkoutSession, replayed: [String],
        authoritative: Bool
    ) throws -> SessionEditing.Outcome {
        let sets = try WorkoutSet
            .filter(Column("session_id") == session.id)
            .order(Column("set_index"), Column("fold_order"))
            .fetchAll(db)
        let totals = SessionEditing.totals(sets)
        let prCount = try PrRecorder.prCount(
            db, sets: sets, dayKey: session.dayKey, date: session.date
        )
        // Not ours to state — see `holdsSets`. The columns keep whatever the
        // client that DID hold the sets last wrote, and the outcome still
        // reports what this device can see so a caller is not left guessing.
        if authoritative {
            session.totalVolumeKg = totals.volumeKg
            session.setCount = totals.count
            session.prCount = prCount
        }
        return SessionEditing.Outcome(
            sessionId: session.id, date: session.date,
            totalVolumeKg: totals.volumeKg, setCount: totals.count,
            prCount: prCount, replayed: replayed
        )
    }
}
