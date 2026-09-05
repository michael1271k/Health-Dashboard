import Foundation

/// Day-swap planning — a port of `src/lib/schedule/swap.ts`.
///
/// ── THE BUG THIS EXISTS TO FIX ───────────────────────────────────────────────
/// "Rest Day" used to write ONE row: `{today: rest}`. That is not a swap, it is
/// a deletion — the week lost a session and nothing said so. A rest day taken
/// because you slept four hours is a REARRANGEMENT of the week, so taking one
/// has to move the work somewhere: the next date whose effective schedule is
/// already rest, read from the plan (Helix-5 rests Wed and Sat, PPL Wed and
/// Sat, a plan swapped in Settings brings its own).
///
/// `resolve` is INJECTED rather than imported so the caller decides what
/// "effective" means — in the app that is `Schedule.scheduleDayIn` over the
/// live context. Everything here is a pure function of its arguments.
public struct ScheduleWrite: Codable, Equatable, Sendable {
    public var date: String
    /// A program day key, or `Schedule.restOverride`.
    public var dayKey: String
    public init(date: String, dayKey: String) { self.date = date; self.dayKey = dayKey }
}

public enum RestOutcome: String, Codable, Sendable {
    /// The date was already rest — nothing to do.
    case alreadyRest = "already-rest"
    /// The workout found a home; `movedTo` says where.
    case swapped
    /// Every day inside the horizon is already spoken for.
    case noSlot = "no-slot"
    /// A day with a label but no `dayKey` — there is no key to place anywhere.
    case unscheduled
}

public struct RestDayPlan: Equatable, Sendable {
    public var writes: [ScheduleWrite]
    /// The workout that was on the date, or nil when it was already rest.
    public var moved: ScheduleDay?
    /// Where it landed, or nil when nothing moved / nowhere to put it.
    public var movedTo: String?
    /// False when the only free slot was in the following week.
    public var sameWeek: Bool
    public var outcome: RestOutcome
}

/// What is actually scheduled on a date, overrides included. nil = rest.
public typealias ResolveDay = @Sendable (String) -> ScheduleDay?

/// A committed session, as the scheduler needs to see it.
public struct LoggedDay: Codable, Equatable, Sendable {
    public var date: String
    public var dayKey: String?
    public init(date: String, dayKey: String?) { self.date = date; self.dayKey = dayKey }
}

/// Why a move was refused.
public struct SwapBlock: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case targetLogged = "target-logged", sourceLogged = "source-logged" }
    public var kind: Kind
    public var date: String
    /// What was logged there — nil when the session carried no key.
    public var dayKey: String?
}

public struct PermanentMovePlan: Equatable, Sendable {
    /// The layout to store, or nil when the move was refused.
    public var layout: DayLayout?
    /// Per-date overrides that PIN already-happened days to what they were.
    public var writes: [ScheduleWrite]
    /// Those dates, so the UI can say which part of this week is unaffected.
    public var pinned: [String]
    public var block: SwapBlock?
}

public enum Swap {

    /// How far ahead a displaced workout may be re-homed: the rest of this week
    /// plus all of the next. Beyond that it is no longer the same training week.
    public static let horizonDays = 13

    /// Sunday-anchored date for a program weekday in the week containing
    /// `dateISO`. Deliberately Sunday-anchored regardless of the display
    /// week-start preference: `ProgramDay.weekday` is 0 = Sun by definition.
    /// Any integer weekday is honoured (7 is next Sunday, -1 last Saturday),
    /// exactly as `setUTCDate` overflows. Echoes an unparseable date, where the
    /// web throws.
    public static func dateForWeekday(_ dateISO: String, _ weekday: Int) -> String {
        guard let n = ISODate.dayNumber(dateISO) else { return dateISO }
        return ISODate.iso(dayNumber: n - ISODate.weekday(dayNumber: n) + weekday)
    }

    /// The seven Sunday-anchored dates of the week containing `dateISO`.
    public static func weekDatesOf(_ dateISO: String) -> [String] {
        (0..<7).map { dateForWeekday(dateISO, $0) }
    }

    private static func sundayOf(_ dateISO: String) -> String { dateForWeekday(dateISO, 0) }

    /// Take a rest day on `dateISO`, moving whatever was scheduled there onto
    /// the next date the plan already rests. The search runs FORWARD only — a
    /// "next available" slot that lands on Monday when it is Thursday would
    /// quietly rewrite a week that has already been reported on.
    public static func planRestDay(_ dateISO: String, resolve: ResolveDay, horizon: Int = horizonDays) -> RestDayPlan {
        guard let current = resolve(dateISO) else {
            return RestDayPlan(writes: [], moved: nil, movedTo: nil, sameWeek: true, outcome: .alreadyRest)
        }
        let rest = ScheduleWrite(date: dateISO, dayKey: Schedule.restOverride)

        // A bare label with no program key: nothing to place, the day just rests.
        guard let dayKey = current.dayKey, !dayKey.isEmpty else {
            return RestDayPlan(writes: [rest], moved: current, movedTo: nil, sameWeek: true, outcome: .unscheduled)
        }

        for i in stride(from: 1, through: horizon, by: 1) {
            guard let target = ISODate.addDays(dateISO, i) else { break }
            if resolve(target) != nil { continue }
            return RestDayPlan(
                writes: [rest, ScheduleWrite(date: target, dayKey: dayKey)],
                moved: current, movedTo: target,
                sameWeek: sundayOf(target) == sundayOf(dateISO),
                outcome: .swapped
            )
        }
        return RestDayPlan(writes: [rest], moved: current, movedTo: nil, sameWeek: true, outcome: .noSlot)
    }

    /// Place `dayKey` onto `dateISO` as a genuine EXCHANGE: the displaced day
    /// takes the vacated slot, so the week keeps the same set of sessions in a
    /// different order. `naturalDate` is the incoming day's own weekday slot,
    /// used only when the day isn't currently placed anywhere in this week (so
    /// a day already moved once is not duplicated onto two dates).
    public static func planDaySwap(_ dateISO: String, dayKey: String, resolve: ResolveDay, naturalDate: String?) -> [ScheduleWrite] {
        let incoming = ScheduleWrite(date: dateISO, dayKey: dayKey)
        // `findInWeek(...) ?? naturalDate`, then `!source` — an empty string is
        // falsy in the web and is treated the same here.
        let source = findInWeek(dateISO, dayKey, resolve) ?? naturalDate
        guard let source, !source.isEmpty, source != dateISO else { return [incoming] }
        return [incoming, ScheduleWrite(date: source, dayKey: keyOrRest(resolve(dateISO)))]
    }

    /// Where `dayKey` currently sits in this week, if anywhere.
    private static func findInWeek(_ dateISO: String, _ dayKey: String, _ resolve: ResolveDay) -> String? {
        weekDatesOf(dateISO).first { $0 != dateISO && resolve($0)?.dayKey == dayKey }
    }

    /// `displaced === 'rest' ? REST : (displaced.dayKey ?? REST)`.
    private static func keyOrRest(_ day: ScheduleDay?) -> String {
        day?.dayKey ?? Schedule.restOverride
    }

    // MARK: What a LOGGED session does to a swap

    /// Can `dayKey` be placed on `dateISO`?
    ///
    /// A session is attributed by its own `day_key`, never by the weekday it
    /// landed on. The plan says what is PLANNED. They contradict each other in
    /// exactly one situation: a date holds a committed session AND the plan is
    /// changed to say a different day belongs there.
    ///
    ///   · TARGET already logged — refused, unless the incoming key IS what was
    ///     logged (a no-op).
    ///   · SOURCE already logged — the session stays put (it keeps its own key)
    ///     and a fresh slot opens elsewhere, so the week counts it twice. A
    ///     completed day cannot be moved.
    public static func blockForPlacement(_ dateISO: String, dayKey: String, logged: [LoggedDay], sourceDate: String?) -> SwapBlock? {
        if let onTarget = logged.first(where: { $0.date == dateISO }), onTarget.dayKey != dayKey {
            return SwapBlock(kind: .targetLogged, date: dateISO, dayKey: onTarget.dayKey)
        }
        if let sourceDate, !sourceDate.isEmpty, sourceDate != dateISO,
           let onSource = logged.first(where: { $0.date == sourceDate }) {
            return SwapBlock(kind: .sourceLogged, date: sourceDate, dayKey: onSource.dayKey)
        }
        return nil
    }

    /// One sentence naming what stands in the way.
    public static func describeBlock(_ block: SwapBlock, labelFor: (String?) -> String) -> String {
        let what = labelFor(block.dayKey)
        switch block.kind {
        case .targetLogged: return "\(shortDayLabel(block.date)) already has \(what) logged."
        case .sourceLogged: return "\(what) is already logged on \(shortDayLabel(block.date)) — it can't move."
        }
    }

    // MARK: The PERMANENT tier

    /// Move a day permanently, and protect the part of this week that already
    /// happened.
    ///
    /// A permanent layout change needs NO writes to take effect — every date
    /// without a per-date override picks it up, forever. The writes exist to
    /// stop it applying where it must not: the layout is read for EVERY date,
    /// so it would also rewrite the earlier days of the current week. Every day
    /// of this week that is SPENT (simply before today) and whose meaning the
    /// change would alter is pinned to what it was. A logged today needs no
    /// extra clause: an exchange changes exactly two weekdays, and
    /// `blockForPlacement` has already refused both when today carries a session.
    public static func planPermanentMove(
        program: Program, layout: DayLayout, dayKey: String, weekday: Int, todayISO: String,
        logged: [LoggedDay], resolveWith: @Sendable (String, DayLayout) -> ScheduleDay?
    ) -> PermanentMovePlan {
        let nextLayout = ScheduleLayout.moveDay(program, layout, dayKey, weekday)
        let week = weekDatesOf(todayISO)
        let targetDate = dateForWeekday(todayISO, weekday)
        let sourceDate = week.first { resolveWith($0, layout)?.dayKey == dayKey }

        if let block = blockForPlacement(targetDate, dayKey: dayKey, logged: logged, sourceDate: sourceDate) {
            return PermanentMovePlan(layout: nil, writes: [], pinned: [], block: block)
        }

        var writes: [ScheduleWrite] = []
        for d in week where d < todayISO {
            let before = keyOrRest(resolveWith(d, layout))
            let after = keyOrRest(resolveWith(d, nextLayout))
            if before != after { writes.append(ScheduleWrite(date: d, dayKey: before)) }
        }
        return PermanentMovePlan(layout: nextLayout, writes: writes, pinned: writes.map(\.date), block: nil)
    }

    // MARK: Labels

    private static let weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    /// en-GB abbreviated months, CLDR ≥ 38: September is "Sept", not "Sep".
    private static let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]

    /// "Wed 6 Aug" — `toLocaleDateString('en-GB', { weekday: 'short',
    /// day: 'numeric', month: 'short', timeZone: 'UTC' })`, spelled out rather
    /// than asked of a `DateFormatter`, so it cannot drift with the device
    /// locale. Echoes an unparseable date, where the web prints "Invalid Date".
    public static func shortDayLabel(_ dateISO: String) -> String {
        guard let n = ISODate.dayNumber(dateISO) else { return dateISO }
        let parts = dateISO.split(separator: "-")
        let month = Int(parts[1])!, day = Int(parts[2])!
        return "\(weekdayNames[ISODate.weekday(dayNumber: n)]) \(day) \(monthNames[month - 1])"
    }

    /// One sentence describing what a rest-day plan did, for the UI to echo back.
    public static func describeRestPlan(_ plan: RestDayPlan) -> String {
        let name = plan.moved?.label ?? "The session"
        switch plan.outcome {
        case .alreadyRest:
            return "Already a rest day."
        case .swapped:
            return "\(name) moved to \(shortDayLabel(plan.movedTo ?? ""))\(plan.sameWeek ? "" : " — next week")."
        case .noSlot:
            return "Rest day set. No free rest slot in the next \(horizonDays) days, so \(name) was dropped."
        case .unscheduled:
            return "Rest day set."
        }
    }
}
