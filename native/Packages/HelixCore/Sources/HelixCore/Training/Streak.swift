import Foundation

/// THE STREAK and the PROGRAM DAY — a port of `src/lib/training/streak.ts`.
public struct StreakDay: Sendable, Equatable {
    public var d: String
    public var scheduled: Bool
    public var logged: Bool
    public init(d: String, scheduled: Bool, logged: Bool) { self.d = d; self.scheduled = scheduled; self.logged = logged }
}

public struct StreakResult: Codable, Sendable, Equatable {
    public var current: Int
    public var best: Int
}

public enum Streak {
    public static let windowDays = 42
    /// 2026-07-15 is day 1 — the day the Helix Cut block opened.
    public static let helixCutStart = "2026-07-15"

    /// Counted over SCHEDULED days only; an unlogged today and any future day owe nothing.
    public static func from(_ days: [StreakDay], todayISO: String) -> StreakResult {
        let scheduled = days.filter(\.scheduled).enumerated()
            .sorted { a, b in a.element.d != b.element.d ? a.element.d < b.element.d : a.offset < b.offset }
            .map(\.element)
        var best = 0, run = 0
        for x in scheduled {
            run = x.logged ? run + 1 : 0
            if run > best { best = run }
        }
        var current = 0
        for x in scheduled.reversed() {
            if x.d == todayISO && !x.logged { continue }
            if x.d > todayISO { continue }
            if !x.logged { break }
            current += 1
        }
        return StreakResult(current: current, best: best)
    }

    /// How deep into the cut you are, inclusive of both ends; 0 before it opened.
    public static func programDayCount(_ todayISO: String, startISO: String = helixCutStart) -> Int {
        guard let start = ISODate.dayNumber(startISO), let today = ISODate.dayNumber(todayISO), today >= start else { return 0 }
        return today - start + 1
    }
}
