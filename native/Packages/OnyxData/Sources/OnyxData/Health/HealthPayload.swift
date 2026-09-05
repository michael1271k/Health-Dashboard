import Foundation

/// One day's reading, in the flat ingest vocabulary.
///
/// The same shape `POST /api/ingest` took, minus the transport. It stays a
/// dictionary rather than thirty-two named properties because the keys ARE the
/// contract — `METRIC_MAP` produces them and `DailyLogIngest` consumes them —
/// and a struct would be a third place that has to be kept in step with both.
public struct HealthPayload: Sendable, Equatable {
    /// The LOCAL calendar day this reading belongs to, `yyyy-MM-dd`.
    public var date: String
    public var values: [HealthKey: Double]
    /// The night that ENDS on the morning of `date`. Its own window, not the
    /// calendar day — see `NightWindow`.
    public var sleep: SleepNight?

    public init(date: String, values: [HealthKey: Double] = [:], sleep: SleepNight? = nil) {
        self.date = date
        self.values = values
        self.sleep = sleep
    }

    public subscript(key: HealthKey) -> Double? {
        get { values[key] }
        set { values[key] = newValue }
    }

    /// Nothing was read. A push of nothing must not touch a row: an empty
    /// upsert would bump `updated_at` on every device's cursor for no change,
    /// and on a day with no data it would create the row that the ghost guard
    /// in scoring exists to prevent.
    public var isEmpty: Bool { values.isEmpty && sleep == nil }
}

// MARK: - The two unit rules that are not scale factors

public enum HealthUnits {

    /// Adaptive stand-unit conversion, from `dailyLog.ts`.
    ///
    /// Real payloads carry MINUTES (observed: 278, 46), but small values (≤ 24)
    /// are indistinguishable from an Apple stand-hours ring count — those pass
    /// through untouched; anything larger is minutes and converts to hours.
    public static func standToHours(_ v: Double?) -> Int? {
        guard let v else { return nil }
        return Int((v > 24 ? v / 60 : v).rounded())
    }

    /// Below this a weight reading is a scale or sync artifact, not a person.
    /// `MIN_VALID_WEIGHT_KG` in `lib/utils/measure.ts`.
    public static let minValidWeightKg: Double = 50

    /// HealthKit reports vitamin D in micrograms; every target in the app is in
    /// IU. 1 mcg = 40 IU.
    public static func vitaminDToIU(_ mcg: Double) -> Double { (mcg * 40).rounded() }
}

// MARK: - Manual-override sentinels

/// `hk_uuid` sentinels, ported from `lib/nutrition/manualEntry.ts` and
/// `manualWater.ts`.
///
/// Both are PER DAY rather than a shared literal, and that is not cosmetic:
/// `nutrition_entries.hk_uuid` and `water_intake.hk_uuid` each carry a UNIQUE
/// index, so a single `'manual'` string could only ever exist on ONE date —
/// saving a second day threw `duplicate key value violates unique constraint`.
///
/// The two prefixes are deliberately distinct and `isManualWater` is NOT
/// satisfied by a macro sentinel: the tables are checked at different call
/// sites, and a value that matched both would let a macro override silently
/// suppress a water sync.
public enum ManualEntry {
    public static func macroSentinel(_ date: String) -> String { "manual-\(date)" }
    public static func waterSentinel(_ date: String) -> String { "manual-water-\(date)" }

    /// True for the per-day sentinel AND the legacy bare `manual`.
    public static func isManualMacro(_ hkUuid: String?) -> Bool {
        guard let hkUuid else { return false }
        return hkUuid == "manual" || hkUuid.hasPrefix("manual-")
    }

    public static func isManualWater(_ hkUuid: String?) -> Bool {
        hkUuid?.hasPrefix("manual-water-") ?? false
    }
}
