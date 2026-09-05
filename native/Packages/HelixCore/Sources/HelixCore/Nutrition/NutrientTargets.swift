import Foundation

/// Daily micronutrient targets for THIS athlete — the data half of
/// `src/lib/nutrition/nutrientTargets.ts`. `floor` = aim to reach; `ceiling` =
/// stay at or under. The rationale strings and HealthKit identifiers are
/// documentation and stay on the web side.
public struct NutrientTarget: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case floor, ceiling }
    public var key: String
    public var label: String
    public var target: Double
    public var unit: String
    public var kind: Kind
    public var group: String
    /// Delivered by the supplement stack rather than food.
    public var fromStack: Bool
}

public enum NutrientTargets {
    private static func t(_ key: String, _ label: String, _ target: Double, _ unit: String, _ kind: NutrientTarget.Kind, _ group: String, stack: Bool = false) -> NutrientTarget {
        NutrientTarget(key: key, label: label, target: target, unit: unit, kind: kind, group: group, fromStack: stack)
    }

    public static let all: [NutrientTarget] = [
        t("fiber", "Fiber", 30, "g", .floor, "Fuel"),
        t("protein", "Protein", 170, "g", .floor, "Fuel"),
        t("sodium", "Sodium", 3000, "mg", .ceiling, "Electrolytes"),
        t("potassium", "Potassium", 3400, "mg", .floor, "Electrolytes"),
        t("calcium", "Calcium", 1000, "mg", .floor, "Electrolytes"),
        t("iron", "Iron", 10, "mg", .floor, "Vitamins & minerals"),
        t("magnesium", "Magnesium", 400, "mg", .floor, "Electrolytes"),
        t("vitaminC", "Vitamin C", 90, "mg", .floor, "Vitamins & minerals"),
        t("vitaminD", "Vitamin D", 2000, "IU", .floor, "Vitamins & minerals"),
        t("satFat", "Saturated Fat", 20, "g", .ceiling, "Fuel"),
        t("sugar", "Added Sugar", 40, "g", .ceiling, "Fuel"),
        t("vitaminB12", "Vitamin B12", 2.4, "mcg", .floor, "Vitamins & minerals", stack: true),
        t("folate", "Folate", 400, "mcg", .floor, "Vitamins & minerals", stack: true),
        t("epa", "EPA", 500, "mg", .floor, "Performance stack", stack: true),
        t("dha", "DHA", 250, "mg", .floor, "Performance stack", stack: true),
        t("creatine", "Creatine", 5000, "mg", .floor, "Performance stack", stack: true),
        t("citrulline", "L-Citrulline", 3000, "mg", .floor, "Performance stack", stack: true),
        t("caffeine", "Caffeine", 400, "mg", .ceiling, "Performance stack", stack: true),
        t("theanine", "L-Theanine", 200, "mg", .floor, "Performance stack", stack: true),
        t("glycine", "Glycine", 3000, "mg", .floor, "Performance stack", stack: true),
    ]
}
