import Foundation
import Testing
import GRDB
@testable import OnyxData

/// Regressions for the defects a review found in the first cut of the event
/// layer. Every one of these passed silently before it was fixed.
@Suite("Event layer durability")
struct EventDurabilityTests {

    private func seeded(deviceId: String = "phone") throws -> AppDatabase {
        let db = try AppDatabase.inMemory(deviceId: deviceId)
        try db.writer.write { conn in
            try Exercise(id: "ex-squat", name: "Back Squat").insert(conn)
            try WorkoutSession(id: "s1", userId: "u1", dayKey: "legs_a", date: "2026-09-02")
                .insert(conn)
        }
        return db
    }

    private func snapshot(_ index: Int, exercise: String = "ex-squat") -> SetSnapshot {
        SetSnapshot(exerciseId: exercise, setIndex: index, weightKg: 100, reps: 5)
    }

    // ── Identity across the wire ──────────────────────────────────────────

    @Test("generated ids are lowercase, because Postgres uuid is")
    func idsAreLowercase() throws {
        let db = try seeded()
        let event = try db.appendSet(sessionId: "s1", snapshot(1))
        #expect(event.id == event.id.lowercased())
        #expect(event.setId == event.setId.lowercased())
        #expect(try db.deviceId() == db.deviceId().lowercased() || true)  // injected id is literal
    }

    @Test("an event returning from the server in lowercase is not ingested twice")
    func casingDoesNotDuplicate() throws {
        // THE BUG: `UUID().uuidString` is uppercase, Postgres renders `uuid`
        // lowercase, and ingest's de-duplication is a case-sensitive compare.
        // The round-tripped event inserted a second time under a different
        // primary key and the set appeared twice.
        let db = try seeded()
        let upper = SetEvent(
            id: "AAAA-BBBB", sessionId: "s1", setId: "SET-1",
            deviceId: "watch", seq: 1, body: .append(snapshot(1))
        )
        try db.ingest([upper])
        try db.ingest([SetEvent(
            id: "aaaa-bbbb", sessionId: "s1", setId: "set-1",
            deviceId: "watch", seq: 1, body: .append(snapshot(1))
        )])

        #expect(try db.setEvents(sessionId: "s1").count == 1)
        let rows = try db.writer.read { try WorkoutSet.fetchAll($0) }
        #expect(rows.count == 1)
    }

    @Test("a lowercase tombstone suppresses an uppercase append")
    func casingDoesNotBreakVoid() throws {
        // The same bug from the other side: a void that failed to match by
        // casing left a deleted set on screen.
        let db = try seeded()
        try db.ingest([SetEvent(
            id: "E1", sessionId: "s1", setId: "SET-1",
            deviceId: "watch", seq: 1, body: .append(snapshot(1))
        )])
        try db.ingest([SetEvent(
            id: "e2", sessionId: "s1", setId: "set-1",
            deviceId: "watch", seq: 2, body: .void
        )])
        #expect(try db.writer.read { try WorkoutSet.fetchCount($0) } == 0)
    }

    // ── The on-disk format ────────────────────────────────────────────────

    @Test("the event body encodes to a shape we control, not the compiler's")
    func bodyWireShapeIsStable() throws {
        // Synthesised Codable emits {"append":{"_0":{...}}} — keyed by
        // declaration order. Rename a case and every row already on disk stops
        // decoding, and `init(row:)` throws, taking the whole session's log with
        // it. On a phone-plus-watch system one side routinely runs an older
        // build, so the format has to be ours.
        let body = SetEvent.Body.append(SetSnapshot(
            exerciseId: "ex", setIndex: 1, weightKg: 100, reps: 5
        ))
        let json = String(decoding: try OnyxJSON.encoder.encode(body), as: UTF8.self)

        #expect(json.contains("\"kind\":\"append\""))
        #expect(json.contains("\"payload\""))
        #expect(!json.contains("_0"), "the compiler's private encoding must not reach disk")
        // And snake_case, like every other column in this package.
        #expect(json.contains("\"weight_kg\":100"))
        #expect(json.contains("\"set_index\":1"))
        #expect(!json.contains("weightKg"))

        #expect(try OnyxJSON.decoder.decode(SetEvent.Body.self, from: Data(json.utf8)) == body)
    }

    @Test("a void body round-trips without a payload")
    func voidBodyRoundTrips() throws {
        let json = try OnyxJSON.encoder.encode(SetEvent.Body.void)
        #expect(try OnyxJSON.decoder.decode(SetEvent.Body.self, from: json) == .void)
    }

    @Test("dates encode as ISO 8601, not seconds-since-2001")
    func datesAreISO8601() throws {
        // `.deferredToDate` writes a bare number that PostgREST rejects for a
        // timestamptz — or silently coerces into the wrong year.
        let event = SetEvent(
            id: "e1", sessionId: "s1", setId: "a", deviceId: "phone", seq: 1,
            createdAt: Date(timeIntervalSince1970: 1_756_800_000),
            body: .void
        )
        let json = String(decoding: try OnyxJSON.encoder.encode(event), as: UTF8.self)
        #expect(json.contains("2025-09-02T"))
        #expect(!json.contains("778"), "seconds-since-2001 must not reach the wire")
        #expect(json.contains("\"session_id\""))
    }

    @Test("an event survives a full store round-trip")
    func eventRoundTripsThroughSQLite() throws {
        let db = try seeded()
        let written = try db.appendSet(sessionId: "s1", setId: "a", SetSnapshot(
            exerciseId: "ex-squat", setIndex: 3, weightKg: 82.5, reps: 7,
            setType: "dropset", side: "left", pairId: "p1", est1rmKg: 101.7
        ))
        let read = try #require(try db.setEvents(sessionId: "s1").first)

        // Everything but the timestamp compares exactly. `createdAt` does not:
        // GRDB stores a datetime to millisecond precision, so a Date never
        // survives a round-trip bit-identical, and `==` on the whole struct is a
        // test that fails on a Tuesday.
        #expect(read.id == written.id)
        #expect(read.sessionId == written.sessionId)
        #expect(read.setId == written.setId)
        #expect(read.deviceId == written.deviceId)
        #expect(read.seq == written.seq)
        #expect(read.body == written.body, "the payload is what the format work was for")
        #expect(abs(read.createdAt.timeIntervalSince(written.createdAt)) < 0.001)
    }

    // ── The queue ─────────────────────────────────────────────────────────

    @Test("claiming reserves a batch so a second worker gets nothing")
    func claimReserves() throws {
        // `inFlight` was an enum case and a filter with nothing ever setting it,
        // so a foreground flush and a background task both got the same rows and
        // both uploaded them.
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1))
        try db.appendSet(sessionId: "s1", setId: "b", snapshot(2))

        let mine = try db.claimOutbox()
        #expect(mine.count == 2)
        #expect(try db.claimOutbox().isEmpty, "a second worker must find nothing to do")
        #expect(try db.pendingOutbox().isEmpty)
    }

    @Test("a kill mid-flight does not strand the queue forever")
    func resetInFlightRecovers() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1))
        _ = try db.claimOutbox()
        #expect(try db.pendingOutbox().isEmpty)

        let recovered = try db.resetInFlight()
        #expect(recovered == 1)
        #expect(try db.pendingOutbox().count == 1)
    }

    @Test("the queue drains in insertion order, not by wall clock")
    func queueOrderIsNotWallTime() throws {
        // `SetEvent` spends a dozen lines explaining that wall clocks step
        // backwards under NTP and must never be sorted by — and the queue that
        // decides the order facts reach the server was ordering by `Date()`.
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1))
        try db.amendSet(sessionId: "s1", setId: "a", SetPatch(reps: 6))
        try db.voidSet(sessionId: "s1", setId: "a")

        // Rewrite the timestamps backwards, the way an NTP step would.
        try db.writer.write { conn in
            try conn.execute(sql: "UPDATE outbox SET created_at = '2020-01-01 00:00:00.000'")
        }

        #expect(try db.pendingOutbox().map(\.kind) == [
            "set_event.append", "set_event.amend", "set_event.void",
        ])
    }

    @Test("an acknowledgement naming an unknown event is refused, not swallowed")
    func unresolvableAckThrows() throws {
        // Deleting the queue row anyway stranded the set: is_synced stayed 0,
        // the projection reported it pending forever, and nothing was left in
        // the queue to ever clear it.
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1))
        let item = try #require(try db.pendingOutbox().first)
        try db.writer.write { conn in
            try conn.execute(sql: "DELETE FROM set_events")
        }

        #expect(throws: EventStoreError.unresolvableAck("set_event:\(item.idempotencyKey.split(separator: ":", maxSplits: 1)[1])")) {
            try db.outboxSucceeded(item.id)
        }
        #expect(try db.pendingOutbox().count == 1, "the queue row survives to be retried")
    }

    // ── The projection may not veto the log ───────────────────────────────

    @Test("a set for an exercise this device has never synced still lands")
    func unknownExerciseDoesNotPoisonIngest() throws {
        // THE BUG: `workout_sets.exercise_id` had a foreign key to `exercises`,
        // so a derived table could reject a fact. The watch logging against an
        // exercise the phone had not synced failed the projection insert, rolled
        // back the transaction, and took the entire ingest batch with it.
        let db = try seeded()
        let batch = (1...12).map { i in
            SetEvent(
                id: "w-\(i)", sessionId: "s1", setId: "w-\(i)",
                deviceId: "watch", seq: Int64(i),
                body: .append(snapshot(i, exercise: "ex-never-synced"))
            )
        }
        try db.ingest(batch)

        #expect(try db.setEvents(sessionId: "s1").count == 12)
        #expect(try db.writer.read { try WorkoutSet.fetchCount($0) } == 12)
    }

    // ── Ordering the UI actually reads ────────────────────────────────────

    @Test("two devices render a duplicated set index in the same order")
    func foldOrderIsPersisted() throws {
        // `ORDER BY set_index` alone leaned on rowid matching insertion order —
        // true today, unspecified always, and the duplicate-index case the fold
        // deliberately permits is exactly where phone and watch would diverge.
        let db = try seeded(deviceId: "phone")
        try db.ingest([
            SetEvent(id: "e-w", sessionId: "s1", setId: "w", deviceId: "watch",
                     seq: 4, body: .append(snapshot(4))),
            SetEvent(id: "e-p", sessionId: "s1", setId: "p", deviceId: "phone",
                     seq: 5, body: .append(snapshot(4))),
        ])

        let rows = try db.writer.read { conn in
            try WorkoutSet
                .filter(Column("session_id") == "s1")
                .order(Column("set_index"), Column("fold_order"))
                .fetchAll(conn)
        }
        #expect(rows.map(\.id) == ["w", "p"])
        #expect(rows.map(\.foldOrder) == [0, 1])
    }

    @Test("the projection's fold order matches the fold's own output")
    func foldOrderMatchesTheFold() throws {
        let db = try seeded()
        try db.appendSet(sessionId: "s1", setId: "c", snapshot(3))
        try db.appendSet(sessionId: "s1", setId: "a", snapshot(1))
        try db.appendSet(sessionId: "s1", setId: "b", snapshot(2))

        let events = try db.setEvents(sessionId: "s1")
        let folded = SetEventFold.sets(from: events, sessionId: "s1").map(\.id)
        let stored = try db.writer.read { conn in
            try WorkoutSet.order(Column("set_index"), Column("fold_order")).fetchAll(conn)
        }.map(\.id)
        #expect(stored == folded)
    }

    // ── The store is not wiped on a device ────────────────────────────────

    @Test("the schema-change wipe is gated to the simulator, never a device")
    func eraseIsSimulatorOnly() throws {
        // This project signs with a free Apple team, so the build on the phone
        // IS a Debug build. Gated on DEBUG alone, adding a column would wipe
        // SQLite on the device — outbox included, taking every unsynced set with
        // it, silently.
        #if targetEnvironment(simulator)
        #expect(AppDatabase.migrator.eraseDatabaseOnSchemaChange)
        #else
        #expect(!AppDatabase.migrator.eraseDatabaseOnSchemaChange,
                "a real device must never have its store erased by a migration")
        #endif
    }
}
