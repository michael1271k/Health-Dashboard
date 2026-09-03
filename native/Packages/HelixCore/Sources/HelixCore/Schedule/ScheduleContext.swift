import Foundation

/// The pure schedule core — `scheduleDayIn` / `isTrainingDayIn` /
/// `sessionTargetIn` from `src/lib/programs.ts`.
///
/// ── WHY A CONTEXT VALUE AND NOT MORE ARGUMENTS ───────────────────────────────
/// The web resolves four things — the plan, the phase, the per-date swaps and
/// the permanent weekday layout — and every one of them lived behind
/// `localStorage`. On a server all four silently answered with a default, so
/// the widget announced the wrong session and the scorer graded rest days
/// against a week the athlete was not training. The fix was to state the four
/// inputs once, as a value, and run exactly one rule over them. That value is
/// this struct; the native app fills it from GRDB the way a route fills it from
/// `user_goals`, `schedule_overrides` and `program_day_layout`.
///
/// Nothing here reads a global or a clock.
public struct ScheduleDay: Codable, Equatable, Sendable {
    public var label: String
    public var sub: String?
    /// Absent only for a resolver that hands back a bare label — every plan in
    /// the catalogue, PPL included, has keys now.
    public var dayKey: String?

    public init(label: String, sub: String? = nil, dayKey: String? = nil) {
        self.label = label; self.sub = sub; self.dayKey = dayKey
    }

    init(_ day: ProgramDay) {
        self.init(label: day.label, sub: day.sub, dayKey: day.key)
    }
}

/// Everything the schedule rule needs, with nothing read from a global.
public struct ScheduleContext: Codable, Equatable, Sendable {
    public var programId: String
    public var phase: ProgramPhase
    /// `date → day_key | "rest"` (`schedule_overrides`).
    public var overrides: [String: String]
    /// `dayKey → weekday` for THIS plan (`program_day_layout`).
    public var layout: DayLayout

    public init(programId: String, phase: ProgramPhase, overrides: [String: String] = [:], layout: DayLayout = [:]) {
        self.programId = programId; self.phase = phase; self.overrides = overrides; self.layout = layout
    }
}

public enum Schedule {

    /// The override value that clears a training day. `REST_OVERRIDE`.
    public static let restOverride = "rest"

    /// The plan that owns a date, era-aware.
    ///
    /// Every date before the cut opened resolves against PPL with an EMPTY
    /// layout, whatever plan is selected: `program_day_layout` records a remap
    /// of the plan you are RUNNING, and applying it to a finished block would
    /// move history. An unknown `programId` falls back to Helix-5, as
    /// `PROGRAMS[id] ?? APEX51` does.
    public static func programForContext(_ ctx: ScheduleContext, _ dateISO: String) -> (program: Program, layout: DayLayout) {
        if Era.forDate(dateISO) == .ppl { return (Program.pplLegacy, [:]) }
        return (Program.byId(ctx.programId) ?? .helix5, ctx.layout)
    }

    /// `scheduleDayIn` — what is scheduled on a date. nil = rest.
    ///
    /// A per-date swap wins over the weekday default. An override naming a day
    /// this plan does not have is a stale row from a plan the user has left;
    /// it falls through to the weekday default rather than inventing a session.
    public static func scheduleDayIn(_ ctx: ScheduleContext, _ dateISO: String) -> ScheduleDay? {
        let (program, layout) = programForContext(ctx, dateISO)
        if let override = ctx.overrides[dateISO] {
            if override == restOverride { return nil }
            if let od = program.day(key: override) { return ScheduleDay(od) }
        }
        guard let weekday = ISODate.weekday(dateISO) else { return nil }
        return ScheduleLayout.programDayIn(program, layout, weekday).map(ScheduleDay.init)
    }

    /// `isTrainingDayIn`. Note the asymmetry with `scheduleDayIn`, kept on
    /// purpose: ANY non-rest override answers true here — including a stale
    /// key that `scheduleDayIn` would fall through on. The two can disagree
    /// about a Wednesday carrying a key from an abandoned plan; the vectors
    /// pin that, and it is the web's behaviour, not a port slip.
    public static func isTrainingDayIn(_ ctx: ScheduleContext, _ dateISO: String) -> Bool {
        if let override = ctx.overrides[dateISO] { return override != restOverride }
        guard let weekday = ISODate.weekday(dateISO) else { return false }
        let (program, layout) = programForContext(ctx, dateISO)
        return ScheduleLayout.programDayIn(program, layout, weekday) != nil
    }

    /// `sessionTargetIn` — how many sessions the plan schedules in a week, the
    /// denominator on "3/5". Off the UNTRIMMED plan: a cut drops lifts, never
    /// days. Not era-aware — it is about the plan you are running.
    public static func sessionTargetIn(_ ctx: ScheduleContext) -> Int {
        (Program.byId(ctx.programId) ?? .helix5).days.count
    }
}
