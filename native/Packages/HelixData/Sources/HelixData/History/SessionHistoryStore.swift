import Foundation
import GRDB

/// One logged set with the two things a set row does not carry itself: the
/// exercise's NAME and the session's DATE. Every history screen wants both.
///
/// ── WHY ONE ROW SHAPE FOR THREE SCREENS ─────────────────────────────────────
/// The session list, the session report and an exercise's history all read the
/// same ledger and differ only in the WHERE clause. Three row types would be
/// three ways to forget `set_type`, `side` and `pair_id` — the columns the PR
/// engine cannot do without (a baseline built without `set_type` summed
/// warm-ups into the bar; one built without `side`/`pair_id` judged a pair
/// against a per-side history). They are selected here, once, and carried by
/// every reader whether it needs them or not.
public struct HistorySetRow: Codable, FetchableRecord, Sendable, Equatable, Identifiable {
    public var id: String
    public var sessionId: String
    public var exerciseId: String
    /// The stored name; `ExerciseAliases.canonicalName` is the reader's job.
    /// Falls back to the id for a set whose exercise the catalogue never pulled.
    public var exerciseName: String
    public var setIndex: Int
    public var foldOrder: Int
    public var weightKg: Double
    public var reps: Int
    public var setType: String
    /// `left` / `right` as the local store spells it. See `lr`.
    public var side: String?
    public var pairId: String?
    /// Stored, and a stored 0 on an unloaded set is a legacy artefact — read it
    /// with `||`, never `??`. `PrEngine.buildBaselines` already does.
    public var est1rmKg: Double?
    public var rpe: Double?
    /// The session's logical day, ISO.
    public var date: String
    public var dayKey: String?

    public enum CodingKeys: String, CodingKey {
        case id
        case sessionId = "session_id"
        case exerciseId = "exercise_id"
        case exerciseName = "exercise_name"
        case setIndex = "set_index"
        case foldOrder = "fold_order"
        case weightKg = "weight_kg"
        case reps
        case setType = "set_type"
        case side
        case pairId = "pair_id"
        case est1rmKg = "est_1rm_kg"
        case rpe
        case date
        case dayKey = "day_key"
    }

    /// The side as the DOMAIN spells it: `L` / `R`. The local store writes
    /// `left` / `right` (`SyncTranslation.localSide`), and every HelixCore rule
    /// that folds a pair — `SessionVolume`, `PrEngine.volumeCredits`,
    /// `SessionDetail.toRows` — tests for the one-letter form. A pair handed
    /// over unmapped is scored as two lone sides, silently and everywhere.
    public var lr: String? {
        switch side {
        case "left": return "L"
        case "right": return "R"
        default: return side
        }
    }
}

/// Range reads over the training ledger. Query-only: no tables, no migrations,
/// no arithmetic — the domain shapes what comes back.
public extension AppDatabase {
    private static let setSelect = """
        SELECT s.id, s.session_id, s.exercise_id,
               COALESCE(e.name, s.exercise_id) AS exercise_name,
               s.set_index, s.fold_order, s.weight_kg, s.reps, s.set_type,
               s.side, s.pair_id, s.est_1rm_kg, s.rpe,
               sess.date, sess.day_key
        FROM workout_sets s
        JOIN workout_sessions sess ON sess.id = s.session_id
        LEFT JOIN exercises e ON e.id = s.exercise_id
        """

    /// Ledger order: by day, then by session start, then as the fold arrived.
    /// `fold_order` before `set_index` because the puller numbers folds by the
    /// server's `set_number`, and the logger appends in performed order.
    private static let setOrder = " ORDER BY sess.date, sess.started_at, s.session_id, s.fold_order, s.set_index"

    /// Every session, newest first.
    func sessionHistory() throws -> [WorkoutSession] {
        try read { db in
            try WorkoutSession.fetchAll(db, sql: "SELECT * FROM workout_sessions ORDER BY date DESC, started_at DESC")
        }
    }

    /// One session's sets in performed order.
    func historySets(sessionId: String) throws -> [HistorySetRow] {
        try read { db in
            try HistorySetRow.fetchAll(db, sql: Self.setSelect + " WHERE s.session_id = ?" + Self.setOrder, arguments: [sessionId])
        }
    }

    /// The whole ledger in performed order. The session list needs it all (a
    /// PR count per session is a chronological replay) and it is a few thousand
    /// rows at most.
    func historySets() throws -> [HistorySetRow] {
        try read { db in try HistorySetRow.fetchAll(db, sql: Self.setSelect + Self.setOrder) }
    }

    /// Every set of the given exercises, performed order, oldest first.
    func historySets(exerciseIds: [String]) throws -> [HistorySetRow] {
        guard !exerciseIds.isEmpty else { return [] }
        let marks = Array(repeating: "?", count: exerciseIds.count).joined(separator: ",")
        return try read { db in
            try HistorySetRow.fetchAll(
                db,
                sql: Self.setSelect + " WHERE s.exercise_id IN (\(marks))" + Self.setOrder,
                arguments: StatementArguments(exerciseIds)
            )
        }
    }

    /// The record book for one exercise, keyed as `personal_records` keys it:
    /// by canonical display NAME, not id.
    func personalRecords(exerciseKey: String) throws -> [PersonalRecordRow] {
        try read { db in
            try PersonalRecordRow.fetchAll(
                db,
                sql: "SELECT * FROM personal_records WHERE exercise_key = ? ORDER BY axis",
                arguments: [exerciseKey]
            )
        }
    }

    /// Cardio that belongs to a session: filed against it, or logged on its day.
    func cardio(sessionId: String, date: String) throws -> [CardioLogRow] {
        try read { db in
            try CardioLogRow.fetchAll(
                db,
                sql: "SELECT * FROM cardio_logs WHERE session_id = ? OR date = ? ORDER BY created_at",
                arguments: [sessionId, date]
            )
        }
    }
}
