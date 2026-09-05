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
            row.activeLever = LeverId.custom.rawValue
        }
        return db
    }

    @Test("the snapshot answers with the row, then the rung, then the day")
    func chain() throws {
        let db = try store()
        var t = try db.targetSnapshot(userId: user).targets(for: today, today: today)
        #expect(t.kcal == 1999 && t.waterMl == 3000 && t.sleepHours == 8 && t.leverId == .custom && t.profileKey == nil)

        try db.editUserGoals(userId: user) { $0.activeLever = LeverId.lever1.rawValue }
        t = try db.targetSnapshot(userId: user).targets(for: today, today: today)
        #expect(t.kcal == 1885 && t.carbs == 182 && t.leverId == .lever1)
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

    @Test("a stored profile row shadows the built-in with the same key")
    func storedProfile() throws {
        let db = try store()
        try db.writer.write { db in
            try TargetProfileRow(userId: user, key: "restaurant", label: "Out", sort: 1, kcal: 2600, proteinG: 170, updatedAt: Date()).insert(db)
            // Missing figures: skipped, not a 0 kcal day.
            try TargetProfileRow(userId: user, key: "broken", label: "?", sort: 2, updatedAt: Date()).insert(db)
        }
        let snapshot = try db.targetSnapshot(userId: user)
        #expect(snapshot.storedProfiles.map(\.key) == ["restaurant"])
        #expect(Targets.profiles(stored: snapshot.storedProfiles).map(\.kcal) == [2600, 2150])
    }

    @MainActor @Test("the resolver ticks on a lever change without being asked")
    func ticks() async throws {
        let db = try store()
        let resolver = TargetResolver(database: db, userId: user)
        resolver.start()
        // `.immediate`: the first snapshot is already in hand.
        #expect(resolver.targets(for: today, today: today).kcal == 1999)

        try db.editUserGoals(userId: user) { $0.activeLever = LeverId.lever1.rawValue }
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
