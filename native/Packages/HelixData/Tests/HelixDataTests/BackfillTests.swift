import Foundation
import GRDB
import HelixCore
import Testing
@testable import HelixData

/// A remote that remembers the order it was spoken to, and whether each pull
/// asked for a delta or the whole table.
private actor Wire: SyncRemote, MirrorPushRemote, MirrorRemote {
    var log: [String] = []
    var rows: [String: [[String: Any]]] = [:]
    var pullFailures: Set<String> = []
    var held = false

    func hold() { held = true }
    func release() { held = false }
    func put(_ table: String, _ objects: [[String: Any]]) { rows[table] = objects }
    func failPulls(of tables: Set<String>) { pullFailures = tables }

    func exerciseCatalogue() async throws -> [RemoteExercise] { [] }
    func upsertSessions(_ rows: [RemoteSessionRow], ignoreDuplicates: Bool) async throws { log.append("push:workout_sessions") }
    func upsertSets(_ rows: [RemoteSetRow]) async throws { log.append("push:workout_sets") }
    func deleteSets(ids: [String]) async throws {}
    func upsertRow<T: Encodable & Sendable>(_ row: T, table: String, conflict: String, nulls: [String]) async throws {
        log.append("push:\(table)")
    }
    func deleteRow(table: String, key: [String: String]) async throws {}

    func select<T: Decodable & Sendable>(_ type: T.Type, request: MirrorRequest) async throws -> [T] {
        while held { try await Task.sleep(for: .milliseconds(5)) }
        if pullFailures.contains(request.table) { throw Unreachable() }
        log.append("pull:\(request.table)" + (request.since == nil ? "" : ":delta"))
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
    func requestAuthorization(read: [String]) async throws -> Bool { true }
    func quantity(_ identifier: String, reduce: HealthReduce, start: Date, end: Date) async throws -> Double? {
        identifier == "HKQuantityTypeIdentifierStepCount" ? 8_000 : nil
    }
    func sleepSamples(start: Date, end: Date) async throws -> [SleepSample] { [] }
}

/// Progress snapshots, collected off whatever executor the coordinator emits on.
private final class Snapshots: @unchecked Sendable {
    private var items: [BackfillProgress] = []
    private let lock = NSLock()
    func append(_ p: BackfillProgress) { lock.lock(); items.append(p); lock.unlock() }
    var all: [BackfillProgress] { lock.lock(); defer { lock.unlock() }; return items }
}

@Suite("The first-launch backfill")
struct BackfillTests {

    private let user = "u1"
    /// 2026-09-04 14:00 UTC.
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

    private func session(_ id: String) -> [String: Any] {
        ["id": id, "user_id": user, "started_at": "2026-09-02T09:00:00Z", "split_day": "legs",
         "day_key": "legs_a", "created_at": "2026-09-02T09:00:00Z", "updated_at": "2026-09-02T10:00:00Z",
         "calories_estimated": false, "avg_bpm_estimated": false]
    }

    private func set(_ id: String, number: Int) -> [String: Any] {
        ["id": id, "session_id": "s1", "exercise_id": "ex-1", "user_id": user,
         "set_number": number, "weight_kg": 100.0, "reps": 8,
         "created_at": "2026-09-02T09:00:00Z", "set_type": "normal"]
    }

    private func seedTraining(_ wire: Wire) async {
        await wire.put("workout_sessions", [session("s1")])
        await wire.put("workout_sets", [set("set-1", number: 1), set("set-2", number: 2)])
        await wire.put("exercises", [["id": "ex-1", "name": "Hack Squat"]])
    }

    @Test("parents come down before children: goals and plans, then exercises, sessions, sets, then the rest")
    func dependencyOrder() async throws {
        let db = try store()
        let wire = Wire()
        await seedTraining(wire)
        try await coordinator(db, wire).backfill { _ in }

        let pulls = await wire.log.filter { $0.hasPrefix("pull:") }.map { String($0.dropFirst(5)) }
        let expected = ["user_goals", "plans", "exercises", "workout_sessions", "workout_sets"]
        #expect(Array(pulls.prefix(5)) == expected)
        #expect(pulls.count == SyncCoordinator.backfillOrder.count)
        #expect(SyncCoordinator.backfillOrder.prefix(5) == expected[...])
        #expect(Set(SyncCoordinator.backfillOrder) == Set(MirrorCatalogue.tables.map(\.name) + ["exercises", "workout_sessions", "workout_sets"]))
    }

    @Test("the history comes down BEFORE Apple is read, and what Apple wrote is still pushed")
    func healthAfterThePull() async throws {
        let db = try store()
        let wire = Wire()
        await seedTraining(wire)
        let health = HealthSync(database: db, reader: ScriptedHealth(), userId: user)
        try await coordinator(db, wire, health: health).backfill { _ in }

        let log = await wire.log
        let lastPull = try #require(log.lastIndex { $0.hasPrefix("pull:") })
        let healthPush = try #require(log.firstIndex(of: "push:daily_metrics"))
        #expect(lastPull < healthPush, "a first launch must not wait behind the Health permission sheet")
        #expect(try db.pendingOutbox().isEmpty)
    }

    @Test("sets land on a fresh store — the catalogue they reference is already there")
    func setsLandOnAFreshStore() async throws {
        let db = try store()
        let wire = Wire()
        await seedTraining(wire)
        try await coordinator(db, wire).backfill { _ in }
        #expect(try db.sets(sessionId: "s1").count == 2)

        // And on an ordinary sync too: the reorder is in `TrainingPuller`.
        let fresh = try store()
        _ = try await TrainingPuller(database: fresh, remote: wire, userId: user, windowDays: nil).refresh(now: now)
        #expect(try fresh.sets(sessionId: "s1").count == 2)
    }

    @Test("an empty ledger means first launch; a finished backfill stamps every table as `backfill`")
    func ledger() async throws {
        let db = try store()
        let wire = Wire()
        await seedTraining(wire)
        let c = coordinator(db, wire)
        #expect(try await c.needsBackfill())

        try await c.backfill { _ in }

        #expect(try await c.needsBackfill() == false)
        let reasons = try await db.writer.read { conn in
            try Set(String.fetchAll(conn, sql: "SELECT DISTINCT reason FROM sync_status WHERE user_id = ?", arguments: [user]))
        }
        #expect(reasons == ["backfill", "push"])
        let last = try await c.lastSync()
        #expect(last.count == SyncCoordinator.backfillOrder.count + 1, "every table in the order, plus the outbox line")
    }

    @Test("progress ticks one row per table, in pull order, and finishes with every count")
    func progress() async throws {
        let db = try store()
        let wire = Wire()
        await seedTraining(wire)
        await wire.put("daily_metrics", [[
            "id": "d1", "user_id": user, "date": "2026-09-04", "steps": 8_000,
            "created_at": "2026-09-04T10:00:00Z", "updated_at": "2026-09-04T10:00:00Z",
        ]])
        let snapshots = Snapshots()
        try await coordinator(db, wire).backfill { snapshots.append($0) }

        let all = snapshots.all
        let first = try #require(all.first)
        #expect(first.tables.map(\.name) == SyncCoordinator.backfillOrder)
        #expect(first.tables.allSatisfy { $0.rows == nil })
        #expect(first.startedAt == now)

        let last = try #require(all.last)
        #expect(last.isFinished)
        #expect(last.tables.allSatisfy { $0.rows != nil && $0.error == nil })
        #expect(last.tablesLanded == SyncCoordinator.backfillOrder.count)
        #expect(last.rowsLanded == 1 + 1 + 2 + 1, "one session, one exercise, two sets, one metrics row")
        #expect(last.tables.first { $0.name == "workout_sets" }?.rows == 2)
        // Landed counts only ever grow between snapshots.
        for (a, b) in zip(all, all.dropFirst()) { #expect(a.tablesLanded <= b.tablesLanded) }
    }

    @Test("re-running clears the cursors, so the delta tables come down whole again — and nothing duplicates")
    func rerunIsIdempotent() async throws {
        let db = try store()
        let wire = Wire()
        await seedTraining(wire)
        await wire.put("daily_metrics", [[
            "id": "d1", "user_id": user, "date": "2026-09-04", "steps": 8_000,
            "created_at": "2026-09-04T10:00:00Z", "updated_at": "2026-09-04T10:00:00Z",
        ]])
        let c = coordinator(db, wire)
        try await c.backfill { _ in }
        // A plain sync afterwards is a delta.
        try await c.syncNow(reason: .foreground)
        #expect(await wire.log.contains("pull:daily_metrics:delta"))
        #expect(await wire.log.contains("pull:workout_sessions:delta"))

        try await c.backfill { _ in }
        let pulls = await wire.log.filter { $0.hasPrefix("pull:daily_metrics") }
        #expect(pulls == ["pull:daily_metrics", "pull:daily_metrics:delta", "pull:daily_metrics"])
        #expect(await wire.log.filter { $0 == "pull:workout_sessions" }.count == 2)

        let metrics = try await db.writer.read { conn in try Int.fetchOne(conn, sql: "SELECT count(*) FROM daily_metrics") }
        #expect(metrics == 1)
        #expect(try db.sets(sessionId: "s1").count == 2)
    }

    @Test("completion rescores the last fourteen days, not two")
    func scoresFourteenDays() async throws {
        let db = try store()
        let wire = Wire()
        await seedTraining(wire)
        var metrics: [[String: Any]] = []
        var day = "2026-09-04"
        for i in 0..<20 {
            metrics.append([
                "id": "m\(i)", "user_id": user, "date": day, "steps": 8_000,
                "created_at": "2026-09-04T10:00:00Z", "updated_at": "2026-09-04T10:00:00Z",
            ])
            day = NightWindow.previousDay(day)
        }
        await wire.put("daily_metrics", metrics)
        try await coordinator(db, wire).backfill { _ in }

        #expect(try db.dailyScore(userId: user, date: "2026-09-04") != nil)
        #expect(try db.dailyScore(userId: user, date: "2026-08-22") != nil, "today − 13")
        #expect(try db.dailyScore(userId: user, date: "2026-08-21") == nil, "today − 14 is outside the window")
        #expect(await wire.log.filter { $0 == "push:daily_scores" }.count == 14)
    }

    @Test("a table that fails leaves the ledger empty, so the next launch backfills again")
    func failureIsNotRecorded() async throws {
        let db = try store()
        let wire = Wire()
        await seedTraining(wire)
        await wire.failPulls(of: ["doms_logs"])
        let c = coordinator(db, wire)
        let snapshots = Snapshots()
        await #expect(throws: SyncCoordinatorError.tablesFailed(["doms_logs": String(describing: Unreachable())])) {
            try await c.backfill { snapshots.append($0) }
        }
        #expect(try await c.needsBackfill(), "nothing was stamped")
        let last = try #require(snapshots.all.last)
        #expect(last.isFinished == false)
        #expect(last.tables.first { $0.name == "doms_logs" }?.error != nil)
        #expect(last.tables.first { $0.name == "daily_logs" }?.rows == 0, "the others still landed")
        // The retry is the same call.
        await wire.failPulls(of: [])
        try await c.backfill { _ in }
        #expect(try await c.needsBackfill() == false)
    }

    @Test("a backfill requested behind a queued sync upgrades that sync rather than joining it as-is")
    func upgradesTheQueuedRun() async throws {
        let db = try store()
        let wire = Wire()
        await seedTraining(wire)
        let c = coordinator(db, wire)
        await wire.hold()
        async let a: Void = c.syncNow(reason: .launch)
        try await Task.sleep(for: .milliseconds(20))
        async let b: Void = c.syncNow(reason: .foreground)
        try await Task.sleep(for: .milliseconds(20))
        async let d: Void = c.backfill { _ in }
        try await Task.sleep(for: .milliseconds(20))
        await wire.release()
        _ = try await (a, b, d)

        let runs = await wire.log.filter { $0 == "pull:daily_logs" || $0 == "pull:daily_logs:delta" }
        #expect(runs.count == 2, "one running, one queued — the backfill joined the queued run")
        let reasons = try await db.writer.read { conn in
            try String.fetchAll(conn, sql: "SELECT reason FROM sync_status WHERE table_name = 'daily_logs' ORDER BY id")
        }
        #expect(reasons == ["launch", "backfill"])
        #expect(await c.state == .idle)
    }
}
