import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// Target profiles — a named day, reusable, applied with one tap. A port of
// `src/lib/nutrition/profiles.ts`.
//
// A LEVER is a rung of a phase, in force from a date. A PROFILE is a shape a
// single day can take — "Home", "Restaurant" — unordered, and deliberately not
// gated on the phase or the lever. Applying one SNAPSHOTS its numbers into
// `daily_targets` and stamps `profile_key` beside them as a label, so editing
// the profile later cannot re-grade a finished day.
//
// A restaurant day's carbohydrate and fat are UNTRACKED (nil), never zero: a
// 0 g fat target would grade the day 0/0 and call it perfect.
// ─────────────────────────────────────────────────────────────────────────────

public struct TargetProfile: Codable, Equatable, Sendable {
    /// Stable identifier, stamped onto the day. Never renamed once used.
    public var key: String
    public var label: String
    public var summary: String
    /// Ordering in the picker. Lower first.
    public var sort: Int
    public var kcal: Double
    public var proteinG: Double
    /// Nil when the macro is UNTRACKED. Never zero.
    public var carbsG: Double?
    public var fatG: Double?
    /// Steps, when the profile has an opinion. Usually it does not.
    public var stepsGoal: Double?

    public init(key: String, label: String, summary: String, sort: Int, kcal: Double, proteinG: Double, carbsG: Double?, fatG: Double?, stepsGoal: Double?) {
        self.key = key; self.label = label; self.summary = summary; self.sort = sort
        self.kcal = kcal; self.proteinG = proteinG; self.carbsG = carbsG; self.fatG = fatG; self.stepsGoal = stepsGoal
    }
}

public enum TargetProfiles {
    /// The profiles the app ships with — a FALLBACK when `target_profiles`
    /// cannot be read, not the source of record.
    public static let builtin: [TargetProfile] = [
        TargetProfile(key: "home", label: "Home", summary: "Cooked and weighed — every macro is a real target.",
                      sort: 0, kcal: 2150, proteinG: 170, carbsG: 244, fatG: 55, stepsGoal: nil),
        TargetProfile(key: "restaurant", label: "Restaurant", summary: "Eating out — hit the protein, let the split go.",
                      sort: 1, kcal: 2400, proteinG: 170, carbsG: nil, fatG: nil, stepsGoal: nil),
    ]

    /// The profile a day is stamped with, or nil. A key that names nothing
    /// resolves to nil rather than to the first profile.
    public static func byKey(_ profiles: [TargetProfile], _ key: String?) -> TargetProfile? {
        guard let key, !key.isEmpty else { return nil }
        return profiles.first { $0.key == key }
    }

    /// The `daily_targets` row that applying this profile to `date` produces.
    /// Every field is stated because the row REPLACES whatever the day held;
    /// steps stay nil unless the profile names one.
    public static func dailyTarget(_ profile: TargetProfile, date: String) -> DailyTarget {
        DailyTarget(
            date: date, kcal: profile.kcal, proteinG: profile.proteinG, carbsG: profile.carbsG, fatG: profile.fatG,
            stepsGoal: profile.stepsGoal, note: nil, profileKey: profile.key,
            trackCarbs: profile.carbsG != nil, trackFat: profile.fatG != nil
        )
    }

    /// Which profile a day's stored row corresponds to, WITHOUT trusting the
    /// stamp. Compared on the four food figures and both tracking flags; steps
    /// are excluded deliberately.
    public static func matches(_ t: DailyTarget?, _ profile: TargetProfile) -> Bool {
        guard let t else { return false }
        let trackCarbs = t.trackCarbs != false
        let trackFat = t.trackFat != false
        return t.kcal == profile.kcal
            && t.proteinG == profile.proteinG
            && trackCarbs == (profile.carbsG != nil)
            && trackFat == (profile.fatG != nil)
            && (profile.carbsG == nil || t.carbsG == profile.carbsG)
            && (profile.fatG == nil || t.fatG == profile.fatG)
    }
}
