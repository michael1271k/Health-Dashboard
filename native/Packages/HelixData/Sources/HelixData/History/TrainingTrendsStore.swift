import Foundation
import GRDB
import HelixCore

/// One logged session with its sets and the name each set was logged under —
/// the row the Training Trends charts slice.
///
/// ── WHY ONE READ FEEDS FOUR CHARTS ──────────────────────────────────────────
/// The volume stream, the intensity calendar, the strength trends and the
/// muscle focus all walk the same sessions. Four queries would be four chances
/// to disagree about which rows are "the range"; one read, shaped once, cannot.
/// `volumeKg` is `sessionVolumeKg` over the sets (a unilateral pair is ONE set
/// at the weaker side, a ghost is nothing) because the local row stores no
/// tonnage of its own.
public struct TrendSession: Sendable, Equatable, Identifiable {
    public var id: String { session.id }
    public let session: WorkoutSession
    /// In fold order.
    public let sets: [TrendSet]
    public let volumeKg: Double

    public var date: String { session.date }
}

/// A set and the exercise it belongs to. The name — not the id — is what
/// `MuscleMap` keys on, so it travels with the row.
public struct TrendSet: Sendable, Equatable {
    public let set: WorkoutSet
    public let exerciseName: String
}

public extension AppDatabase {
    /// Sessions dated `from...to` (ISO, inclusive), oldest first, with their
    /// sets. Query-only; the charts do the arithmetic through HelixCore.
    func trainingTrendSessions(userId: String, from: String, to: String) throws -> [TrendSession] {
        try read { db in
            let sessions = try WorkoutSession
                .filter(Column("user_id") == userId && Column("date") >= from && Column("date") <= to)
                .order(Column("date").asc, Column("started_at").asc)
                .fetchAll(db)
            guard !sessions.isEmpty else { return [] }
            let names = Dictionary(try Exercise.fetchAll(db).map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
            let sets = try WorkoutSet
                .filter(sessions.map(\.id).contains(Column("session_id")))
                .order(Column("fold_order").asc, Column("set_index").asc)
                .fetchAll(db)
            let bySession = Dictionary(grouping: sets, by: \.sessionId)
            return sessions.map { session in
                let own = bySession[session.id] ?? []
                return TrendSession(
                    session: session,
                    sets: own.map { TrendSet(set: $0, exerciseName: names[$0.exerciseId] ?? $0.exerciseId) },
                    volumeKg: WidgetSnapshotBuilder.volume(own)
                )
            }
        }
    }
}
