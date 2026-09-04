import Foundation
import HelixCore
import HelixData

/// What a date is graded against: your own numbers, then the rung in force on
/// that date, then the day's own override.
///
/// ── WHY THIS IS A FUNCTION AND NOT FIVE COMPUTED PROPERTIES PER MODEL ───────
/// The chain is three steps and every one of them is date-bound: a lever is a
/// rung PULLED ON A DATE (memory `lever-schedule-dates`), a maintenance release
/// expires, and a `daily_targets` row overrides both for one day only. Two
/// screens now read it — Nutrition grades the day against it, Pulse prints
/// `1,420 / 1,955 kcal` in the Now strip — and a second copy of a three-step
/// date rule is a second copy that will answer differently the first time
/// either is nudged.
enum TargetChain {

    /// The day's override as the domain sees it, or nil.
    static func dayTarget(_ row: DailyTargetRow?) -> DailyTarget? {
        guard let row else { return nil }
        return DailyTarget(
            date: row.date, kcal: row.kcal.map(Double.init), proteinG: row.proteinG.map(Double.init),
            carbsG: row.carbsG.map(Double.init), fatG: row.fatG.map(Double.init),
            stepsGoal: row.stepsGoal.map(Double.init), note: row.note, profileKey: row.profileKey,
            trackCarbs: row.trackCarbs, trackFat: row.trackFat
        )
    }

    /// The user's own five numbers, before any rung.
    static func own(_ goals: UserGoalRow?) -> LeverGoals {
        LeverGoals(
            calorie: Double(goals?.calorieGoal ?? 0),
            protein: goals?.proteinGoalG.map(Double.init),
            carbs: goals?.carbsGoalG.map(Double.init),
            fat: goals?.fatGoalG.map(Double.init),
            steps: goals?.stepsGoal.map(Double.init)
        )
    }

    /// The rung in force on `date` — not the rung selected today.
    static func lever(on date: String, today: String, goals: UserGoalRow?) -> LeverId? {
        Levers.leverForDate(date, stored: goals?.activeLever, today: today, releaseEndsOn: goals?.maintenanceUntil)
    }

    /// The rung's numbers for the date, before the day override.
    static func rung(on date: String, today: String, goals: UserGoalRow?) -> LeverGoals {
        Levers.goalsForDate(
            date, stored: goals?.activeLever, today: today,
            fallback: own(goals), releaseEndsOn: goals?.maintenanceUntil
        )
    }

    /// The whole chain: own numbers → rung on that date → day override.
    static func resolve(date: String, today: String, goals: UserGoalRow?, dayTarget: DailyTarget?) -> LeverGoals {
        DailyTargets.apply(rung(on: date, today: today, goals: goals), dayTarget)
    }
}
