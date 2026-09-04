#if DEBUG
import SwiftUI
import HelixCore
import HelixData

/// Seeded Body & Vitals trends for `#Preview` and `scripts/native-shot.sh`.
///
/// Ninety days ending TODAY — the charts park their window on the newest data,
/// so a fixed date would leave the shot looking at an empty month. Values are
/// deterministic (sine wobble on a slow drift), and every 11th day is left out
/// so the gap rule is in the photograph.
enum BodyTrendsPreviews {

    static let userId = DayPreviews.userId

    @MainActor
    static func seeded() -> BodyVitalsSlice {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        let today = LogicalDay.today()
        let from = ISODate.addDays(today, -89) ?? today
        try? database.editUserGoals(userId: userId) { row in
            row.activePlan = "apex51"
            row.activePhase = ProgramPhase.cut.rawValue
            row.targetWeightKg = 62
            row.stepsGoal = 10_000
        }
        try? database.seedRows { db in
            let now = Date()
            for back in 0..<90 where back % 11 != 4 {
                let date = ISODate.addDays(today, -back) ?? today
                let t = Double(89 - back)                       // 0 … 89, oldest first
                let wobble = sin(t / 3.1)
                let weekday = ISODate.weekday(date) ?? 0
                let trained = [0, 1, 2, 4, 5].contains(weekday)  // Helix-5 days

                var log = DailyLogRow(
                    id: newHelixID(), userId: userId, date: date, createdAt: now, updatedAt: now,
                    nutritionEstimated: false, sleepOnsetTrouble: false
                )
                log.hrvMs = jsRound((46 + 7 * wobble + t * 0.04) * 10) / 10
                log.avgRestHeartRate = Int(jsRound(53 - 2.5 * wobble - t * 0.02))
                log.wristTempDelta = jsRound((34.3 + 0.25 * sin(t / 5)) * 100) / 100
                log.sleepMinutes = Int(jsRound(440 + 35 * sin(t / 2.3)))
                log.respiratoryRate = jsRound((14.6 + 0.5 * sin(t / 4)) * 10) / 10
                log.bloodOxygen = jsRound(97 + 1.2 * sin(t / 6))
                log.exerciseMinutes = trained ? Int(jsRound(62 + 12 * wobble)) : 0
                log.activeEnergy = jsRound(trained ? 640 + 90 * wobble : 380 + 60 * wobble)
                log.timeInDaylightMin = Int(jsRound(55 + 30 * sin(t / 3.7)))
                log.standHours = Int(jsRound(11 + 1.6 * sin(t / 2.9)))
                try log.insert(db)

                try DailyMetricRow(
                    id: newHelixID(), userId: userId, date: date,
                    steps: Int(jsRound(9_200 + 2_400 * sin(t / 1.9) + (trained ? 900 : -600))),
                    createdAt: now, updatedAt: now
                ).insert(db)

                // The scale, roughly every third morning: a slow cut with water noise.
                if back % 3 == 0 {
                    let weight = jsRound((66.4 - t * 0.021 + 0.35 * wobble) * 10) / 10
                    let fat = jsRound((16.6 - t * 0.017 + 0.2 * sin(t / 2.7)) * 10) / 10
                    try BodyCompositionRow(
                        id: newHelixID(), userId: userId, measuredAt: now.addingTimeInterval(-Double(back) * 86_400),
                        date: date, weightKg: weight, bodyFatPct: fat,
                        muscleMassKg: jsRound((weight * 0.776) * 10) / 10, createdAt: now,
                        skeletalMuscleMassKg: jsRound((26.6 + 0.4 * sin(t / 9) + t * 0.004) * 10) / 10,
                        fatFreeMassKg: jsRound((weight * (1 - fat / 100)) * 10) / 10,
                        visceralFat: jsRound(6 - t * 0.012),
                        estimatedWaistToHipRatio: jsRound((0.87 - t * 0.0003) * 100) / 100
                    ).insert(db)
                }
            }
        }
        return (try? database.bodyVitals(userId: userId, from: from, to: today)) ?? .empty
    }

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        switch screen {
        case "body-trends":
            NavigationStack { BodyTrendsView(seeded: seeded()) }
                .environment(AppEnvironment.preview)
        case "body-trends-empty":
            NavigationStack { BodyTrendsView(seeded: .empty) }
                .environment(AppEnvironment.preview)
        default:
            ContentUnavailableView("No Body screen named \(screen)", systemImage: "questionmark.square.dashed")
        }
    }
}

#Preview("Body trends") { BodyTrendsPreviews.view("body-trends") }
#Preview("Body trends — empty") { BodyTrendsPreviews.view("body-trends-empty") }
#endif
