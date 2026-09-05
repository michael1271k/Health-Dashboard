import Foundation
import GRDB
import Testing
import HelixCore
@testable import HelixData

@Suite("Dashboard layout — stored, streamed, queued")
struct DashboardLayoutStoreTests {
    private let user = "00000000-0000-0000-0000-000000000001"

    @Test("a save writes the phone side, keeps the desktop side, and queues the row once")
    func saveKeepsOtherSurface() throws {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        // A row the web wrote: v4 with a desktop arrangement this app must not lose.
        let webRow = #"{"v":4,"desktop":{"slots":[{"id":"d1","size":"xl","items":["recovery"]}],"hidden":[],"updatedAt":5}}"#
        try db.writer.write { try DashboardLayoutRow(userId: user, layout: JSONText(raw: webRow), updatedAt: Date()).insert($0) }

        var layout = Dashboard.defaultLayout(.phone)
        layout = Dashboard.resizeSlot(layout, slotId: "sl-sleep")
        try db.saveDashboardLayout(userId: user, layout)

        let stored = try db.writer.read { try DashboardLayoutRow.filter(Column("user_id") == user).fetchOne($0) }
        let object = try JSONSerialization.jsonObject(with: Data(stored!.layout.raw.utf8)) as! [String: Any]
        #expect((object["desktop"] as! [String: Any])["slots"] != nil)
        #expect(Dashboard.fromStored(object, surface: .phone) == layout)

        let outbox = try db.pendingOutbox()
        #expect(outbox.map(\.kind) == [SyncKind.rowUpsert])
        let ref = try HelixJSON.decoder.decode(RowRef.self, from: outbox[0].payload)
        #expect(ref.table == "dashboard_layouts")
        #expect(ref.id == user)
    }

    @MainActor @Test("the stream yields the reconciled layout after a save")
    func streamYields() async throws {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        var layout = Dashboard.defaultLayout(.phone)
        layout = Dashboard.removeFace(layout, slotId: "sl-water", index: 0)
        try db.saveDashboardLayout(userId: user, layout)
        for try await stored in db.dashboardLayoutStream(userId: user) {
            #expect(stored?.layout.hidden == [.water])
            break
        }
    }
}

@Suite("Today feed — one build, four cards")
struct TodayFeedBuilderTests {
    private let user = "00000000-0000-0000-0000-000000000001"
    private let tz = TimeZone(identifier: "Europe/London")!
    /// Thu 3 Sep 2026, 08:15 London.
    private var now: Date { ISO8601DateFormatter().date(from: "2026-09-03T07:15:00Z")! }

    @Test("an empty mirror builds an empty feed rather than throwing")
    func emptyMirror() throws {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        let feed = try TodayFeedBuilder(database: db, userId: user, timeZone: tz).build(now: now)
        #expect(feed.snapshot.date == "2026-09-03")
        #expect(feed.insights.map(\.id) == ["training-gap"])
        #expect(feed.weekSoFar.current == .empty)
        #expect(feed.weekSoFar.change == nil)
        #expect(!feed.weeklySummaryReady)
        #expect(feed.weekSoFar.dayOfWeek >= 1 && feed.weekSoFar.dayOfWeek <= 7)
    }

    @Test("sessions split by week and the change names what moved")
    func weekTotals() throws {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        try db.editUserGoals(userId: user) { $0.weekEndDay = 6; $0.activePlan = "apex51" }   // weeks start Sunday
        try db.writer.write { g in
            // This week (Sun 30 Aug…): two sessions. Last week: one, heavier.
            for (id, date, kg) in [("a", "2026-08-31", 100.0), ("b", "2026-09-01", 120.0), ("c", "2026-08-25", 300.0)] {
                try WorkoutSession(id: id, userId: user, dayKey: "upper_a", date: date).insert(g)
                try WorkoutSet(id: "\(id)-1", sessionId: id, exerciseId: "x", setIndex: 1, weightKg: kg, reps: 10).insert(g)
            }
        }
        let feed = try TodayFeedBuilder(database: db, userId: user, timeZone: tz).build(now: now)
        #expect(feed.weekSoFar.weekStart == "2026-08-30")
        #expect(feed.weekSoFar.current.sessions == 2)
        #expect(feed.weekSoFar.previous.sessions == 1)
        #expect(feed.weekSoFar.current.volumeKg == 2200)
        #expect(feed.weekSoFar.previous.volumeKg == 3000)
        // −27% tonnage outranks +1 session.
        #expect(feed.weekSoFar.change?.label == "Tonnage")
        #expect(feed.weekSoFar.change?.direction == .down)
        #expect(feed.weekSoFar.dayOfWeek == 5)
    }
}
