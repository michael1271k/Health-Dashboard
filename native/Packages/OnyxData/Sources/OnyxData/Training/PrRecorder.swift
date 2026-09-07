import Foundation
import GRDB
import OnyxCore

/// The PR ledger, written by the phone.
///
/// ── WHAT THIS CLOSES ────────────────────────────────────────────────────────
/// `PrEngine` has been fully ported since Track D, and `SessionAnalysis` has
/// replayed it at READ time since Wave 7 — so the app could always *show* you a
/// record. It just never wrote one down. `personal_records` was pull-only: a
/// session logged on the phone produced no ledger rows at all, and the desktop,
/// the trophy chips and every "since when" answer stayed on whatever the web
/// last recorded. Finish a workout on the phone and the record simply did not
/// exist anywhere.
///
/// This is `save.ts`'s PR block, translated. Same engine, same inputs, same
/// conflict target — because the two clients write the SAME three columns of
/// the same table and any difference between them is a record filed where the
/// other side will never look for it.
///
/// ── THE THREE THINGS THAT MAKE IT THE SAME FUNCTION ─────────────────────────
/// 1. **Baselines exclude this session.** `save.ts` builds them before the sets
///    are inserted, so "every set for these exercises" is naturally the prior
///    history. Here the sets are already in the store — `closeSession` runs
///    after the last append — so the exclusion has to be explicit. Without it
///    every set is measured against itself and nothing is ever a record.
/// 2. **`exercise_key` is a canonical display NAME, never an id.** The web
///    learned this the hard way: a set logged under an alias filed its record
///    under a key nothing would match and the trophy rendered with no chips.
///    The engine is keyed on `exercise_id` throughout (as `save.ts` keys it)
///    and the name is applied only at the last step, where the row is built.
/// 3. **`prFloorFor`, not the raw record book.** Four months of Notion-era
///    sessions have no sets, so a return to an old load would read as a new
///    record. The floor is a bar the logged rows cannot account for, folded in
///    as one more contender — see `PrTruth`.
public enum PrRecorder {

    /// Detect and file one session's records, inside the caller's transaction.
    ///
    /// Returns the rows written, which is the count the caller can report. The
    /// write is idempotent: the natural key `(user_id, exercise_key, axis)` is
    /// what both clients upsert on, and re-running over the same session
    /// recomputes the same baselines and lands the same values.
    /// What one `record` pass did. `written` is the ledger rows upserted;
    /// `prCount` is the session's own `pr_count` — distinct axis-PRs across
    /// every exercise, which is a DIFFERENT number and the one the session row
    /// stores.
    public struct Result: Sendable, Equatable {
        public var written: Int
        public var prCount: Int
        public static let none = Result(written: 0, prCount: 0)
    }

    @discardableResult
    public static func record(
        _ db: Database, sessionId: String, userId: String, dayKey: String?, date: String
    ) throws -> Result {
        let sets = try WorkoutSet
            .filter(Column("session_id") == sessionId)
            .order(Column("set_index"), Column("rowid"))
            .fetchAll(db)
        guard !sets.isEmpty else { return .none }

        let name = try nameResolver(db)
        let exerciseIds = Set(sets.map(\.exerciseId))

        let baselines = try baselines(
            db, exerciseIds: exerciseIds, excluding: sessionId, dayKey: dayKey, name: name
        )
        let candidates = Self.candidates(sets, dayKey: dayKey, date: date, name: name)
        let result = PrEngine.detectSessionPrs(candidates, baselines)
        var written = 0
        for exercise in PrEngine.recordSets(candidates, result) {
            let key = name(exercise.key)
            for record in exercise.records {
                let row = PersonalRecordRow(
                    userId: userId,
                    exerciseKey: key,
                    axis: record.axis.rawValue,
                    // Two decimals, as `save.ts` rounds it. A ledger value that
                    // disagrees with the other client's in the fifteenth place
                    // is a diff nobody can act on.
                    value: (record.set.value * 100).rounded() / 100,
                    // EVERY axis carries the winning set's load and reps, volume
                    // and e1RM included. They stored null until 2026-08-03, and
                    // the session ledger — which matches a record to the set
                    // that earned it by (weight, reps) — hung the chip on
                    // whichever set happened to come last.
                    reps: Int(record.set.reps),
                    weightKg: record.set.weightKg,
                    sessionId: sessionId,
                    achievedOn: date,
                    // The delta cursor is the server's to move.
                    updatedAt: AppDatabase.localWriteTimestamp
                )
                try row.save(db)
                try AppDatabase.enqueueRowUpsert(
                    table: PersonalRecordRow.databaseTableName,
                    id: AppDatabase.rowID([userId, key, record.axis.rawValue]),
                    in: db
                )
                written += 1
            }
        }
        return Result(written: written, prCount: result.prCount)
    }

    /// One session's sets, as the engine takes them.
    ///
    /// Keyed on `exercise_id` — as `save.ts` keys it — with the canonical name
    /// applied only where a name is genuinely wanted. Two callers share it so
    /// the ledger written on close and the count stored on the session row can
    /// never be built from differently-shaped inputs.
    static func candidates(
        _ sets: [WorkoutSet], dayKey: String?, date: String, name: (String) -> String
    ) -> [PrCandidateSet] {
        sets.enumerated().map { i, s in
            let canonical = name(s.exerciseId)
            return PrCandidateSet(
                key: s.exerciseId, weightKg: s.weightKg, reps: Double(s.reps), setType: s.setType,
                timed: TimedExercise.isTimed(canonical),
                repFloor: Ceilings.repWindow(for: canonical, dayKey: dayKey)?.floor,
                pairId: s.pairId, side: s.side, date: date,
                exerciseName: canonical, setNumber: s.setIndex > 0 ? s.setIndex : i + 1
            )
        }
    }

    /// `workout_sessions.pr_count` for a set of rows, WITHOUT writing anything.
    ///
    /// The session row stores a count and the ledger stores the records, and
    /// they are two different numbers over the same detection — so this runs
    /// the detection and throws the ledger half away. An edit needs the count
    /// recomputed on every save; it must not re-file a record for an exercise
    /// nobody touched, which is what calling `record` again would do.
    static func prCount(
        _ db: Database, sets: [WorkoutSet], dayKey: String?, date: String
    ) throws -> Int {
        guard let sessionId = sets.first?.sessionId else { return 0 }
        let name = try nameResolver(db)
        let baselines = try baselines(
            db, exerciseIds: Set(sets.map(\.exerciseId)), excluding: sessionId,
            dayKey: dayKey, name: name
        )
        return PrEngine.detectSessionPrs(
            candidates(sets, dayKey: dayKey, date: date, name: name), baselines
        ).prCount
    }

    /// The bar every candidate is measured against.
    ///
    /// ── ONE BUILDER, TWO CALLERS, AND THAT IS THE POINT ─────────────────────
    /// `record` uses it at close to write the ledger; the live logger uses it at
    /// `attach` to light the trophy mid-set. A live badge computed from
    /// different baselines than the ledger is a badge that fires on a set the
    /// close then refuses to file — gold that means "this has never been beaten"
    /// everywhere else in the app, appearing on a set that has.
    ///
    /// `excluding` is the session being judged. `save.ts` gets the exclusion for
    /// free (it builds baselines before inserting), and both callers here have
    /// the sets already in the store, so it has to be explicit: without it every
    /// set is measured against itself and nothing is ever a record.
    /// ── `before` IS FOR A SESSION THAT IS ALREADY HISTORY ───────────────────
    /// `save.ts` never needed it: it builds the bar at close, when there is by
    /// definition nothing after. Re-opening a three-week-old session to correct
    /// it (§U4.5) is the first caller for which "every other session" and
    /// "every EARLIER session" are different sets — measured against the whole
    /// ledger an August set is beaten by a September one and the deck shows no
    /// records at all, on a session whose own summary page shows three. The
    /// date lives on `workout_sessions`, so the bound is a subquery; nil keeps
    /// the old behaviour exactly, which is what the live logger wants.
    static func baselines(
        _ db: Database, exerciseIds: Set<String>, excluding sessionId: String?,
        before: String? = nil,
        dayKey: String?, name: @escaping (String) -> String
    ) throws -> PrBaselines {
        guard !exerciseIds.isEmpty else { return .empty }
        var query = WorkoutSet.filter(exerciseIds.contains(Column("exercise_id")))
        if let sessionId { query = query.filter(Column("session_id") != sessionId) }
        if let before {
            query = query.filter(
                sql: "session_id IN (SELECT id FROM workout_sessions WHERE date < ?)",
                arguments: [before]
            )
        }
        let prior = try query.fetchAll(db)
        return PrEngine.buildBaselines(
            prior.map {
                BaselineSetRow(
                    key: $0.exerciseId, weightKg: $0.weightKg, reps: Double($0.reps),
                    est1rm: $0.est1rmKg, setType: $0.setType,
                    repFloor: Ceilings.repWindow(for: name($0.exerciseId), dayKey: dayKey)?.floor,
                    pairId: $0.pairId, side: $0.side
                )
            },
            isTimed: { TimedExercise.isTimed(name($0)) },
            floorFor: { PrTruth.floor(for: name($0)) }
        )
    }

    /// Replay every session this device holds, oldest first.
    ///
    /// The one-off for sessions logged on the phone before this existed, and
    /// the repair for any session whose ledger write was lost. Chronological on
    /// purpose: a record is only a record against what came before it, so
    /// replaying out of order would file the wrong set.
    ///
    /// Idempotent — every write is an upsert on the natural key — so it is safe
    /// to run whenever, and safe to run twice.
    @discardableResult
    public static func recomputeAll(_ db: Database, userId: String) throws -> Int {
        let sessions = try WorkoutSession
            .order(Column("date"), Column("started_at"), Column("rowid"))
            .fetchAll(db)
        var total = 0
        for session in sessions {
            total += try record(
                db, sessionId: session.id, userId: userId, dayKey: session.dayKey, date: session.date
            ).written
        }
        return total
    }

    /// Rebuild ONE exercise's ledger from scratch, chronologically.
    ///
    /// ── WHY THE RECORDER ALONE CANNOT RETRACT ───────────────────────────────
    /// `record` upserts. That is exactly right for finishing a workout — a
    /// record is only ever beaten — and exactly wrong the moment a set can be
    /// LOWERED after the fact. Correct a mistyped 100 kg to 60 and the 100 kg
    /// row is still the best-ever bench, filed against a set that no longer
    /// exists, and no amount of re-running `record` will ever take it out.
    ///
    /// So the ledger for this exercise is deleted and replayed: every session
    /// this device holds, oldest first, each judged only against what came
    /// BEFORE it. That is `backfill-prs.mjs`'s rule, and it is the only one
    /// that produces the same answer whichever direction the edit went.
    ///
    /// ── AND WHY IT IS KEYED ON THE NAME, NOT THE ID ─────────────────────────
    /// `record` keys the engine on `exercise_id` (as `save.ts` does) and applies
    /// the name at the last step. Here the CALLER has a ledger key — a canonical
    /// display name — and every id that resolves to it is the same movement as
    /// far as `personal_records` is concerned. Keying on the name is what makes
    /// a lift logged on the web under a catalogue uuid and on the phone under a
    /// `helix5-` slug replay as one history rather than two.
    ///
    /// ── WHICH MEANS THE TWO CAN DISAGREE, AND `record` IS THE NARROW ONE ────
    /// A lift logged on both clients has its history under two `exercise_id`s
    /// in this table — `nameResolver`'s own header calls that routine, not
    /// rare. `record` builds its baseline from ONE of them, so closing a phone
    /// session can file a record the full history would have refused; a replay
    /// of that key then quietly retracts it. The narrow side is `record`, and
    /// widening it moves stored records for every lift with an alias, which is
    /// a recompute and a founder decision (F16, decision 12) rather than a
    /// side effect of an edit. Filed, not fixed here.
    ///
    /// ── THE ONE THING THAT MUST NOT BE FORGOTTEN ────────────────────────────
    /// An axis that had a row before and has none after — every set that ever
    /// reached the floor is now deleted — needs the SERVER told. An upsert
    /// cannot say "there is no record here any more"; only a delete can, and
    /// the local row going quiet would otherwise leave the web showing a
    /// record for a lift with no qualifying set left in the history.
    ///
    /// Returns the ledger rows written.
    @discardableResult
    public static func replay(
        _ db: Database, userId: String, exerciseKey: String
    ) throws -> Int {
        let name = try nameResolver(db)
        let everySet = try WorkoutSet.fetchAll(db)
        let ids = Set(everySet.map(\.exerciseId).filter { name($0) == exerciseKey })
        guard !ids.isEmpty else {
            // Every set for this lift is gone. The ledger goes with it.
            try retract(db, userId: userId, exerciseKey: exerciseKey)
            return 0
        }

        // ── FINISHED SESSIONS ONLY ──────────────────────────────────────────
        // `record` has only ever run at close, so the ledger has only ever
        // held closed sessions' records. A replay that walked the live one too
        // would file — and push — a record for a set that is still being
        // logged; void that set a minute later and nothing re-runs the replay,
        // because `record` at close only ever raises. The result is a standing
        // record for a set that no longer exists, which is the exact failure
        // this function was written to prevent, arriving through another door.
        let sessions = try WorkoutSession
            .filter(Column("ended_at") != nil)
            .order(Column("date"), Column("started_at"), Column("rowid"))
            .fetchAll(db)
        var bySession: [String: [WorkoutSet]] = [:]
        for set in everySet where ids.contains(set.exerciseId) {
            bySession[set.sessionId, default: []].append(set)
        }

        /// Every set judged so far — the baseline the NEXT session is measured
        /// against. `record` gets this for free by excluding one session from a
        /// whole-table read; a replay has to accumulate it, because a session in
        /// the middle of the history must not be judged against its own future.
        var seen: [BaselineSetRow] = []
        var written = 0
        let timed = TimedExercise.isTimed(exerciseKey)
        let floor = PrTruth.floor(for: exerciseKey)

        // Clear the slate — locally AND on the wire. Every axis is queued for
        // deletion up front; each one the replay wins back drops its own
        // pending delete on the way in (`enqueueRowUpsert` removes it), so what
        // survives in the queue is exactly the axes that no longer have a
        // qualifying set. There is no third state to reconcile afterwards.
        try retract(db, userId: userId, exerciseKey: exerciseKey)

        for session in sessions {
            guard let rows = bySession[session.id]?
                .sorted(by: { ($0.setIndex, $0.foldOrder) < ($1.setIndex, $1.foldOrder) }),
                  !rows.isEmpty
            else { continue }

            // The rep window is resolved per SESSION, because it depends on the
            // day key — the same lift has a different floor on a leg day and an
            // upper day. `Ceilings.repWindow`'s phase default is untouched, so
            // this gates the e1RM axis exactly as `record` does.
            let repFloor = Ceilings.repWindow(for: exerciseKey, dayKey: session.dayKey)?.floor
            let baselines = PrEngine.buildBaselines(
                seen, isTimed: { _ in timed }, floorFor: { _ in floor }
            )
            let candidates = rows.enumerated().map { i, s in
                PrCandidateSet(
                    key: exerciseKey, weightKg: s.weightKg, reps: Double(s.reps), setType: s.setType,
                    timed: timed, repFloor: repFloor,
                    pairId: s.pairId, side: s.side, date: session.date,
                    exerciseName: exerciseKey, setNumber: s.setIndex > 0 ? s.setIndex : i + 1
                )
            }
            let result = PrEngine.detectSessionPrs(candidates, baselines)
            for exercise in PrEngine.recordSets(candidates, result) {
                for record in exercise.records {
                    let row = PersonalRecordRow(
                        userId: userId,
                        exerciseKey: exerciseKey,
                        axis: record.axis.rawValue,
                        value: (record.set.value * 100).rounded() / 100,
                        reps: Int(record.set.reps),
                        weightKg: record.set.weightKg,
                        sessionId: session.id,
                        achievedOn: session.date,
                        updatedAt: AppDatabase.localWriteTimestamp
                    )
                    try row.save(db)
                    try AppDatabase.enqueueRowUpsert(
                        table: PersonalRecordRow.databaseTableName,
                        id: AppDatabase.rowID([userId, exerciseKey, record.axis.rawValue]),
                        in: db
                    )
                    written += 1
                }
            }
            seen.append(contentsOf: rows.map {
                BaselineSetRow(
                    key: exerciseKey, weightKg: $0.weightKg, reps: Double($0.reps),
                    est1rm: $0.est1rmKg, setType: $0.setType, repFloor: repFloor,
                    pairId: $0.pairId, side: $0.side
                )
            })
        }

        return written
    }

    /// Delete every ledger row for one key, locally and on the wire.
    ///
    /// An upsert cannot say "there is no record here any more" — only a delete
    /// can, and a local row going quiet would leave the web showing a record
    /// for a lift with no qualifying set left in the history.
    private static func retract(
        _ db: Database, userId: String, exerciseKey: String
    ) throws {
        let rows = try PersonalRecordRow
            .filter(Column("user_id") == userId && Column("exercise_key") == exerciseKey)
            .fetchAll(db)
        for row in rows {
            try row.delete(db)
            try AppDatabase.enqueueRowDelete(
                table: PersonalRecordRow.databaseTableName,
                key: ["user_id": userId, "exercise_key": exerciseKey, "axis": row.axis],
                in: db
            )
        }
    }

    /// `exercise_id` → the canonical display name the ledger is keyed on.
    ///
    /// Two sources, because a set can carry either kind of id. A set pulled
    /// from the server carries the catalogue's uuid, which the local
    /// `exercises` table resolves. A set logged HERE and not yet synced carries
    /// `ExerciseSlug.id`'s slug, which no catalogue row claims until the push
    /// lands — `nameBySlug` is what stops those sets filing their records under
    /// a raw slug for the minutes in between.
    static func nameResolver(_ db: Database) throws -> (String) -> String {
        let catalogue = Dictionary(
            try Exercise.fetchAll(db).map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first }
        )
        var memo: [String: String] = [:]
        return { id in
            if let hit = memo[id] { return hit }
            let raw = catalogue[id] ?? ExerciseSlug.nameBySlug[id] ?? id
            let canonical = ExerciseAliases.canonicalName(raw)
            memo[id] = canonical
            return canonical
        }
    }
}

extension AppDatabase {
    /// The live logger's baselines: the bar the deck's ticked sets are measured
    /// against, built by the same function that writes the ledger on close.
    ///
    /// `exerciseIds` are the deck's own ids (`ExerciseSlug.id`), which is what
    /// the logger writes into `workout_sets` and therefore what the close path
    /// will key on. A set logged on the WEB carries a catalogue uuid instead, so
    /// its history is not in this bar — `PrTruth.floor`, folded in by
    /// `buildBaselines`, is what keeps a return to an old load from reading as a
    /// record anyway. Matching `record` exactly is the requirement; being
    /// cleverer than it would light a trophy the close then refuses to file.
    public func livePrBaselines(
        exerciseIds: [String], excluding sessionId: String?, before: String? = nil, dayKey: String?
    ) throws -> PrBaselines {
        try writer.read { db in
            let name = try PrRecorder.nameResolver(db)
            return try PrRecorder.baselines(
                db, exerciseIds: Set(exerciseIds), excluding: sessionId,
                before: before, dayKey: dayKey, name: name
            )
        }
    }

    /// Replay the PR ledger over every session this device holds.
    ///
    /// The one-off for sessions logged before the recorder existed, and the
    /// repair for any whose ledger write was lost. Idempotent, so the only cost
    /// of running it again is the time.
    @discardableResult
    public func recomputeAllPrs(userId: String) throws -> Int {
        try writer.write { db in try PrRecorder.recomputeAll(db, userId: userId) }
    }
}
