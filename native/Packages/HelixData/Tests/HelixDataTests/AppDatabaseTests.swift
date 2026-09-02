import Foundation
import Testing
import GRDB
@testable import HelixData

@Suite("Local store")
struct AppDatabaseTests {

    private func seededDatabase() throws -> AppDatabase {
        let db = try AppDatabase.inMemory()
        try db.writer.write { conn in
            try Exercise(id: "ex-squat", name: "Back Squat", primaryMuscle: "quads").insert(conn)
            try Exercise(id: "ex-crunch", name: "Reverse Crunch", primaryMuscle: "abs",
                         isBodyweight: true).insert(conn)
            try WorkoutSession(
                id: "s1", userId: "u1", dayKey: "legs_a", date: "2026-09-02"
            ).insert(conn)
        }
        return db
    }

    @Test("migrations apply and the schema is usable")
    func migrationsApply() throws {
        let db = try seededDatabase()
        #expect(try db.exercises().count == 2)
        #expect(try db.sessions(on: "2026-09-02").count == 1)
        #expect(try db.sessions(on: "2026-09-01").isEmpty)
    }

    @Test("a zero-kilogram set is stored as a real set, not discarded")
    func bodyweightSetSurvives() throws {
        // The unloaded-work blind spot, guarded at the storage layer. A 0 kg set
        // is a bodyweight set; it must round-trip unchanged. Whether it has a
        // 1RM is `Epley`'s decision, made by returning nil — never the store's,
        // made by dropping the row.
        let db = try seededDatabase()
        let set = WorkoutSet(
            id: "set-1", sessionId: "s1", exerciseId: "ex-crunch",
            setIndex: 0, weightKg: 0, reps: 17
        )
        try db.saveSet(set)

        let stored = try db.writer.read { try WorkoutSet.fetchOne($0, key: "set-1") }
        let unwrapped = try #require(stored)
        #expect(unwrapped.weightKg == 0)
        #expect(unwrapped.reps == 17)
        #expect(unwrapped.est1rmKg == nil, "an unloaded set has no estimate to store")
    }

    @Test("saving a set enqueues exactly one outbox item, in the same transaction")
    func saveEnqueues() throws {
        let db = try seededDatabase()
        try db.saveSet(WorkoutSet(
            id: "set-1", sessionId: "s1", exerciseId: "ex-squat",
            setIndex: 0, weightKg: 100, reps: 5
        ))

        let queue = try db.pendingOutbox()
        #expect(queue.count == 1)
        #expect(queue[0].kind == "set.upsert")
        #expect(queue[0].idempotencyKey == "set.upsert:set-1")
        #expect(queue[0].status == .pending)

        // And the row itself is flagged until the server confirms.
        let stored = try db.writer.read { try WorkoutSet.fetchOne($0, key: "set-1") }
        #expect(stored?.isPendingSync == true)
    }

    @Test("editing a queued set replaces its payload rather than queuing twice")
    func editCollapsesToOneWrite() throws {
        let db = try seededDatabase()
        var set = WorkoutSet(
            id: "set-1", sessionId: "s1", exerciseId: "ex-squat",
            setIndex: 0, weightKg: 100, reps: 5
        )
        try db.saveSet(set)
        set.reps = 6
        try db.saveSet(set)

        let queue = try db.pendingOutbox()
        #expect(queue.count == 1, "a corrected set must not sync twice")

        let payload = try JSONDecoder().decode(WorkoutSet.self, from: queue[0].payload)
        #expect(payload.reps == 6, "the queue carries the latest value, not the first")
    }

    @Test("a failed write is kept and counted, never dropped")
    func failuresAreKept() throws {
        let db = try seededDatabase()
        try db.saveSet(WorkoutSet(
            id: "set-1", sessionId: "s1", exerciseId: "ex-squat",
            setIndex: 0, weightKg: 100, reps: 5
        ))
        let item = try #require(try db.pendingOutbox().first)

        try db.outboxFailed(item.id, error: "offline")
        try db.outboxFailed(item.id, error: "offline")

        // A workout that cannot sync is a workout you still did. The queue does
        // not give up on it, because giving up loses data silently.
        let after = try #require(try db.pendingOutbox().first)
        #expect(after.attempts == 2)
        #expect(after.lastError == "offline")
        #expect(after.status == .failed)
    }

    @Test("a confirmed write leaves the queue")
    func successClearsTheQueue() throws {
        let db = try seededDatabase()
        try db.saveSet(WorkoutSet(
            id: "set-1", sessionId: "s1", exerciseId: "ex-squat",
            setIndex: 0, weightKg: 100, reps: 5
        ))
        let item = try #require(try db.pendingOutbox().first)

        try db.outboxSucceeded(item.id)
        #expect(try db.pendingOutbox().isEmpty)
    }

    @Test("deleting a session takes its sets with it")
    func cascadeDelete() throws {
        let db = try seededDatabase()
        try db.saveSet(WorkoutSet(
            id: "set-1", sessionId: "s1", exerciseId: "ex-squat",
            setIndex: 0, weightKg: 100, reps: 5
        ))

        _ = try db.writer.write { try WorkoutSession.deleteOne($0, key: "s1") }
        let remaining = try db.writer.read { try WorkoutSet.fetchCount($0) }
        #expect(remaining == 0, "foreign keys must be on, or orphan sets accumulate")
    }

    @Test("column names match Postgres exactly")
    func columnNamesMatchPostgres() throws {
        // A row decoded from PostgREST is inserted here without translation, so
        // a camelCase slip does not fail loudly — it fails as a NULL column and
        // a missing number on a screen.
        let db = try AppDatabase.inMemory()
        let columns = try db.writer.read { conn in
            try conn.columns(in: "workout_sets").map(\.name)
        }
        #expect(columns.contains("weight_kg"))
        #expect(columns.contains("set_index"))
        #expect(columns.contains("est_1rm_kg"))
        #expect(columns.contains("pair_id"))
        #expect(!columns.contains("weightKg"))
    }
}

@Suite("Keychain session storage")
struct KeychainAuthStorageTests {
    @Test("stores, retrieves and removes a session blob")
    func roundTrips() throws {
        // A distinct service per run so a failed test cannot poison the next.
        let storage = KeychainAuthStorage(service: "helix.tests.\(UUID().uuidString)")
        let payload = Data(#"{"access_token":"abc"}"#.utf8)

        #expect(try storage.retrieve(key: "session") == nil, "absent is not an error")

        try storage.store(key: "session", value: payload)
        #expect(try storage.retrieve(key: "session") == payload)

        // Overwrite must replace, not duplicate — a second keychain item with
        // the same account would make retrieval order-dependent.
        let updated = Data(#"{"access_token":"def"}"#.utf8)
        try storage.store(key: "session", value: updated)
        #expect(try storage.retrieve(key: "session") == updated)

        try storage.remove(key: "session")
        #expect(try storage.retrieve(key: "session") == nil)

        // Removing what is already gone is not a failure: sign-out runs on paths
        // where there may be nothing to sign out of.
        try storage.remove(key: "session")
    }
}
