import Foundation
import GRDB
import OnyxCore
import Testing
@testable import OnyxData

@Suite("TargetResolver — one chain, one tick")
struct TargetResolverTests {
    private let user = "00000000-0000-0000-0000-000000000001"
    private let today = "2026-09-05"

    private func store() throws -> AppDatabase {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        try db.editUserGoals(userId: user) { row in
            row.calorieGoal = 1999; row.proteinGoalG = 170; row.carbsGoalG = 206; row.fatGoalG = 55
            row.stepsGoal = 10000; row.waterGoalMl = 3000; row.sleepGoalHours = 8
            row.activeLever = "custom"
        }
        // The rungs and the schedule are rows since W2: Lever 1 as a profile
        // of kind deficit, and the pinned custom stretch of 20–29 Aug as a
        // period with its goals.
        try db.writer.write { conn in
            try TargetProfileRow(userId: user, key: "lever-1", label: "Lever 1", sort: 11, kcal: 1885, proteinG: 170, carbsG: 182, fatG: 53, stepsGoal: 10000, updatedAt: Date(), kind: "deficit").insert(conn)
            try LeverPeriodRow(userId: user, startsOn: "2026-08-20", profileKey: nil, goals: JSONText(raw: #"{"calorie":1999,"protein":170,"carbs":206,"fat":55,"steps":10000}"#), updatedAt: Date()).insert(conn)
            // A day shape, so a matching override resolves to its key.
            try TargetProfileRow(userId: user, key: "restaurant", label: "Restaurant", sort: 1, kcal: 2400, proteinG: 170, updatedAt: Date(), kind: "day").insert(conn)
        }
        return db
    }

    @Test("the snapshot answers with the row, then the rung, then the day")
    func chain() throws {
        let db = try store()
        var t = try db.targetSnapshot(userId: user).targets(for: today, today: today)
        #expect(t.kcal == 1999 && t.waterMl == 3000 && t.sleepHours == 8 && t.leverId == nil && t.profileKey == nil)

        try db.editUserGoals(userId: user) { $0.activeLever = "lever-1" }
        t = try db.targetSnapshot(userId: user).targets(for: today, today: today)
        #expect(t.kcal == 1885 && t.carbs == 182 && t.leverId == "lever-1")
        // The past keeps its schedule: 25 Aug was the pinned custom stretch.
        #expect(try db.targetSnapshot(userId: user).targets(for: "2026-08-25", today: today).kcal == 1999)

        try db.setDailyTarget(userId: user, date: today) { row in
            row.kcal = 2400; row.proteinG = 170; row.trackCarbs = false; row.trackFat = false
        }
        t = try db.targetSnapshot(userId: user).targets(for: today, today: today)
        #expect(t.kcal == 2400 && t.carbs == nil && t.fat == nil && t.profileKey == "restaurant")
        // Another date is untouched by the override.
        #expect(try db.targetSnapshot(userId: user).targets(for: "2026-09-06", today: today).kcal == 1885)
    }

    @Test("the day profiles are the stored rows and nothing else")
    func storedProfile() throws {
        let db = try store()
        try db.writer.write { db in
            try TargetProfileRow(userId: user, key: "restaurant", label: "Out", sort: 1, kcal: 2600, proteinG: 170, updatedAt: Date(), kind: "day").save(db)
            // Missing figures: skipped, not a 0 kcal day.
            try TargetProfileRow(userId: user, key: "broken", label: "?", sort: 2, updatedAt: Date(), kind: "day").insert(db)
        }
        let snapshot = try db.targetSnapshot(userId: user)
        #expect(snapshot.storedProfiles.filter { $0.kind == .day }.map(\.key) == ["restaurant"])
        // No built-ins behind them since W2; the rung rows are not day shapes.
        #expect(Targets.profiles(stored: snapshot.storedProfiles).map(\.kcal) == [2600])
    }

    @MainActor @Test("the resolver ticks on a lever change without being asked")
    func ticks() async throws {
        let db = try store()
        let resolver = TargetResolver(database: db, userId: user)
        resolver.start()
        // `.immediate`: the first snapshot is already in hand.
        #expect(resolver.targets(for: today, today: today).kcal == 1999)

        try db.editUserGoals(userId: user) { $0.activeLever = "lever-1" }
        for _ in 0..<50 where resolver.targets(for: today, today: today).kcal != 1885 {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(resolver.targets(for: today, today: today).kcal == 1885)
        #expect(resolver.weekWindow(containing: today, today: today).start == "2026-08-30")

        try db.editUserGoals(userId: user) { $0.weekEndDay = 0 }
        for _ in 0..<50 where resolver.snapshot.weekStartDay != 1 {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(resolver.weekWindow(containing: today, today: today).start == "2026-08-31")
        resolver.stop()
    }
}
