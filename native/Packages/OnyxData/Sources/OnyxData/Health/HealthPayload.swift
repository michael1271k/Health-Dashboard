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
    /// `values[.hrv]` is the mean of the SDNN samples INSIDE the night's bed
    /// window (readiness v9) rather than the calendar day's average. False
    /// when the watch was not worn to sleep and the daily mean stood in.
    public var hrvOvernight: Bool
    /// For a dietary micro, how much each SOURCE APP contributed — the answer
    /// to "which app wrote 3,100 mg of calcium", which `nutrition_entries`
    /// cannot give because it stores a daily aggregate with no item breakdown.
    ///
    /// Only populated for the micros, and only where more than nothing came
    /// back. Empty is the ordinary state and means "not attributed".
    public var microSources: [HealthKey: [String: Double]]

    public init(date: String, values: [HealthKey: Double] = [:], sleep: SleepNight? = nil,
                hrvOvernight: Bool = false, microSources: [HealthKey: [String: Double]] = [:]) {
        self.date = date
        self.values = values
        self.sleep = sleep
        self.hrvOvernight = hrvOvernight
        self.microSources = microSources
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

    // MARK: - A night the user edited

    /// `manual-sleep-<wakeDate>` — ported from `lib/sleep/manualSleep.ts`.
    /// Keyed by the morning the night ended on (the night's own date), so two
    /// edited nights never collide. Every sleep writer checks it: `writeSleep`
    /// declines the night, `HealthSync` reads overnight HRV over the STORED
    /// window rather than HealthKit's, and the web ingest leaves both stores.
    public static func sleepSentinel(_ wakeDate: String) -> String { "manual-sleep-\(wakeDate)" }

    public static func isManualSleep(_ hkUuid: String?) -> Bool {
        hkUuid?.hasPrefix("manual-sleep-") ?? false
    }

    // MARK: - A glass is not an override

    /// One tapped glass, in the day's ledger.
    ///
    /// ── WHY THIS IS NOT `waterSentinel` ─────────────────────────────────────
    /// It was. Tapping the water row called `setWaterOverride`, which replaces
    /// the whole day's ledger with one hand-entered figure carrying
    /// `manual-water-<date>` — and that sentinel is a ONE-WAY DOOR: `ingest`
    /// declines the day's water from then on, in both stores, silently and
    /// forever. So a single stray tap on the most-tapped control on the tab
    /// permanently disconnected that date from Apple Health, and the only way
    /// back was a long press, a sheet, and a button that is only rendered once
    /// you are already locked out.
    ///
    /// The two actions were never the same verb. The SHEET says "the day was
    /// this much" — a correction, which should win over anything Apple reports
    /// and whose footer says exactly that. A TAP says "and one more glass",
    /// which is an addition to a day Apple is still measuring. Giving the glass
    /// its own prefix is what lets `ingest` keep writing HealthKit's reading
    /// and add the glasses to it, rather than choosing between them.
    ///
    /// Unique per row, not per day: `water_intake.hk_uuid` carries a UNIQUE
    /// index and a day holds as many glasses as you drink.
    public static func glassSentinel(_ date: String, id: String = newOnyxID()) -> String {
        "glass-\(date)-\(id)"
    }

    public static func isGlass(_ hkUuid: String?) -> Bool {
        hkUuid?.hasPrefix("glass-") ?? false
    }
}
