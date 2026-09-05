import Foundation
import GRDB
import Testing
import OnyxCore
@testable import OnyxData

/// The three precedence rules behind the trends screen, and the one read.
@Suite("Body & vitals trends")
struct VitalsStoreTests {

    private let user = "u1"
    private let now = Date(timeIntervalSince1970: 1_756_900_000)

    private func log(_ date: String, weight: Double? = nil, fat: Double? = nil, ffm: Double? = nil, smm: Double? = nil, steps: Int? = nil) -> DailyLogRow {
        DailyLogRow(
            id: newOnyxID(), userId: user, date: date, steps: steps, weightKg: weight, bodyFatPct: fat,
            createdAt: now, updatedAt: now, fatFreeMassKg: ffm, skeletalMuscleMassKg: smm,
            nutritionEstimated: false, sleepOnsetTrouble: false
        )
    }

    private func ledger(_ date: String, weight: Double, fat: Double? = nil, hour: Int = 7) -> BodyCompositionRow {
        BodyCompositionRow(
            id: newOnyxID(), userId: user, measuredAt: now.addingTimeInterval(Double(hour) * 3600),
            date: date, weightKg: weight, bodyFatPct: fat, createdAt: now
        )
    }

    @Test("the ledger wins a date per field, the log fills what it left blank, and sub-50 kg rows vanish")
    func readingsPrecedence() {
        let rows = BodyVitals.readings(
            ledger: [ledger("2026-09-02", weight: 64.8, fat: 15.0)],
            logs: [
                log("2026-09-02", weight: 66.0, fat: 16.0, smm: 27.1),
                log("2026-09-01", weight: 65.5, ffm: 55.0),
                log("2026-08-31", weight: 12.0),          // a scale artifact
            ]
        )
        #expect(rows.map(\.date) == ["2026-09-01", "2026-09-02"])
        #expect(rows[1].weight == 64.8)
        #expect(rows[1].fatPct == 15.0)
        #expect(rows[1].skeletalMuscle == 27.1)
        // weight × (1 − fat %) when both are there, the stored column otherwise.
        #expect(rows[1].fatFreeMass == 55.08)
        #expect(rows[0].fatFreeMass == 55.0)
    }

    @Test("daily_metrics steps overwrite daily_logs steps, and a day nobody counted is absent")
    func stepsPrecedence() {
        let metric = DailyMetricRow(id: "m", userId: user, date: "2026-09-02", steps: 9_000, createdAt: now, updatedAt: now)
        let points = BodyVitals.steps(metrics: [metric], logs: [log("2026-09-02", steps: 8_000), log("2026-09-01", steps: 7_000), log("2026-08-31")])
        #expect(points == [TrendPoint(d: "2026-09-01", v: 7_000), TrendPoint(d: "2026-09-02", v: 9_000)])
    }

    @Test("weeks are Sunday-anchored and roll as a mean or a sum")
    func weeklyBuckets() {
        // Sat 29 Aug, Sun 30 Aug, Mon 31 Aug 2026.
        let points = [TrendPoint(d: "2026-08-29", v: 10), TrendPoint(d: "2026-08-30", v: 20), TrendPoint(d: "2026-08-31", v: 40)]
        #expect(BodyVitals.weekly(points, roll: .mean) == [TrendPoint(d: "2026-08-23", v: 10), TrendPoint(d: "2026-08-30", v: 30)])
        #expect(BodyVitals.weekly(points, roll: .sum) == [TrendPoint(d: "2026-08-23", v: 10), TrendPoint(d: "2026-08-30", v: 60)])
    }

    @Test("the read is windowed on date and the newest measurement of a day comes last")
    func rangeRead() throws {
        let db = try AppDatabase.inMemory(deviceId: "device-a")
        try db.seedRows { db in
            try self.ledger("2026-08-01", weight: 70).insert(db)
            try self.ledger("2026-09-02", weight: 65, hour: 9).insert(db)
            try self.ledger("2026-09-02", weight: 64, hour: 6).insert(db)
            try self.log("2026-09-01", weight: 65.5).insert(db)
        }
        let slice = try db.bodyVitals(userId: user, from: "2026-09-01", to: "2026-09-03")
        #expect(slice.ledger.map(\.weightKg) == [64, 65])
        #expect(slice.logs.map(\.date) == ["2026-09-01"])
        #expect(slice.goals == nil)
        // The fold takes the last ledger row of the day.
        #expect(BodyVitals.readings(ledger: slice.ledger, logs: slice.logs).map(\.weight) == [65.5, 65])
    }
}
