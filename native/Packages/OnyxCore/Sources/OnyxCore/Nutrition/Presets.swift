import Foundation

/// The two nutrition directions and their presets — a port of the nutrition
/// half of `src/lib/types/workout.ts`. `maintenance` is a LEVER, not a mode.
public enum NutritionMode: String, Codable, Sendable, CaseIterable {
    case cut, bulk

    /// Read a stored phase string, tolerating the deleted `maintenance` value.
    public static func from(_ v: String?) -> NutritionMode { v == "bulk" ? .bulk : .cut }
}

public struct NutritionPreset: Codable, Sendable, Equatable {
    public var mode: NutritionMode
    public var label: String
    public var calorieGoal: Double
    public var proteinGoalG: Double?
    public var carbsGoalG: Double?
    public var fatGoalG: Double?
    public var fiberGoalG: Double?
    public var stepsGoal: Double
    public var targetWeightKg: Double
    public var targetBodyFatPct: Double?
    public var targetMuscleMassKg: Double?
    public var rateMinKgWk: Double?
    public var rateMaxKgWk: Double?
    public var bodyFatCeilingPct: Double?
    public var fiberMin: Double?
    public var fiberMax: Double?
}

/// A per-plan override — every field optional; present fields replace the default's.
public struct PresetOverride: Codable, Sendable, Equatable {
    public var label: String?
    public var calorieGoal: Double?
    public var proteinGoalG: Double?
    public var carbsGoalG: Double?
    public var fatGoalG: Double?
}

public enum NutritionPresets {
    public static let cut = NutritionPreset(
        mode: .cut, label: "Cut", calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55, fiberGoalG: 30,
        stepsGoal: 10000, targetWeightKg: 62, targetBodyFatPct: 13.0, targetMuscleMassKg: 33.0,
        rateMinKgWk: -0.50, rateMaxKgWk: -0.40, bodyFatCeilingPct: nil, fiberMin: 28, fiberMax: 35
    )
    public static let bulk = NutritionPreset(
        mode: .bulk, label: "Lean Bulk", calorieGoal: 2600, proteinGoalG: 160, carbsGoalG: 330, fatGoalG: 70, fiberGoalG: 35,
        stepsGoal: 8000, targetWeightKg: 70, targetBodyFatPct: 15.0, targetMuscleMassKg: 37.0,
        rateMinKgWk: 0.20, rateMaxKgWk: 0.25, bodyFatCeilingPct: 16.0, fiberMin: 33, fiberMax: 38
    )

    public static func preset(_ mode: NutritionMode) -> NutritionPreset { mode == .cut ? cut : bulk }

    /// Per-PLAN overrides keyed by program id. PPL Legacy ran a leaner cut.
    public static let planPhases: [String: [NutritionMode: PresetOverride]] = [
        "ppl": [.cut: PresetOverride(label: "PPL Cut", calorieGoal: 1935, proteinGoalG: 180, carbsGoalG: 180, fatGoalG: 55)],
    ]

    /// The plan override merged over the Onyx default.
    public static func phaseGoals(planId: String, mode: NutritionMode) -> NutritionPreset {
        var p = preset(mode)
        guard let o = planPhases[planId]?[mode] else { return p }
        if let v = o.label { p.label = v }
        if let v = o.calorieGoal { p.calorieGoal = v }
        if let v = o.proteinGoalG { p.proteinGoalG = v }
        if let v = o.carbsGoalG { p.carbsGoalG = v }
        if let v = o.fatGoalG { p.fatGoalG = v }
        return p
    }

    /// The five historical split_day labels; colours are OnyxUI's.
    public static let splitLabels: [String: (label: String, labelHe: String)] = [
        "push": ("Push", "דחיפה"), "pull": ("Pull", "משיכה"), "legs": ("Legs", "רגליים"),
        "upper": ("Upper", "פלג גוף עליון"), "lower": ("Lower", "פלג גוף תחתון"),
    ]
}
