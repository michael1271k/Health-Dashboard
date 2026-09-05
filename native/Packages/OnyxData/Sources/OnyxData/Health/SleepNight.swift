import Foundation

/// One HealthKit sleep sample, reduced to what the aggregation needs.
public struct SleepSample: Sendable, Equatable {
    /// HealthKit's `HKCategoryValueSleepAnalysis`: 0 inBed · 1 asleepUnspecified
    /// · 2 awake · 3 asleepCore · 4 asleepDeep · 5 asleepREM.
    public var value: Int
    public var start: Date
    public var end: Date

    public init(value: Int, start: Date, end: Date) {
        self.value = value
        self.start = start
        self.end = end
    }
}

/// A night, aggregated.
public struct SleepNight: Sendable, Equatable {
    public var sleepMinutes: Int
    public var deepMin: Int
    public var remMin: Int
    public var coreMin: Int
    public var awakeMin: Int
    public var bedStart: Date?
    public var bedEnd: Date?
}

/// The night window, and the union arithmetic that makes a night one number.
public enum Sleep {

    /// Total minutes covered by a set of intervals, counting overlap ONCE.
    ///
    /// ── THE WHOLE REASON THIS FUNCTION EXISTS ───────────────────────────────
    /// iPhone and Watch both write sleep, and their samples overlap. Naive
    /// summation inflated the night: the app read 9h11m where Apple — which
    /// dedupes by source priority — showed 9h15m, and the error moved in both
    /// directions depending on which sources were active.
    public static func mergedMinutes(_ intervals: [(start: Date, end: Date)]) -> Double {
        guard !intervals.isEmpty else { return 0 }
        let sorted = intervals.sorted { $0.start < $1.start }
        var total: TimeInterval = 0
        var current = sorted[0]
        for next in sorted.dropFirst() {
            if next.start <= current.end {
                current.end = max(current.end, next.end)   // overlapping or adjacent
            } else {
                total += current.end.timeIntervalSince(current.start)
                current = next
            }
        }
        total += current.end.timeIntervalSince(current.start)
        return total / 60
    }

    /// Bucket a night's samples and merge each stage.
    ///
    /// `nil` when nothing slept — never a zero-minute night, which would be a
    /// claim rather than a gap and would overwrite a real reading from another
    /// source on the next sync.
    public static func aggregate(_ samples: [SleepSample]) -> SleepNight? {
        var deep: [(start: Date, end: Date)] = []
        var rem: [(start: Date, end: Date)] = []
        var core: [(start: Date, end: Date)] = []
        var awake: [(start: Date, end: Date)] = []
        var bedStart: Date?
        var bedEnd: Date?

        for sample in samples where sample.end > sample.start {
            if bedStart == nil || sample.start < bedStart! { bedStart = sample.start }
            if bedEnd == nil || sample.end > bedEnd! { bedEnd = sample.end }
            let span = (start: sample.start, end: sample.end)
            switch sample.value {
            case 4: deep.append(span)
            case 5: rem.append(span)
            case 1, 3: core.append(span)   // asleepUnspecified + asleepCore
            case 2: awake.append(span)
            default: break                 // 0 inBed → the bed window only
            }
        }

        // ── TOTAL IS THE UNION OF ALL ASLEEP STAGES TOGETHER ────────────────
        // Not the sum of separately-merged stages. When two sources label the
        // same minute differently — one Core, one REM — a per-stage sum counts
        // it twice. HealthKit exposes no precomputed "time asleep" scalar;
        // Apple's own Health app derives its number from these same samples, so
        // this is the closest faithful reconstruction rather than a value that
        // can be read directly.
        let total = Int(mergedMinutes(deep + rem + core).rounded())
        guard total > 0 else { return nil }
        return SleepNight(
            sleepMinutes: total,
            deepMin: Int(mergedMinutes(deep).rounded()),
            remMin: Int(mergedMinutes(rem).rounded()),
            coreMin: Int(mergedMinutes(core).rounded()),
            awakeMin: Int(mergedMinutes(awake).rounded()),
            bedStart: bedStart,
            bedEnd: bedEnd
        )
    }
}

// MARK: - The night window

/// The ONE definition of "the night belonging to date D", ported from
/// `lib/sleep/nightWindow.ts`.
///
/// `sleep_sessions.start_time` is BEDTIME — the previous evening. Every reader
/// and writer must agree on the same half-open window or rows are written into
/// a window nobody queries, which is exactly what made the scorer see
/// `sleepHours = 0` on every day for months.
///
/// Window: `[prevDay(D) 12:00Z, D 12:00Z)`. Half-open and exactly 24 h wide, so
/// consecutive nights TILE the timeline without overlapping. That property is
/// load-bearing: the writer DELETEs this window before inserting, and a rolling
/// sync writes two adjacent days — with an overlapping window, yesterday's
/// delete reached tonight's bedtime and destroyed the row today had just
/// written.
public enum NightWindow {

    /// UTC, deliberately. The window is a fixed 24-hour tile on the absolute
    /// timeline shared with the server, not a local calendar day — two devices
    /// in different zones must agree on which night a bedtime belongs to.
    static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(secondsFromGMT: 0)!
        return c
    }()

    public static func previousDay(_ dateISO: String) -> String {
        shift(dateISO, days: -1)
    }

    public static func nextDay(_ dateISO: String) -> String {
        shift(dateISO, days: 1)
    }

    private static func shift(_ dateISO: String, days: Int) -> String {
        guard let date = midnight(dateISO),
              let moved = utc.date(byAdding: .day, value: days, to: date)
        else { return dateISO }
        return iso(moved)
    }

    /// `[from, to)` for the night that ENDS on the morning of `dateISO`.
    public static func range(_ dateISO: String) -> (from: Date, to: Date)? {
        guard let noon = midnight(dateISO)?.addingTimeInterval(12 * 3600) else { return nil }
        return (noon.addingTimeInterval(-24 * 3600), noon)
    }

    /// The inverse: which date's night a bedtime belongs to.
    ///
    /// Needed the moment anything reads more than one night — a seven-night
    /// trend gets back a flat list and must bucket it, and doing that by the
    /// date part of `start_time` files every pre-midnight bedtime under the
    /// evening it began rather than the morning it ended. Half the nights would
    /// land on the wrong day, and only the half you went to bed early on.
    public static func nightOf(_ start: Date) -> String {
        let day = iso(start)
        return utc.component(.hour, from: start) >= 12 ? nextDay(day) : day
    }

    /// Where to stamp a session with no reported bed time. It MUST sit inside
    /// the window or the row is written and invisible to every reader.
    public static func fallbackBedTime(_ dateISO: String) -> Date? {
        midnight(previousDay(dateISO))?.addingTimeInterval(23 * 3600)
    }

    static func midnight(_ dateISO: String) -> Date? {
        let parts = dateISO.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func iso(_ date: Date) -> String {
        let c = utc.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}
