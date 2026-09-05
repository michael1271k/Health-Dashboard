import Foundation
import GRDB
import OnyxCore
import Testing
@testable import OnyxData

/// Pushing a row whose primary key is several columns.
///
/// ── THE BUG THIS SUITE EXISTS FOR ───────────────────────────────────────────
/// Ten of the twenty-six mirrored tables are keyed locally on their natural key
/// rather than an `id`, because that is the key Postgres resolves them by.
/// `mirrorRow` used to look every row up with `filter(key:)` and a single
/// string, which GRDB answers with `GRDBPrecondition(columns.count == 1)` — a
/// `precondition`, so a CRASH on the drain path, in release as well as debug.
///
/// It had never fired because every table written before Wave 3 (`daily_logs`,
/// `daily_metrics`, `daily_scores`, `user_goals`) happens to be keyed on `id`.
/// The You tab writes three composite ones on its first screen.
@Suite("Pushing a composite-key row")
struct CompositeRowPushTests {

    private let user = "u1"

    private actor RecordingPush: MirrorPushRemote {
        var sent: [(table: String, conflict: String, json: String)] = []

        func upsertRow<T: Encodable & Sendable>(_ row: T, table: String, conflict: String, nulls: [String]) async throws {
            let data = try OnyxJSON.encoder.encode(row)
            sent.append((table, conflict, String(decoding: data, as: UTF8.self)))
        }

        func deleteRow(table: String, key: [String: String]) async throws {}
    }

    private struct IdleSyncRemote: SyncRemote {
        func exerciseCatalogue() async throws -> [RemoteExercise] { [] }
        func upsertSessions(_ rows: [RemoteSessionRow], ignoreDuplicates: Bool) async throws {}
        func upsertSets(_ rows: [RemoteSetRow]) async throws {}
        func deleteSets(ids: [String]) async throws {}
    }

    private func store() throws -> AppDatabase { try AppDatabase.inMemory(deviceId: "device-a") }

    @Test("ten mirrored tables are keyed on more than one column")
    func compositeTablesAreReal() throws {
        // Named rather than counted, so that a table gaining or losing a
        // composite key shows up here as a diff rather than as a number.
        let composite = [
            "daily_targets", "supplement_log", "supplement_dose_overrides",
            "personal_records", "routine_templates", "target_profiles",
            "plan_phase_goals", "plan_phase_volume", "program_day_layout",
            "schedule_overrides",
        ]
        let db = try store()
        try db.writer.read { conn in
            for table in composite {
                let columns = try conn.primaryKey(table).columns
                #expect(columns.count > 1, "\(table)")
            }
        }
    }

    @Test("a plan-phase goal row reaches the remote under its natural key")
    func planPhaseGoalsPush() async throws {
        let db = try store()
        try db.editPlanPhaseGoals(userId: user, planId: "apex51", phase: "cut") { row in
            row.kcal = 1885
            row.proteinG = 170
        }

        let push = RecordingPush()
        let report = try await SyncEngine(database: db, remote: IdleSyncRemote(), rows: push).drain()

        #expect(report.pushed == 1)
        #expect(report.failed == 0)
        let sent = await push.sent
        #expect(sent.count == 1)
        #expect(sent[0].table == "plan_phase_goals")
        #expect(sent[0].conflict == "user_id,plan_id,phase")
        #expect(sent[0].json.contains("\"kcal\":1885"))
    }

    @Test("a per-muscle volume target reaches the remote")
    func planPhaseVolumePush() async throws {
        let db = try store()
        try db.setPlanPhaseVolume(
            userId: user, planId: "apex51", phase: "cut", muscle: "Side delts", targetSets: 9
        )

        let push = RecordingPush()
        let report = try await SyncEngine(database: db, remote: IdleSyncRemote(), rows: push).drain()

        #expect(report.pushed == 1)
        let sent = await push.sent
        #expect(sent[0].table == "plan_phase_volume")
        #expect(sent[0].conflict == "user_id,plan_id,phase,muscle")
        #expect(sent[0].json.contains("\"target_sets\":9"))
        // The muscle name carries a space. The id encoding has to survive real
        // content — which is why the separator is ASCII 31 and not `|` or `:`.
        #expect(sent[0].json.contains("\"muscle\":\"Side delts\""))
    }

    @Test("editing the same composite row five times is one upload")
    func editsCollapse() async throws {
        let db = try store()
        for kcal in [1900, 1910, 1920, 1930, 1940] {
            try db.editPlanPhaseGoals(userId: user, planId: "apex51", phase: "cut") { $0.kcal = kcal }
        }

        #expect(try db.pendingOutbox().count == 1)

        let push = RecordingPush()
        _ = try await SyncEngine(database: db, remote: IdleSyncRemote(), rows: push).drain()

        let sent = await push.sent
        #expect(sent.count == 1)
        // The LAST value, because the payload names the row and the drainer
        // reads it at send time.
        #expect(sent[0].json.contains("\"kcal\":1940"))
    }

    @Test("an id with the wrong number of parts is a missing row, not a crash")
    func malformedIdIsHandled() async throws {
        let db = try store()
        try db.enqueueRowUpsert(table: "plan_phase_goals", id: "just-one-part")

        let push = RecordingPush()
        let report = try await SyncEngine(database: db, remote: IdleSyncRemote(), rows: push).drain()

        // Queued for a row that cannot be resolved: it fails and backs off, the
        // same as a row that was deleted. It does not take the drain down.
        #expect(report.pushed == 0)
        #expect(report.failed == 1)
        #expect(await push.sent.isEmpty)
    }

    @Test("a patch queues the row in the same transaction that writes it")
    func patchQueuesAtomically() throws {
        let db = try store()
        try db.editUserGoals(userId: user) { $0.waterGoalMl = 3200 }

        let queued = try db.pendingOutbox()
        #expect(queued.count == 1)
        #expect(try SyncEngine.rowRef(of: queued[0]).table == "user_goals")
        #expect(try db.userGoals(userId: user)?.waterGoalMl == 3200)
    }

    @Test("a patch changes only the field it names")
    func patchIsNotAWholeRowRewrite() throws {
        let db = try store()
        try db.editUserGoals(userId: user) { $0.calorieGoal = 1955 }
        try db.editUserGoals(userId: user) { $0.reduceMotion = true }

        // The web app's `save()` spread all twelve goal fields on every toggle,
        // so flipping Reduce Motion rewrote the calorie target. This is the test
        // that says the native form does not.
        let row = try #require(try db.userGoals(userId: user))
        #expect(row.calorieGoal == 1955)
        #expect(row.reduceMotion == true)
    }
}
