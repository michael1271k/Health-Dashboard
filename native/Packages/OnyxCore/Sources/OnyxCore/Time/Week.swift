import Foundation

/// Week boundaries and the ONE programme week counter — ports of
/// `weekStartOf` (`src/lib/utils/week.ts`) and `src/lib/reports/weekNumber.ts`.
///
/// Week 0 is the week containing Jul 15–18 2026 (Sunday-anchored start
/// 2026-07-12). It is a real, PARTIAL week: the block opened on a Wednesday.
public enum Week {
    public static let week0Start = "2026-07-12"

    /// `weekStartDayFromEndDay` — `user_goals.week_end_day` → the start day
    /// `start(of:startDay:)` wants. A week ending Sunday starts Monday; nil is
    /// the Sunday-start default.
    public static func startDay(fromEndDay endDay: Int?) -> Int {
        guard let endDay else { return 0 }
        return endDay == 0 ? 1 : 0
    }

    /// The first day of the week containing `dateISO`, for a week starting on
    /// `startDay` (0 = Sunday, 1 = Monday). Echoes an unparseable date.
    public static func start(of dateISO: String, startDay: Int = 0) -> String {
        guard let day = ISODate.dayNumber(dateISO) else { return dateISO }
        // 1970-01-01 was a Thursday (4).
        let weekday = (((day % 7) + 7) % 7 + 4) % 7
        let offset = (weekday - startDay + 7) % 7
        return ISODate.iso(dayNumber: day - offset)
    }

    /// Programme week number for a week start — Week 0 = 2026-07-12, then +1 a
    /// week. 0 rather than NaN for an unparseable date.
    public static func number(ofWeekStart weekStartISO: String) -> Double {
        guard let a = ISODate.dayNumber(week0Start), let b = ISODate.dayNumber(weekStartISO) else { return 0 }
        return jsRound(Double(b - a) / 7)
    }

    public static func number(forDate dateISO: String, startDay: Int = 0) -> Double {
        number(ofWeekStart: start(of: dateISO, startDay: startDay))
    }

    /// "Week 3" for a Onyx-era week; a pre-Week-0 week draws its label from the phase.
    public static func label(ofWeekStart weekStartISO: String) -> String {
        let n = number(ofWeekStart: weekStartISO)
        if n >= 0 { return "Week \(jsIntegerString(n))" }
        return Phases.weekPhase(weekStart: weekStartISO)?.label ?? "Week \(jsIntegerString(n))"
    }
}
