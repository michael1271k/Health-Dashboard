import Foundation
import GRDB
import OnyxCore
import Testing
@testable import OnyxData

/// The row → series rules of readiness v9, on the phone — the same cases
/// `src/tests/readiness-history.test.ts` pins on the web, so the two builders
/// have one written contract. The formulas downstream are vector-proven; this
/// is the half a vector cannot see.
@Suite("Readiness history — rows onto the 49-day calendar")
struct ReadinessHistoryTests {
    private let user = "u1"
    private let day = "2026-09-05"

    private func seeded() throws -> AppDatabase {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        let now = Date()
        try db.writer.write { conn in
            func log(_ id: String, _ date: String, hrv: Double?, rhr: Int?) throws {
                try DailyLogRow(id: id, userId: user, date: date, avgRestHeartRate: rhr, createdAt: now, updatedAt: now,
                                hrvMs: hrv, nutritionEstimated: false, sleepOnsetTrouble: false).insert(conn)
            }
            try log("l1", "2026-09-05", hrv: 48, rhr: 55)
            try log("l2", "2026-09-04", hrv: nil, rhr: 54)
            try log("l3", "2026-08-01", hrv: 62, rhr: 51)
            try log("l4", "2026-06-01", hrv: 99, rhr: 99)                 // outside the window
            try DailyMetricRow(id: "m1", userId: user, date: "2026-09-04", restHr: 57, createdAt: now, updatedAt: now).insert(conn)  // beats the log's 54
            try DailyMetricRow(id: "m2", userId: user, date: "2026-09-03", restHr: 53, createdAt: now, updatedAt: now).insert(conn)  // the only reading that day
            try WorkoutSession(id: "s1", userId: user, dayKey: "legs_a", date: "2026-09-05", durationMin: 60, sessionRpe: 8).insert(conn)
            try WorkoutSession(id: "s2", userId: user, dayKey: "legs_a", date: "2026-09-04", durationMin: 50, sessionRpe: nil).insert(conn)
            try WorkoutSession(id: "s3", userId: user, dayKey: "legs_a", date: "2026-06-01", durationMin: 60, sessionRpe: 9).insert(conn)
            try CardioLogRow(id: "c1", userId: user, date: "2026-09-04", kind: "walk", durationMin: 30, effort: 3).insert(conn)
            try CardioLogRow(id: "c2", userId: user, date: "2026-09-03", kind: "walk", durationMin: 30, effort: nil).insert(conn)
            // Another user's rows never leak in.
            try DailyLogRow(id: "x1", userId: "u2", date: "2026-09-05", avgRestHeartRate: 99, createdAt: now, updatedAt: now,
                            hrvMs: 99, nutritionEstimated: false, sleepOnsetTrouble: false).insert(conn)
        }
        return db
    }

    private func history(_ db: AppDatabase) throws -> ReadinessHistory {
        try db.read { conn in try AppDatabase.readinessHistory(conn, userId: user, date: day) }
    }

    @Test("49 consecutive dates ending on the day itself")
    func calendar() {
        let dates = AppDatabase.readinessHistoryDates(day)
        #expect(dates.count == Readiness.constants.historyDays)
        #expect(dates.first == "2026-07-19")
        #expect(dates.last == day)
        #expect(dates[41] == "2026-08-29")
    }

    @Test("every series lies on the calendar, newest last, out-of-window rows dropped")
    func series() throws {
        let h = try history(try seeded())
        #expect(h.hrv.count == 49 && h.rhr.count == 49 && h.loads.count == 49)
        #expect(h.hrv[48] == 48)
        #expect(h.hrv[47] == nil)
        #expect(h.hrv[13] == 62)
        #expect(!h.hrv.contains(99))
    }

    @Test("resting HR reads daily_metrics first and the log second — the scorer's own rule")
    func restingHrPrecedence() throws {
        let h = try history(try seeded())
        #expect(h.rhr[48] == 55)
        #expect(h.rhr[47] == 57)
        #expect(h.rhr[46] == 53)
        #expect(h.rhr[45] == nil)
    }

    @Test("loads sum per day; an unrated session at the default, an unrated walk at zero, an empty day a real zero")
    func loads() throws {
        let h = try history(try seeded())
        #expect(h.loads[48] == 480)
        #expect(h.loads[47] == 7 * 50 + 3 * 30)
        #expect(h.loads[46] == 0)
        #expect(h.loads[..<46].allSatisfy { $0 == 0 })
    }

    @Test("the export's flat shape carries null for null")
    func flattened() throws {
        let flat = ExportReadiness(signals: Readiness.signals(try history(try seeded())))
        #expect(flat.hrvZ == nil && flat.rhrZ == nil)
        #expect(flat.load == 480)
        // Two sessions, both inside the rolling week: no chronic side, no ratio.
        #expect(flat.acwr == nil)
        #expect(flat.acute != nil)
    }
}
