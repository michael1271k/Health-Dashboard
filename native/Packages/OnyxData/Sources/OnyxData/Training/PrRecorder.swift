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
    @discardableResult
    public static func record(
        _ db: Database, sessionId: String, userId: String, dayKey: String?, date: String
    ) throws -> Int {
        let sets = try WorkoutSet
            .filter(Column("session_id") == sessionId)
            .order(Column("set_index"), Column("rowid"))
            .fetchAll(db)
        guard !sets.isEmpty else { return 0 }

        let name = try nameResolver(db)
        let exerciseIds = Set(sets.map(\.exerciseId))

        // Every set this device holds for these movements EXCEPT this
        // session's — see point 1 above.
        let prior = try WorkoutSet
            .filter(exerciseIds.contains(Column("exercise_id")))
            .filter(Column("session_id") != sessionId)
            .fetchAll(db)

        func floor(_ key: String) -> Double? {
            Ceilings.repWindow(for: name(key), dayKey: dayKey)?.floor
        }

        let baselines = PrEngine.buildBaselines(
            prior.map {
                BaselineSetRow(
                    key: $0.exerciseId, weightKg: $0.weightKg, reps: Double($0.reps),
                    est1rm: $0.est1rmKg, setType: $0.setType,
                    repFloor: floor($0.exerciseId), pairId: $0.pairId, side: $0.side
                )
            },
            isTimed: { TimedExercise.isTimed(name($0)) },
            floorFor: { PrTruth.floor(for: name($0)) }
        )

        let candidates = sets.enumerated().map { i, s in
            PrCandidateSet(
                key: s.exerciseId, weightKg: s.weightKg, reps: Double(s.reps), setType: s.setType,
                timed: TimedExercise.isTimed(name(s.exerciseId)), repFloor: floor(s.exerciseId),
                pairId: s.pairId, side: s.side, date: date,
                exerciseName: name(s.exerciseId), setNumber: s.setIndex > 0 ? s.setIndex : i + 1
            )
        }

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
        return written
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
            )
        }
        return total
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
