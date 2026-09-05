import Foundation
import GRDB
import HelixCore
import Testing
@testable import HelixData

/// A remote that remembers the ORDER it was spoken to. Every fake here is one
/// actor so the sequence of push and pull is one list, not three.
private actor Wire: SyncRemote, MirrorPushRemote, MirrorRemote {
    var log: [String] = []
    var rows: [String: [[String: Any]]] = [:]
    var failure: (any Error)?
    var pullFailures: Set<String> = []
    /// While true every pull waits, so a test can line callers up behind one run.
    var held = false

    func hold() { held = true }
    func release() { held = false }

    func put(_ table: String, _ objects: [[String: Any]]) { rows[table] = objects }
    func setFailure(_ error: (any Error)?) { failure = error }
    func failPulls(of tables: Set<String>) { pullFailures = tables }

    // SyncRemote
    func exerciseCatalogue() async throws -> [RemoteExercise] { [] }
    func upsertSessions(_ rows: [RemoteSessionRow], ignoreDuplicates: Bool) async throws { log.append("push:workout_sessions") }
    func upsertSets(_ rows: [RemoteSetRow]) async throws { log.append("push:workout_sets") }
    func deleteSets(ids: [String]) async throws {}

    // MirrorPushRemote
    func upsertRow<T: Encodable & Sendable>(_ row: T, table: String, conflict: String, nulls: [String]) async throws {
        if let failure { throw failure }
        log.append("push:\(table)")
    }
    func deleteRow(table: String, key: [String: String]) async throws {}

    // MirrorRemote
    func select<T: Decodable & Sendable>(_ type: T.Type, request: MirrorRequest) async throws -> [T] {
        while held { try await Task.sleep(for: .milliseconds(5)) }
        if let failure { throw failure }
        if pullFailures.contains(request.table) { throw Unreachable() }
        log.append("pull:\(request.table)")
        return try decode(rows[request.table] ?? [])
    }
    func selectIn<T: Decodable & Sendable>(_ type: T.Type, table: String, column: String, values: [String]) async throws -> [T] {
        log.append("pull:\(table)")
        return try decode(rows[table] ?? [])
    }
    private func decode<T: Decodable>(_ objects: [[String: Any]]) throws -> [T] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([T].self, from: JSONSerialization.data(withJSONObject: objects))
    }
}

private struct Unreachable: Error {}

private struct ScriptedHealth: HealthReading {
    var isAvailable = true
    var steps: Double
    func requestAuthorization(read: [String]) async throws -> Bool { true }
    func quantity(_ identifier: String, reduce: HealthReduce, start: Date, end: Date) async throws -> Double? {
        identifier == "HKQuantityTypeIdentifierStepCount" ? steps : nil
    }
    func sleepSamples(start: Date, end: Date) async throws -> [SleepSample] { [] }
}

@Suite("The sync coordinator")
struct SyncCoordinatorTests {

    private let user = "u1"
    /// 2026-09-04 14:00 in the test calendar, so "today" and "yesterday" are
    /// fixed and `hoursAwake` is 7.
    private let now = Date(timeIntervalSince1970: 1_788_530_400)
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    private func store() throws -> AppDatabase { try AppDatabase.inMemory(deviceId: "device-a") }

    private func coordinator(_ db: AppDatabase, _ wire: Wire, health: HealthSync? = nil) -> SyncCoordinator {
        SyncCoordinator(
            database: db,
            engine: SyncEngine(database: db, remote: wire, rows: wire),
            puller: MirrorPuller(database: db, remote: wire, userId: user, windowDays: nil),
            training: TrainingPuller(database: db, remote: wire, userId: user, windowDays: nil),
            health: health,
            userId: user,
            calendar: calendar,
            now: { [now] in now }
        )
    }

    /// Something for the outbox to push: a plan-phase goal, which is a mirrored
    /// row and goes out through the generic `row.upsert`.
    private func queueOneRow(_ db: AppDatabase) throws {
        try db.editPlanPhaseGoals(userId: user, planId: "apex51", phase: "cut") { $0.kcal = 1885 }
    }

    // MARK: Order

    @Test("HealthKit is read, then the outbox is pushed, then every table is pulled")
    func order() async throws {
        let db = try store()
        let wire = Wire()
        let health = HealthSync(database: db, reader: ScriptedHealth(steps: 8_000), userId: user)
        try await coordinator(db, wire, health: health).syncNow(reason: .launch)

        let log = await wire.log
        // The health read wrote today's `daily_metrics`, and that write was
        // PUSHED before anything was pulled — the whole point of the order.
        let firstPush = try #require(log.firstIndex { $0.hasPrefix("push:") })
        let firstPull = try #require(log.firstIndex { $0.hasPrefix("pull:") })
        #expect(log[firstPush...].contains("push:daily_metrics"))
        #expect(firstPush < firstPull)
        #expect(log.contains("pull:workout_sessions"))
        #expect(log.contains("pull:exercises"))
        #expect(log.filter { $0.hasPrefix("pull:") }.count == MirrorCatalogue.tables.count + 2)
    }

    @Test("a reservation left by a killed process is returned and drained")
    func resetInFlightThenDrain() async throws {
        let db = try store()
        try queueOneRow(db)
        // Simulate the kill: claim it and never acknowledge.
        let claimed = try db.claimOutbox()
        #expect(claimed.count == 1)
        #expect(try db.pendingOutbox().isEmpty, "in-flight rows are invisible to a drain")

        let wire = Wire()
        try await coordinator(db, wire).syncNow(reason: .foreground)

        #expect(await wire.log.contains("push:plan_phase_goals"))
        #expect(try db.pendingOutbox().isEmpty)
        let left = try await db.writer.read { conn in try OutboxItem.fetchCount(conn) }
        #expect(left == 0, "acknowledged rows leave the queue")
    }

    @Test("the score rows the sync writes are pushed by the same sync")
    func scoreRowsDrain() async throws {
        let db = try store()
        try await db.writer.write { [now, user] conn in
            try DailyMetricRow(id: "m", userId: user, date: "2026-09-04", steps: 9_000, activeCal: nil, restHr: nil,
                               createdAt: now, updatedAt: now).insert(conn)
        }
        let wire = Wire()
        try await coordinator(db, wire).syncNow(reason: .pull)

        #expect(try db.dailyScore(userId: user, date: "2026-09-04") != nil)
        #expect(await wire.log.contains("push:daily_scores"))
        #expect(try db.pendingOutbox().isEmpty)
    }

    // MARK: State and ledger

    @Test("a successful run leaves the ledger stamped per table and the state idle")
    func ledger() async throws {
        let db = try store()
        let wire = Wire()
        let c = coordinator(db, wire)
        try await c.syncNow(reason: .launch)

        #expect(await c.state == .idle)
        let last = try await c.lastSync()
        #expect(last["daily_logs"] == now)
        #expect(last["workout_sessions"] == now)
        #expect(last["outbox"] == now)
        // 26 catalogue tables, sessions + exercises (no sets: nothing to pull them for), the outbox.
        #expect(last.count == MirrorCatalogue.tables.count + 2 + 1)
    }

    @Test("the ledger is append-only: a second sync adds rows, and max wins")
    func ledgerAppends() async throws {
        let db = try store()
        try db.recordSync(userId: user, table: "daily_logs", rows: 3, reason: "launch", at: now.addingTimeInterval(-3600))
        let wire = Wire()
        try await coordinator(db, wire).syncNow(reason: .foreground)
        let lines = try await db.writer.read { conn in
            try SyncStatusRow.filter(Column("table_name") == "daily_logs").fetchCount(conn)
        }
        #expect(lines == 2)
        #expect(try db.lastSync(userId: user)["daily_logs"] == now)
        #expect(try db.lastSync(userId: "someone-else").isEmpty)
    }

    @Test("a table that fails to pull fails the sync — after everything else ran")
    func partialFailure() async throws {
        let db = try store()
        try await db.writer.write { [now, user] conn in
            try DailyMetricRow(id: "m", userId: user, date: "2026-09-04", steps: 9_000, createdAt: now, updatedAt: now).insert(conn)
        }
        let wire = Wire()
        await wire.failPulls(of: ["doms_logs"])
        let c = coordinator(db, wire)
        await #expect(throws: SyncCoordinatorError.tablesFailed(["doms_logs": String(describing: Unreachable())])) {
            try await c.syncNow(reason: .launch)
        }
        guard case .failed = await c.state else { Issue.record("state should be failed"); return }
        // The other twenty-five still landed and were stamped.
        let last = try await c.lastSync()
        #expect(last["doms_logs"] == nil)
        #expect(last["daily_logs"] == now)
        // And today's score was still written.
        #expect(try db.dailyScore(userId: user, date: "2026-09-04") != nil)
    }

    @Test("the network being gone stops the run at the push")
    func offline() async throws {
        let db = try store()
        try queueOneRow(db)
        let wire = Wire()
        await wire.setFailure(Unreachable())
        let c = coordinator(db, wire)
        // The drainer swallows a per-row failure into its report; the pulls
        // then throw, which is what surfaces.
        await #expect(throws: (any Error).self) { try await c.syncNow(reason: .pull) }
        guard case .failed = await c.state else { Issue.record("state should be failed"); return }
        #expect(try db.pendingOutbox().isEmpty == false, "the row waits for the next drain")
    }

    // MARK: Coalescing

    @Test("a call while running is queued once; a third joins it")
    func coalesces() async throws {
        let db = try store()
        let wire = Wire()
        let c = coordinator(db, wire)
        await wire.hold()
        async let a: Void = c.syncNow(reason: .launch)
        async let b: Void = c.syncNow(reason: .foreground)
        async let d: Void = c.syncNow(reason: .pull)
        try await Task.sleep(for: .milliseconds(50))
        await wire.release()
        _ = try await (a, b, d)

        let runs = await wire.log.filter { $0 == "pull:daily_logs" }.count
        #expect(runs == 2, "one running, one queued, the third joined the queued one")
        #expect(await c.state == .idle)
        // And it is reusable afterwards: the handover left nothing dangling.
        try await c.syncNow(reason: .pull)
        #expect(await wire.log.filter { $0 == "pull:daily_logs" }.count == 3)
    }

    // MARK: Realtime

    @Test("a realtime note is a sync through the queue, without the HealthKit read")
    func realtimeRefresh() async throws {
        let db = try store()
        let wire = Wire()
        await wire.put("daily_metrics", [[
            "id": "m1", "user_id": user, "date": "2026-09-04", "steps": 12_000,
            "created_at": "2026-09-04T10:00:00Z", "updated_at": "2026-09-04T10:00:00Z",
        ]])
        let health = HealthSync(database: db, reader: ScriptedHealth(steps: 8_000), userId: user)
        let c = coordinator(db, wire, health: health)
        await c.refresh(table: "daily_metrics")

        let log = await wire.log
        #expect(log.contains("pull:daily_metrics"))
        #expect(!log.contains("push:daily_metrics"), "Apple was not read for a server-side change")
        #expect(try db.lastSync(userId: user)["daily_metrics"] == now)
        let stamped = try await db.writer.read { conn in
            try SyncStatusRow.filter(Column("table_name") == "daily_metrics").fetchOne(conn)?.reason
        }
        #expect(stamped == "realtime:daily_metrics")
        // The pulled row scored today, and the score went out.
        #expect(try db.dailyScore(userId: user, date: "2026-09-04") != nil)
        #expect(log.contains("push:daily_scores"))
    }

    @Test("stop abandons the run and refuses a late socket")
    func stopAbandons() async throws {
        let db = try store()
        let wire = Wire()
        await wire.hold()
        let c = coordinator(db, wire)
        let run = Task { try await c.syncNow(reason: .launch) }
        try await Task.sleep(for: .milliseconds(30))
        await c.stop()
        await wire.release()
        await #expect(throws: (any Error).self) { try await run.value }
        #expect(try db.lastSync(userId: user)["daily_logs"] == nil, "a cancelled run stamps nothing")
    }
}

// MARK: - Pagination

@Suite("Pagination")
struct PaginationTests {

    @Test("pages are asked for until a short one, and every row is kept")
    func untilShortPage() async throws {
        let served = Array(0..<2_277)
        let asked = Box<[(Int, Int)]>([])
        let all: [Int] = try await Pagination.all(pageSize: 1000) { from, to in
            asked.withLock { $0.append((from, to)) }
            return Array(served[min(from, served.count)..<min(to + 1, served.count)])
        }
        #expect(all == served)
        #expect(asked.withLock { $0 }.map { $0.0 } == [0, 1000, 2000])
        #expect(asked.withLock { $0 }.map { $0.1 } == [999, 1999, 2999])
    }

    @Test("an exact multiple asks for one empty page, never loses the last row")
    func exactMultiple() async throws {
        let served = Array(0..<2_000)
        let all: [Int] = try await Pagination.all(pageSize: 1000) { from, to in
            Array(served[min(from, served.count)..<min(to + 1, served.count)])
        }
        #expect(all.count == 2_000)
    }

    @Test("an in-list is chunked at 200")
    func chunks() {
        let ids = (0..<450).map(String.init)
        let chunks = Pagination.chunks(ids, size: Pagination.inListLimit)
        #expect(chunks.map(\.count) == [200, 200, 50])
        #expect(chunks.flatMap { $0 } == ids)
        #expect(Pagination.chunks([String](), size: 200).isEmpty)
    }
}

/// A lock for the page recorder above; `Mutex` from Synchronization needs
/// macOS 15 and the package floor is 14.
private final class Box<T>: @unchecked Sendable {
    private var value: T
    private let lock = NSLock()
    init(_ value: T) { self.value = value }
    func withLock<R>(_ body: (inout T) -> R) -> R {
        lock.lock(); defer { lock.unlock() }
        return body(&value)
    }
}
