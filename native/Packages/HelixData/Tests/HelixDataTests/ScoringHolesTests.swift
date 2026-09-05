import Foundation
import GRDB
import HelixCore
import Testing
@testable import HelixData

/// The three inputs `ScoringInputsBuilder` used to leave as holes, now read
/// out of the store — and the writer that scores a day from them.
@Suite("The scoring holes, filled")
struct ScoringHolesTests {

    private let user = "u1"
    private let day = "2026-09-04"

    private func store() throws -> AppDatabase { try AppDatabase.inMemory(deviceId: "device-a") }

    private func inputs(_ db: AppDatabase, date: String? = nil) throws -> ScoringInputs? {
        try db.scoringInputs(
            userId: user, date: date ?? day, hoursAwake: 12, isRestDay: false, todayISO: day, isToday: true
        )
    }

    private func session(_ conn: Database, id: String, date: String, dayKey: String = "legs_a", weight: Double, reps: Int = 10) throws {
        try WorkoutSession(id: id, userId: user, dayKey: dayKey, date: date, startedAt: Date()).insert(conn)
        try WorkoutSet(id: "\(id)-1", sessionId: id, exerciseId: "helix5-hack-squat", setIndex: 1, weightKg: weight, reps: reps).insert(conn)
    }

    private func goals(_ conn: Database, contextMode: String = "normal", contextSince: String? = nil) throws {
        try UserGoalRow(
            id: "g1", userId: user, sleepGoalHours: 8, calorieGoal: 1955,
            proteinGoalG: 190, carbsGoalG: 150, fatGoalG: 60, stepsGoal: 10_000,
            waterGoalMl: 3000, contextMode: contextMode, createdAt: Date(), updatedAt: Date(),
            autoLogSupplements: false, activeProgram: "helix5", dayCutoffHour: 0,
            unitSystem: "metric", reduceMotion: false, timezone: "Asia/Jerusalem", trackRpe: true,
            contextSince: contextSince
        ).insert(conn)
    }

    @Test("tonnage and the trailing average come from the sets, same split only, before the day")
    func volumeAndTrailing() throws {
        let db = try store()
        try db.writer.write { conn in
            try session(conn, id: "today", date: day, weight: 100)          // 1000 kg
            try session(conn, id: "p1", date: "2026-08-28", weight: 80)     //  800 kg
            try session(conn, id: "p2", date: "2026-08-21", weight: 120)    // 1200 kg
            try session(conn, id: "other", date: "2026-08-30", dayKey: "push_a", weight: 500)
            try session(conn, id: "future", date: "2026-09-10", weight: 500)
        }
        let got = try #require(try inputs(db))
        #expect(got.sessionVolumeKg == 1000)
        #expect(got.trailingAvgVolumeKg == 1000, "(800 + 1200) / 2; the other split and the future are out")
    }

    @Test("a unilateral pair is one set at the weaker side, not two")
    func pairScoredOnce() throws {
        let db = try store()
        try db.writer.write { conn in
            try WorkoutSession(id: "s", userId: user, dayKey: "legs_a", date: day).insert(conn)
            try WorkoutSet(id: "l", sessionId: "s", exerciseId: "x", setIndex: 1, weightKg: 40, reps: 10, side: "left", pairId: "p").insert(conn)
            try WorkoutSet(id: "r", sessionId: "s", exerciseId: "x", setIndex: 1, weightKg: 42, reps: 10, side: "right", pairId: "p").insert(conn)
        }
        #expect(try inputs(db)?.sessionVolumeKg == 400)
    }

    @Test("a day with no prior sessions of its split has no baseline, which reads as full charge")
    func noHistory() throws {
        let db = try store()
        try db.writer.write { conn in try session(conn, id: "today", date: day, weight: 100) }
        #expect(try inputs(db)?.trailingAvgVolumeKg == 0)
    }

    @Test("records are counted by the day they were achieved")
    func prsFromTheLedger() throws {
        let db = try store()
        try db.writer.write { conn in
            try WorkoutSession(id: "s", userId: user, dayKey: "legs_a", date: day).insert(conn)
            try PersonalRecordRow(userId: user, exerciseKey: "Hack Squat", axis: "weight", value: 105, achievedOn: day).insert(conn)
            try PersonalRecordRow(userId: user, exerciseKey: "Hack Squat", axis: "e1rm", value: 130, achievedOn: day).insert(conn)
            try PersonalRecordRow(userId: user, exerciseKey: "Bench", axis: "weight", value: 80, achievedOn: "2026-08-01").insert(conn)
        }
        #expect(try inputs(db)?.newPRsToday == 2)
    }

    @Test("the day's own stamp wins over the setting, and a range covers only the dates it says")
    func context() throws {
        let db = try store()
        try db.writer.write { conn in
            try goals(conn, contextMode: "travel", contextSince: "2026-09-02")
            try DailyLogRow(id: "d1", userId: user, date: "2026-09-01", createdAt: Date(), updatedAt: Date(), nutritionException: "Illness", nutritionEstimated: false, sleepOnsetTrouble: false).insert(conn)
            try DailyLogRow(id: "d2", userId: user, date: "2026-09-03", createdAt: Date(), updatedAt: Date(), nutritionEstimated: false, sleepOnsetTrouble: false).insert(conn)
        }
        // Stamped illness beats the travel setting, and an illness day is an exception day.
        let stamped = try #require(try inputs(db, date: "2026-09-01"))
        #expect(stamped.contextMode == "illness")
        #expect(stamped.nutritionException == true)
        // Inside the travel range, unstamped: travel.
        #expect(try inputs(db, date: "2026-09-03")?.contextMode == "travel")
        #expect(try inputs(db, date: "2026-09-03")?.nutritionException == true)
        // Today, inside the range too.
        #expect(try inputs(db)?.contextMode == "travel")
    }

    @Test("a one-day food mode is normal to the scorer, and an unknown label is an exception")
    func foodModesAreNormal() throws {
        let db = try store()
        try db.writer.write { conn in
            try DailyLogRow(id: "d1", userId: user, date: day, createdAt: Date(), updatedAt: Date(), nutritionException: "Refeed", nutritionEstimated: false, sleepOnsetTrouble: false).insert(conn)
        }
        let got = try #require(try inputs(db))
        #expect(got.contextMode == "normal")
        #expect(got.nutritionException == true)
    }

    @Test("v8: the night's onset flag and the LATEST fatigue slot reach the battery")
    func onsetAndFatigue() throws {
        let db = try store()
        try db.writer.write { conn in
            try DailyLogRow(id: "d1", userId: user, date: day, createdAt: Date(), updatedAt: Date(), nutritionEstimated: false, sleepOnsetTrouble: true).insert(conn)
            // Waking Fresh, ended Heavy: the day's figure is Heavy. A legacy
            // `evening` row files as `post` on a training day and still wins.
            try FatigueLogRow(id: "f1", userId: user, date: day, slot: "waking", level: 1).insert(conn)
            try FatigueLogRow(id: "f2", userId: user, date: day, slot: "evening", level: 4).insert(conn)
        }
        let got = try #require(try inputs(db))
        #expect(got.sleepOnsetTrouble == true)
        #expect(got.fatigueLevel == 4)
        #expect(Battery.stressParts(got).fatigueTerm == 3)

        // Nothing logged, nothing flagged: neutral, not a penalty.
        let quiet = try store()
        try quiet.writer.write { conn in
            try DailyLogRow(id: "d1", userId: user, date: day, createdAt: Date(), updatedAt: Date(), nutritionEstimated: false, sleepOnsetTrouble: false).insert(conn)
        }
        let none = try #require(try inputs(quiet))
        #expect(none.sleepOnsetTrouble == false)
        #expect(none.fatigueLevel == nil)
    }

    // MARK: The writer

    @Test("refreshDailyScore scores a day from the store and queues the row")
    func writerWritesAndQueues() throws {
        let db = try store()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let now = Date(timeIntervalSince1970: 1_788_530_400) // 2026-09-04 14:00 UTC
        try db.writer.write { conn in
            try goals(conn)
            try DailyMetricRow(id: "m", userId: user, date: day, steps: 12_000, createdAt: now, updatedAt: now).insert(conn)
            try DailyMetricRow(id: "y", userId: user, date: "2026-09-03", steps: 4_000, createdAt: now, updatedAt: now).insert(conn)
        }
        let today = try #require(try db.refreshDailyScore(userId: user, date: day, now: now, calendar: calendar))
        #expect(today.finalized == false)
        #expect(today.activityScore != nil)
        let yesterday = try #require(try db.refreshDailyScore(userId: user, date: "2026-09-03", now: now, calendar: calendar))
        #expect(yesterday.finalized == true, "a finished day is sealed")
        #expect(try db.pendingOutbox().map(\.idempotencyKey).sorted() == ["row:daily_scores:\(today.id)", "row:daily_scores:\(yesterday.id)"].sorted())
        // An empty past day gets nothing — the ghost guard holds through the writer.
        #expect(try db.refreshDailyScore(userId: user, date: "2026-08-01", now: now, calendar: calendar) == nil)
    }
}
