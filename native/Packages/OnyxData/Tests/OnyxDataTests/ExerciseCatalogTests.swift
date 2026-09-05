import Foundation
import GRDB
import Testing
@testable import OnyxData

/// The library's one query.
///
/// `@MainActor` because `AppDatabase.stream` schedules `.immediate`, which GRDB
/// requires be started from the main thread — the same thread a SwiftUI `.task`
/// starts it on.
@Suite("The exercise catalogue")
@MainActor
struct ExerciseCatalogTests {

    private func store() throws -> AppDatabase { try AppDatabase.inMemory(deviceId: "device-a") }

    /// A session, an exercise, and `count` sets of the given type.
    private func seed(
        _ db: AppDatabase, exercise: String, name: String,
        sessionDate: String, sets: Int, setType: String = "normal"
    ) throws {
        try db.writer.write { conn in
            try conn.execute(
                sql: "INSERT OR IGNORE INTO exercises (id, name) VALUES (?, ?)",
                arguments: [exercise, name]
            )
            let sessionId = "s-\(sessionDate)"
            try conn.execute(
                sql: """
                    INSERT OR IGNORE INTO workout_sessions (id, user_id, date)
                    VALUES (?, 'u1', ?)
                    """,
                arguments: [sessionId, sessionDate]
            )
            for index in 0..<sets {
                try conn.execute(
                    sql: """
                        INSERT INTO workout_sets
                            (id, session_id, exercise_id, set_index, weight_kg, reps, set_type)
                        VALUES (?, ?, ?, ?, 20, 10, ?)
                        """,
                    arguments: ["\(exercise)-\(sessionDate)-\(setType)-\(index)", sessionId, exercise, index, setType]
                )
            }
        }
    }

    private func first(_ db: AppDatabase) async throws -> [ExerciseCatalogEntry] {
        for try await rows in db.exerciseCatalogStream() { return rows }
        return []
    }

    @Test("an exercise with no logged set is not in the library")
    func emptyShellsAreExcluded() async throws {
        let db = try store()
        try seed(db, exercise: "e1", name: "Lat Pulldown (Cable)", sessionDate: "2026-09-01", sets: 3)
        try await db.writer.write { conn in
            // The legacy duplicate a rename left behind. It is a real row in the
            // table and it has never been trained.
            try conn.execute(
                sql: "INSERT INTO exercises (id, name) VALUES ('e2', 'Lat Pulldown')"
            )
        }

        let rows = try await first(db)
        #expect(rows.count == 1)
        #expect(rows[0].name == "Lat Pulldown (Cable)")
    }

    @Test("ghost sets are not history")
    func ghostsDoNotCount() async throws {
        let db = try store()
        try seed(db, exercise: "e1", name: "Hack Squat", sessionDate: "2026-09-01", sets: 4, setType: "ghost")

        let rows = try await first(db)
        #expect(rows.isEmpty)
    }

    @Test("the count is every non-ghost set, and the date is the latest")
    func countsAndDate() async throws {
        let db = try store()
        try seed(db, exercise: "e1", name: "Bench Press", sessionDate: "2026-08-20", sets: 3)
        try seed(db, exercise: "e1", name: "Bench Press", sessionDate: "2026-09-02", sets: 2)
        try seed(db, exercise: "e1", name: "Bench Press", sessionDate: "2026-09-02", sets: 1, setType: "ghost")

        let rows = try await first(db)
        #expect(rows.count == 1)
        #expect(rows[0].setCount == 5)
        #expect(rows[0].lastTrained == "2026-09-02")
    }

    @Test("warm-ups count — they are sets that happened")
    func warmupsCount() async throws {
        let db = try store()
        try seed(db, exercise: "e1", name: "Squat", sessionDate: "2026-09-01", sets: 2, setType: "warmup")

        let rows = try await first(db)
        #expect(rows.count == 1)
        #expect(rows[0].setCount == 2)
    }

    @Test("the library is ordered by name, case-insensitively")
    func ordering() async throws {
        let db = try store()
        try seed(db, exercise: "e1", name: "zercher squat", sessionDate: "2026-09-01", sets: 1)
        try seed(db, exercise: "e2", name: "Arnold Press", sessionDate: "2026-09-01", sets: 1)

        let rows = try await first(db)
        #expect(rows.map(\.name) == ["Arnold Press", "zercher squat"])
    }
}
