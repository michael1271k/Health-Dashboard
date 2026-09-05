import Foundation
import GRDB
import Testing
import OnyxCore
@testable import OnyxData

/// The seven-day strip's reader: two tables merged, and a fixed axis.
///
/// The gap-filling is the part worth testing. A strip built from whatever rows
/// the query happened to return draws six columns for a week with one untracked
/// day and closes the gap up — the reading becomes "six days, all logged"
/// rather than "seven days, one missed", and nothing about the picture says so.
@Suite("The nutrition week")
@MainActor
struct NutritionWeekTests {

    private let user = "u1"

    private func store() throws -> AppDatabase { try AppDatabase.inMemory(deviceId: "device-a") }

    /// One `nutrition_entries` row for a date, the way the ingest writes it.
    private func log(_ db: AppDatabase, _ date: String, kcal: Double, protein: Double = 0, carbs: Double = 0, fat: Double = 0) throws {
        try db.setManualMacros(
            userId: user, date: date,
            calories: kcal, proteinG: protein, carbsG: carbs, fatG: fat, phase: nil
        )
    }

    private func week(_ db: AppDatabase, from: String, to: String) async throws -> [NutritionDay] {
        for try await days in db.nutritionWeekStream(userId: user, from: from, to: to) { return days }
        return []
    }

    @Test("every day in the range is present, logged or not")
    func fillsTheRange() async throws {
        let db = try store()
        try log(db, "2026-09-01", kcal: 1900, protein: 170, carbs: 180, fat: 50)
        try log(db, "2026-09-04", kcal: 2100, protein: 160, carbs: 210, fat: 55)

        let days = try await week(db, from: "2026-08-30", to: "2026-09-05")
        #expect(days.count == 7)
        #expect(days.map(\.date) == [
            "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
            "2026-09-03", "2026-09-04", "2026-09-05",
        ])
        #expect(days.filter(\.isTracked).map(\.date) == ["2026-09-01", "2026-09-04"])
        // Untracked is `nil`, never a zero — a day nobody logged and a day of
        // fasting are not the same fact.
        #expect(days[0].kcal == nil)
        #expect(days[2].kcal == 1900)
        #expect(days[2].proteinG == 170)
    }

    @Test("a day with only flags is still a day")
    func flagsWithoutEntries() async throws {
        let db = try store()
        try db.editDailyLog(userId: user, date: "2026-09-02") { $0.nutritionException = "Event" }
        try db.editDailyLog(userId: user, date: "2026-09-03") { $0.nutritionEstimated = true }

        let days = try await week(db, from: "2026-09-01", to: "2026-09-03")
        #expect(days.count == 3)
        #expect(days[1].exception == "Event")
        #expect(days[1].isTracked == false)
        #expect(days[2].estimated)
    }

    @Test("flags and figures for one day arrive on one row")
    func mergesBothTables() async throws {
        let db = try store()
        try log(db, "2026-09-02", kcal: 2400, protein: 150, carbs: 250, fat: 70)
        try db.editDailyLog(userId: user, date: "2026-09-02") { $0.nutritionException = "Social" }

        let days = try await week(db, from: "2026-09-02", to: "2026-09-02")
        #expect(days.count == 1)
        #expect(days[0].kcal == 2400)
        #expect(days[0].exception == "Social")
    }

    @Test("a reversed or unparseable range yields nothing, not one column")
    func rejectsABadRange() async throws {
        let db = try store()
        try log(db, "2026-09-02", kcal: 2000)
        #expect(try await week(db, from: "2026-09-05", to: "2026-09-01").isEmpty)
        #expect(try await week(db, from: "not-a-date", to: "2026-09-05").isEmpty)
    }

    @Test("another user's day is not in this user's week")
    func scopedToTheUser() async throws {
        let db = try store()
        try db.setManualMacros(
            userId: "someone-else", date: "2026-09-02",
            calories: 3000, proteinG: 100, carbsG: 300, fatG: 100, phase: nil
        )
        let days = try await week(db, from: "2026-09-01", to: "2026-09-03")
        #expect(days.allSatisfy { !$0.isTracked })
    }
}
