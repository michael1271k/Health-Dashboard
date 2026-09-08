#if DEBUG
import SwiftUI
import OnyxCore
import OnyxData
import OnyxUI

/// Seeded Body & Vitals trends for `#Preview` and `scripts/native-shot.sh`.
///
/// Ninety days ending TODAY — the charts park their window on the newest data,
/// so a fixed date would leave the shot looking at an empty month. Values are
/// deterministic (sine wobble on a slow drift), and every 11th day is left out
/// so the gap rule is in the photograph.
enum BodyTrendsPreviews {

    static let userId = PulsePreviews.userId

    @MainActor
    static func seeded() -> BodyVitalsSlice { seededStore().slice }

    /// The store AND what this screen reads out of it.
    ///
    /// ── WHY THE STRESS SERIES CANNOT COME FROM THE ENVIRONMENT ──────────────
    /// Every other chart here is fed the `BodyVitalsSlice` the harness built,
    /// and the in-memory store behind it is thrown away. `StressSection` is the
    /// one that reads the DATABASE (v1 computes the index on read), and the
    /// preview environment's store is empty — so left to itself it photographs
    /// the empty state on a screen where every chart above it has ninety days
    /// of data. Reading the series out of the same store, once, is what keeps
    /// the shot one account.
    ///
    /// The seed has no `sleep_sessions` and no sessions, so fragmentation and
    /// load go unanswered and the index is carried by the autonomic term — a
    /// real reading, and the "2 of 4 terms answered" callout is a state the
    /// chart genuinely has to draw.
    @MainActor
    static func seededStore() -> (slice: BodyVitalsSlice, stress: [StressDay]) {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        let today = LogicalDay.today()
        let from = ISODate.addDays(today, -89) ?? today
        _ = try? database.editUserGoals(userId: userId) { row in
            row.activePlan = "onyx5"
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
                let trained = [0, 1, 2, 4, 5].contains(weekday)  // Onyx-5 days

                var log = DailyLogRow(
                    id: newOnyxID(), userId: userId, date: date, createdAt: now, updatedAt: now,
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
                    id: newOnyxID(), userId: userId, date: date,
                    steps: Int(jsRound(9_200 + 2_400 * sin(t / 1.9) + (trained ? 900 : -600))),
                    createdAt: now, updatedAt: now
                ).insert(db)

                // The scale, roughly every third morning: a slow cut with water noise.
                if back % 3 == 0 {
                    let weight = jsRound((66.4 - t * 0.021 + 0.35 * wobble) * 10) / 10
                    let fat = jsRound((16.6 - t * 0.017 + 0.2 * sin(t / 2.7)) * 10) / 10
                    try BodyCompositionRow(
                        id: newOnyxID(), userId: userId, measuredAt: now.addingTimeInterval(-Double(back) * 86_400),
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
        return (
            slice: (try? database.bodyVitals(userId: userId, from: from, to: today)) ?? .empty,
            stress: (try? database.stressSeries(userId: userId, endingOn: today, limit: StressSection.days)) ?? []
        )
    }

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        switch screen {
        case "body-trends":
            let store = seededStore()
            NavigationStack { BodyTrendsView(seeded: store.slice, seededStress: store.stress) }
                .environment(AppEnvironment.preview)
        case "body-trends-empty":
            // `[]`, not the environment's answer: an empty screen has to be
            // empty all the way down, and a live read here would be the one
            // section that went off and computed something.
            NavigationStack { BodyTrendsView(seeded: .empty, seededStress: []) }
                .environment(AppEnvironment.preview)
        case "body-trends-tooltip":
            // The ledger card, pinned. A scrub is a gesture and a screenshot
            // cannot perform one, so the harness banks the reading the finger
            // would have stopped on.
            let store = seededStore()
            let slice = store.slice
            NavigationStack {
                BodyTrendsView(
                    seeded: slice,
                    seededSelection: slice.ledger
                        .map(\.date)
                        .sorted()
                        .dropLast(3)
                        .last,
                    seededStress: store.stress
                )
            }
            .environment(AppEnvironment.preview)
        // The stress card on its own ground.
        //
        // On the full screen it is the fourth section down — below a 90-day
        // composition chart and a steps chart — and a screenshot photographs
        // the first screen only, so the chart §U5.3 adds cannot be reviewed
        // there at all. Same reason `doms` shoots its tile alone.
        case "body-trends-stress":
            NavigationStack {
                ScrollView { StressSection(days: seededStore().stress).padding(OnyxSpace.l) }
                    .onyxScreen(.body)
                    .navigationTitle("Trends")
                    .navigationBarTitleDisplayMode(.inline)
            }
            .environment(AppEnvironment.preview)
        default:
            ContentUnavailableView("No Body screen named \(screen)", systemImage: "questionmark.square.dashed")
        }
    }
}

#Preview("Body trends") { BodyTrendsPreviews.view("body-trends") }
#Preview("Body trends — empty") { BodyTrendsPreviews.view("body-trends-empty") }
#Preview("Body trends — stress") { BodyTrendsPreviews.view("body-trends-stress") }
#endif
