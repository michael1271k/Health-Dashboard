import Foundation
import Testing
import GRDB
@testable import OnyxData

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
        try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-crunch", setIndex: 0, weightKg: 0, reps: 17
        ))

        let stored = try db.writer.read { try WorkoutSet.fetchOne($0, key: "set-1") }
        let unwrapped = try #require(stored)
        #expect(unwrapped.weightKg == 0)
        #expect(unwrapped.reps == 17)
        #expect(unwrapped.est1rmKg == nil, "an unloaded set has no estimate to store")
    }

    @Test("logging a set enqueues exactly one outbox item, in the same transaction")
    func saveEnqueues() throws {
        let db = try seededDatabase()
        let event = try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 0, weightKg: 100, reps: 5
        ))

        let queue = try db.pendingOutbox()
        #expect(queue.count == 1)
        #expect(queue[0].kind == "set_event.append")
        // The event's own id is the key. Events are immutable, so a retry is a
        // true no-op — unlike a row upsert, which has to guess whether the
        // payload it is holding is still current.
        #expect(queue[0].idempotencyKey == "set_event:\(event.id)")
        #expect(queue[0].status == .pending)

        // And the projected row is flagged until the server confirms.
        let stored = try db.writer.read { try WorkoutSet.fetchOne($0, key: "set-1") }
        #expect(stored?.isPendingSync == true)
    }

    @Test("an edit appends a second fact rather than overwriting the first")
    func editAppendsRatherThanReplaces() throws {
        // This REVERSES the pre-event behaviour, where a second save replaced
        // the queued payload. It has to: with two devices, "replace the queued
        // write" is exactly the operation that loses the other device's edit.
        // Two events cost two tiny idempotent rows and can never disagree.
        let db = try seededDatabase()
        try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 0, weightKg: 100, reps: 5
        ))
        try db.amendSet(sessionId: "s1", setId: "set-1", SetPatch(reps: 6))

        let queue = try db.pendingOutbox()
        #expect(queue.count == 2)
        #expect(queue.map(\.kind) == ["set_event.append", "set_event.amend"])

        // The projection shows the corrected value.
        let stored = try db.writer.read { try WorkoutSet.fetchOne($0, key: "set-1") }
        #expect(stored?.reps == 6)
    }

    @Test("an amend that changes nothing is refused")
    func emptyAmendRefused() throws {
        let db = try seededDatabase()
        try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 0, weightKg: 100, reps: 5
        ))
        #expect(throws: EventStoreError.emptyPatch) {
            try db.amendSet(sessionId: "s1", setId: "set-1", SetPatch())
        }
        #expect(try db.setEvents(sessionId: "s1").count == 1)
    }

    @Test("a failed write is kept and counted, never dropped")
    func failuresAreKept() throws {
        let db = try seededDatabase()
        try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 0, weightKg: 100, reps: 5
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
        try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 0, weightKg: 100, reps: 5
        ))
        let item = try #require(try db.pendingOutbox().first)

        try db.outboxSucceeded(item.id)
        #expect(try db.pendingOutbox().isEmpty)
    }

    @Test("deleting a session takes its sets with it")
    func cascadeDelete() throws {
        let db = try seededDatabase()
        try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 0, weightKg: 100, reps: 5
        ))

        _ = try db.writer.write { try WorkoutSession.deleteOne($0, key: "s1") }
        let remaining = try db.writer.read { try WorkoutSet.fetchCount($0) }
        #expect(remaining == 0, "foreign keys must be on, or orphan sets accumulate")
    }

    @Test("the local schema is snake_case throughout")
    func localSchemaIsSnakeCase() throws {
        // ── THIS DOES NOT CHECK POSTGRES, AND ITS OLD NAME SAID IT DID ──────
        // It was called `columnNamesMatchPostgres` and asserted that the local
        // schema contains `set_index` and does not contain `weightKg` — a
        // comparison of the local schema with itself, which passes forever
        // regardless of server-side drift. Postgres actually calls that column
        // `set_number`; see the header of `Models.swift` for the full diff.
        //
        // A real parity test has to fetch the PostgREST OpenAPI definition (or
        // diff a checked-in snapshot of it), and it belongs with the sync layer.
        // This one now claims only what it can prove.
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

    // ── Duration: the pause comes off, and a long idle is not training ──────

    @Test("closeSession subtracts the pause")
    func closeSubtractsPause() throws {
        let db = try seededDatabase()
        let started = Date(timeIntervalSince1970: 1_757_000_000)
        try db.writer.write { conn in
            try conn.execute(
                sql: "UPDATE workout_sessions SET started_at = ? WHERE id = ?",
                arguments: [started, "s1"]
            )
        }
        try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 1, weightKg: 60, reps: 8
        ))
        try db.pauseSession("s1")
        // The pause is measured from the event's own wall stamp, so the two
        // clock events are rewritten to a known interval.
        try db.writer.write { conn in
            try conn.execute(
                sql: "UPDATE set_events SET created_at = ? WHERE kind = 'pause'",
                arguments: [started.addingTimeInterval(10 * 60)]
            )
        }
        try db.resumeSession("s1")
        try db.writer.write { conn in
            try conn.execute(
                sql: "UPDATE set_events SET created_at = ? WHERE kind = 'resume'",
                arguments: [started.addingTimeInterval(40 * 60)]
            )
        }
        #expect(try db.pausedSeconds(sessionId: "s1", now: started) == 30 * 60)

        let closed = try db.closeSession(id: "s1", endedAt: started.addingTimeInterval(90 * 60))
        // 90 minutes of clock, 30 of them paused. The append's own stamp is the
        // real `Date()` and therefore outside `[started, ended]`, so the
        // long-idle guard has no last set to reason about and stays out of it —
        // which is the behaviour a session whose events predate this rule needs.
        #expect(closed?.durationMin == 60)
    }

    @Test("a deck left open for hours records the work, not the wall clock")
    func longIdleIsNotTraining() throws {
        // The Sept 6 shape, on the phone: an hour of work, committed at 17:12.
        let db = try seededDatabase()
        let started = Date(timeIntervalSince1970: 1_757_000_000)
        try db.writer.write { conn in
            try conn.execute(
                sql: "UPDATE workout_sessions SET started_at = ? WHERE id = ?",
                arguments: [started, "s1"]
            )
        }
        try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 1, weightKg: 60, reps: 8
        ))
        try db.writer.write { conn in
            try conn.execute(
                sql: "UPDATE set_events SET created_at = ? WHERE kind = 'append'",
                arguments: [started.addingTimeInterval(60 * 60)]
            )
        }
        let closed = try db.closeSession(
            id: "s1", endedAt: started.addingTimeInterval(386 * 60), restTargetSec: 120
        )
        // Not 386. The work (60) plus one rest (2).
        #expect(closed?.durationMin == 62)
    }

    @Test("a pause event is not queued for upload")
    func clockEventsStayLocal() throws {
        // `set_events` is local-only and the drainer reconciles ROWS: a queued
        // clock event would make it send a delete for an id that is not a set.
        let db = try seededDatabase()
        try db.appendSet(sessionId: "s1", setId: "set-1", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 1, weightKg: 60, reps: 8
        ))
        let before = try db.writer.read { conn in try OutboxItem.fetchCount(conn) }
        try db.pauseSession("s1")
        try db.resumeSession("s1")
        #expect(try db.writer.read { conn in try OutboxItem.fetchCount(conn) } == before)
        #expect(try db.setEvents(sessionId: "s1").count == 3, "the events are still in the log")
    }
}

@Suite("Keychain session storage")
struct KeychainAuthStorageTests {
    @Test("stores, retrieves and removes a session blob")
    func roundTrips() throws {
        // A distinct service per run so a failed test cannot poison the next.
        let storage = KeychainAuthStorage(service: "onyx.tests.\(UUID().uuidString)")
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
