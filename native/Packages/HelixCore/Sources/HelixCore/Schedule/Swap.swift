import Foundation

/// Day-swap planning — a port of `src/lib/schedule/swap.ts`. A rest day is a
/// REARRANGEMENT of the week, not a cancellation: the displaced workout moves
/// to the next date the plan already rests. Pure: the caller injects `resolve`.

/// What a date is scheduled to be. `dayKey` is nil for a PPL-era label.
public struct ScheduleDay: Codable, Sendable, Equatable {
    public var label: String
    public var sub: String?
    public var dayKey: String?

    public init(label: String, sub: String? = nil, dayKey: String? = nil) {
        self.label = label; self.sub = sub; self.dayKey = dayKey
    }
}

/// One row destined for `schedule_overrides`. `dayKey` may be `restOverride`.
public struct ScheduleWrite: Codable, Sendable, Equatable {
    public var date: String
    public var dayKey: String
    public init(date: String, dayKey: String) { self.date = date; self.dayKey = dayKey }
}

public enum RestOutcome: String, Codable, Sendable {
    case alreadyRest = "already-rest"
    case swapped
    case noSlot = "no-slot"
    case unscheduled
}

public struct RestDayPlan: Codable, Sendable, Equatable {
    public var writes: [ScheduleWrite]
    public var moved: ScheduleDay?
    public var movedTo: String?
    public var sameWeek: Bool
    public var outcome: RestOutcome
}

public struct LoggedDay: Codable, Sendable, Equatable {
    public var date: String
    public var dayKey: String?
    public init(date: String, dayKey: String?) { self.date = date; self.dayKey = dayKey }
}

/// Why a move was refused.
public struct SwapBlock: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case targetLogged = "target-logged", sourceLogged = "source-logged" }
    public var kind: Kind
    public var date: String
    public var dayKey: String?
}

public struct PermanentMovePlan: Sendable, Equatable {
    /// The layout to store, or nil when the move was refused.
    public var layout: DayLayout?
    public var writes: [ScheduleWrite]
    public var pinned: [String]
    public var block: SwapBlock?
}

/// What is actually scheduled on a date, overrides included. nil = rest.
public typealias ResolveDay = (String) -> ScheduleDay?

public enum ScheduleSwap {
    public static let restOverride = "rest"
    /// The rest of this week plus all of the next.
    public static let horizonDays = 13

    // MARK: Sunday-anchored dates

    /// 0 = Sunday … 6 = Saturday, UTC.
    public static func weekday(_ dateISO: String) -> Int? {
        guard let n = ISODate.dayNumber(dateISO) else { return nil }
        return (((n % 7) + 7) % 7 + 4) % 7
    }

    /// Sunday-anchored date for a program weekday in the week containing `dateISO`.
    public static func date(forWeekday weekday: Int, in dateISO: String) -> String? {
        guard let n = ISODate.dayNumber(dateISO), let w = self.weekday(dateISO) else { return nil }
        return ISODate.iso(dayNumber: n - w + weekday)
    }

    /// The seven Sunday-anchored dates of the week containing `dateISO`.
    public static func weekDates(of dateISO: String) -> [String] {
        (0..<7).compactMap { date(forWeekday: $0, in: dateISO) }
    }

    static func sunday(of dateISO: String) -> String? { date(forWeekday: 0, in: dateISO) }

    // MARK: Rest day

    public static func planRestDay(_ dateISO: String, resolve: ResolveDay, horizon: Int = horizonDays) -> RestDayPlan {
        guard let current = resolve(dateISO) else {
            return RestDayPlan(writes: [], moved: nil, movedTo: nil, sameWeek: true, outcome: .alreadyRest)
        }
        let rest = ScheduleWrite(date: dateISO, dayKey: restOverride)
        // `!current.dayKey` — an empty key is as absent as a missing one.
        guard let key = current.dayKey, !key.isEmpty else {
            return RestDayPlan(writes: [rest], moved: current, movedTo: nil, sameWeek: true, outcome: .unscheduled)
        }
        for i in 1...max(1, horizon) where i <= horizon {
            guard let target = ISODate.addDays(dateISO, i) else { continue }
            if resolve(target) != nil { continue }
            return RestDayPlan(
                writes: [rest, ScheduleWrite(date: target, dayKey: key)],
                moved: current, movedTo: target,
                sameWeek: sunday(of: target) == sunday(of: dateISO),
                outcome: .swapped
            )
        }
        return RestDayPlan(writes: [rest], moved: current, movedTo: nil, sameWeek: true, outcome: .noSlot)
    }

    // MARK: Day swap

    /// Place `dayKey` onto `dateISO` as a genuine EXCHANGE.
    public static func planDaySwap(_ dateISO: String, dayKey: String, resolve: ResolveDay, naturalDate: String?) -> [ScheduleWrite] {
        let incoming = ScheduleWrite(date: dateISO, dayKey: dayKey)
        let source = findInWeek(dateISO, dayKey: dayKey, resolve: resolve) ?? naturalDate
        guard let src = source, !src.isEmpty, src != dateISO else { return [incoming] }
        let displacedKey = displacedKey(resolve(dateISO))
        return [incoming, ScheduleWrite(date: src, dayKey: displacedKey)]
    }

    static func displacedKey(_ day: ScheduleDay?) -> String {
        guard let d = day else { return restOverride }
        return d.dayKey ?? restOverride
    }

    static func findInWeek(_ dateISO: String, dayKey: String, resolve: ResolveDay) -> String? {
        for d in weekDates(of: dateISO) where d != dateISO {
            if let s = resolve(d), s.dayKey == dayKey { return d }
        }
        return nil
    }

    // MARK: Logged sessions

    public static func blockForPlacement(_ dateISO: String, dayKey: String, logged: [LoggedDay], sourceDate: String?) -> SwapBlock? {
        if let onTarget = logged.first(where: { $0.date == dateISO }), onTarget.dayKey != dayKey {
            return SwapBlock(kind: .targetLogged, date: dateISO, dayKey: onTarget.dayKey)
        }
        if let src = sourceDate, !src.isEmpty, src != dateISO,
           let onSource = logged.first(where: { $0.date == src }) {
            return SwapBlock(kind: .sourceLogged, date: src, dayKey: onSource.dayKey)
        }
        return nil
    }

    public static func describe(_ block: SwapBlock, labelFor: (String?) -> String) -> String {
        let what = labelFor(block.dayKey)
        let when = shortDayLabel(block.date)
        return block.kind == .targetLogged
            ? "\(when) already has \(what) logged."
            : "\(what) is already logged on \(when) — it can't move."
    }

    // MARK: The permanent tier

    public static func planPermanentMove(
        program: Program, layout: DayLayout, dayKey: String, weekday: Int, todayISO: String,
        logged: [LoggedDay], resolveWith: (String, DayLayout) -> ScheduleDay?
    ) -> PermanentMovePlan {
        let nextLayout = ScheduleLayout.moveDay(program, layout, dayKey: dayKey, weekday: weekday)
        let week = weekDates(of: todayISO)
        let targetDate = date(forWeekday: weekday, in: todayISO) ?? ""
        let sourceDate = week.first { resolveWith($0, layout)?.dayKey == dayKey }

        if let block = blockForPlacement(targetDate, dayKey: dayKey, logged: logged, sourceDate: sourceDate) {
            return PermanentMovePlan(layout: nil, writes: [], pinned: [], block: block)
        }
        var writes: [ScheduleWrite] = []
        for d in week where d < todayISO {
            let before = displacedKey(resolveWith(d, layout))
            let after = displacedKey(resolveWith(d, nextLayout))
            if before != after { writes.append(ScheduleWrite(date: d, dayKey: before)) }
        }
        return PermanentMovePlan(layout: nextLayout, writes: writes, pinned: writes.map(\.date), block: nil)
    }

    // MARK: Labels

    static let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    /// "Wed 6 Aug" — en-GB, weekday short, day numeric, month short ("Sept").
    public static func shortDayLabel(_ dateISO: String) -> String {
        guard let w = weekday(dateISO), let day = Int(dateISO.dropFirst(8).prefix(2)) else { return "Invalid Date" }
        return "\(weekdays[w]) \(day) \(WeeklyExport.month(dateISO))"
    }

    public static func describe(_ plan: RestDayPlan) -> String {
        let name = plan.moved?.label ?? "The session"
        switch plan.outcome {
        case .alreadyRest: return "Already a rest day."
        case .swapped: return "\(name) moved to \(shortDayLabel(plan.movedTo ?? ""))\(plan.sameWeek ? "" : " — next week")."
        case .noSlot: return "Rest day set. No free rest slot in the next \(horizonDays) days, so \(name) was dropped."
        case .unscheduled: return "Rest day set."
        }
    }
}
