#if DEBUG
import SwiftUI
import HelixCore
import HelixData

/// The Fuel tab's three photographed states, seeded through the same write
/// paths the app uses — so a preview that renders is also a smoke test of
/// `DayEditing`, and a change to a writer shows up in the screenshot diff.
///
/// ── WHY ONE ENTRY AND NOT TWO ───────────────────────────────────────────────
/// Both public writers for `nutrition_entries` — the HealthKit `ingest` and
/// `setManualMacros` — target the single `daily` row for the date, which is
/// also what a real day holds: HealthKit lands one row per day. A second,
/// per-meal row has no public write path, and inventing one for a screenshot
/// would mean a `HelixData` API nobody else needs.
enum FuelPreviews {

    static let userId = "00000000-0000-0000-0000-000000000001"

    /// `fuel` — an ordinary day under target. `fuel-over` — calories and
    /// protein over (fat under), carbohydrate untracked by a day override, flagged Social.
    /// `fuel-empty` — nothing logged; every figure is an em dash.
    @MainActor
    static func model(_ screen: String) -> FuelModel? {
        let database = try! AppDatabase.inMemory(deviceId: "shot")
        let date = LogicalDay.today()
        _ = try? database.editUserGoals(userId: userId) { row in
            row.calorieGoal = 1955
            row.proteinGoalG = 170
            row.carbsGoalG = 195
            row.fatGoalG = 55
            row.stepsGoal = 10000
            row.waterGoalMl = 3000
            row.activeLever = LeverId.custom.rawValue
            row.activePlan = "apex51"
            row.activePhase = ProgramPhase.cut.rawValue
            row.goalPreset = ProgramPhase.cut.rawValue
        }

        switch screen {
        case "fuel":
            _ = try? database.ingest(
                HealthPayload(date: date, values: [.calories: 1420, .protein: 128, .carbs: 140, .fats: 42, .water: 1800]),
                userId: userId
            )
        case "fuel-over":
            _ = try? database.ingest(
                HealthPayload(date: date, values: [.calories: 2150, .protein: 175, .carbs: 180, .fats: 48, .water: 2400]),
                userId: userId
            )
            _ = try? database.editDailyLog(userId: userId, date: date) { $0.nutritionException = "Social" }
            _ = try? database.setDailyTarget(userId: userId, date: date) { row in
                row.kcal = 1800
                row.proteinG = 150
                row.fatG = 55
                row.trackCarbs = false
                row.note = "Dinner out"
            }
        case "fuel-empty":
            break
        default:
            return nil
        }
        return FuelModel(database: database, userId: userId, date: date)
    }

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        if let model = model(screen) {
            NavigationStack { FuelTabView(seeded: model) }
                .environment(AppEnvironment.preview)
        } else {
            ContentUnavailableView("No Fuel screen named \(screen)", systemImage: "questionmark.square.dashed")
        }
    }
}

#Preview("Fuel — under") {
    FuelPreviews.view("fuel")
}

#Preview("Fuel — over") {
    FuelPreviews.view("fuel-over")
}

#Preview("Fuel — empty") {
    FuelPreviews.view("fuel-empty")
}
#endif
