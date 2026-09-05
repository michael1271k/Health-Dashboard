import Foundation
import GRDB

/// One row of the exercise library.
///
/// ── WHY IT CARRIES A SET COUNT AND WHY THAT IS THE FILTER ───────────────────
/// The `exercises` table holds 59 rows and 29 of them have never had a single
/// set logged against them: legacy duplicates left behind by renames and merges
/// — `Calf Press` beside `Calf Press (Machine)`, `Lat Pulldown` beside
/// `Lat Pulldown (Cable)`. A library that lists all 59 is half empty shells, and
/// a shell is indistinguishable from a real entry until you open it.
///
/// So the count is not decoration. It is the difference between a library of
/// what you train and a dump of a table.
public struct ExerciseCatalogEntry: Codable, FetchableRecord, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    /// Sets ever logged, ghosts excluded.
    public var setCount: Int
    /// The last day this movement was trained, ISO `yyyy-MM-dd`.
    public var lastTrained: String?

    public init(id: String, name: String, setCount: Int, lastTrained: String?) {
        self.id = id
        self.name = name
        self.setCount = setCount
        self.lastTrained = lastTrained
    }

    public enum CodingKeys: String, CodingKey {
        case id, name
        case setCount = "set_count"
        case lastTrained = "last_trained"
    }
}

public extension AppDatabase {

    /// Every exercise with history, most-trained first within the caller's own
    /// grouping.
    ///
    /// ── THE COUNT IS SQL'S JOB, NOT SWIFT'S ─────────────────────────────────
    /// The alternative is fetching every `workout_sets` row — tens of thousands
    /// after a year — and counting them in memory on the main actor, on a screen
    /// that only ever shows the total. SQLite has done this since 1976.
    ///
    /// ── AND WHY GHOSTS ARE EXCLUDED HERE ────────────────────────────────────
    /// A ghost set counts for nothing, anywhere: it is the logger's placeholder
    /// for a set that was never performed. An exercise whose only rows are
    /// ghosts has no history, and listing it would put back exactly the empty
    /// shells the count exists to remove.
    func exerciseCatalogStream() -> AsyncThrowingStream<[ExerciseCatalogEntry], any Error> {
        stream(ValueObservation.tracking { db in
            try ExerciseCatalogEntry.fetchAll(db, sql: """
                SELECT
                    e.id                       AS id,
                    e.name                     AS name,
                    COUNT(s.id)                AS set_count,
                    MAX(sess.date)             AS last_trained
                FROM exercises e
                LEFT JOIN workout_sets s
                       ON s.exercise_id = e.id
                      AND s.set_type <> 'ghost'
                LEFT JOIN workout_sessions sess
                       ON sess.id = s.session_id
                GROUP BY e.id, e.name
                HAVING COUNT(s.id) > 0
                ORDER BY e.name COLLATE NOCASE
                """)
        })
    }
}
