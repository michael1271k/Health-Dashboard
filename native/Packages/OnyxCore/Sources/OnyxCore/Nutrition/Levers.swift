import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// Phase levers — the rungs of the cut, in code, with one selection in the
// database. A port of `src/lib/nutrition/levers.ts`.
//
// A deficit has two dials: eat less, or move more. A lever is one named
// combination of both. EVERY MACRO TRIPLE IS ATWATER-EXACT (4/4/9): the
// calorie figure is the SUM of the macros, never a round number written beside
// them — `1950` was five kcal wrong for months that way.
//
// THE LEVER IS DATE-BOUND. `user_goals.active_lever` is one mutable value, and
// every grader used to read it — including graders of days that finished weeks
// ago. Pulling Lever 1 on 16 Aug silently re-marked the month behind it. So the
// past belongs to `schedule` and today-and-after belong to the selection you
// are holding; `leverForDate` is the one thing every grader asks.
//
// A rung coming OFF is also an event: a row goes in whenever the rung CHANGES,
// and going back to your own numbers (`custom`) is a change. A release must
// always be followed by the rung that resumes, or it is a permanent 2,151 kcal.
// ─────────────────────────────────────────────────────────────────────────────

public enum LeverId: String, Codable, Sendable, CaseIterable {
    case baseline
    case lever1 = "lever-1"
    case lever2 = "lever-2"
    case maintenanceWeek = "maintenance-week"
    /// A real selection — "these are my figures, leave them alone" — that names NO rung.
    case custom
}

/// `deficit` rungs are the ordered ladder; `release` is a planned, bounded week
/// at maintenance taken ON PURPOSE inside a cut — a rung by every mechanic, and
/// emphatically not a step on the ladder.
public enum LeverKind: String, Codable, Sendable { case deficit, release }

public struct NutritionLever: Codable, Equatable, Sendable {
    public var id: LeverId
    public var kind: LeverKind
    public var label: String
    public var summary: String
    public var calorieGoal: Double
    public var proteinGoalG: Double
    public var carbsGoalG: Double
    public var fatGoalG: Double
    public var stepsGoal: Double
}

/// The goal fields a lever replaces. Everything else it leaves alone.
public struct LeverGoals: Codable, Equatable, Sendable {
    public var calorie: Double
    public var protein: Double?
    public var carbs: Double?
    public var fat: Double?
    public var steps: Double?
    public init(calorie: Double, protein: Double?, carbs: Double?, fat: Double?, steps: Double?) {
        self.calorie = calorie; self.protein = protein; self.carbs = carbs; self.fat = fat; self.steps = steps
    }
}

/// A row of the SCHEDULE — "this rung came into force on this date".
public struct LeverPeriod: Codable, Equatable, Sendable {
    /// First date this rung applies to, inclusive.
    public var from: String
    public var leverId: LeverId
    /// Only ever on a `custom` row, and only on a CLOSED stretch: the numbers
    /// that were in force from `from` until the next row. Absent means the
    /// stretch is still open and answers with the live `user_goals` row.
    public var goals: LeverGoals?
}

/// The RESOLVED answer for a run of days that shared one set of targets.
public struct TargetPeriod: Codable, Equatable, Sendable {
    public var leverId: LeverId
    /// "Lever 1" / "Baseline" / "Custom".
    public var label: String
    public var goals: LeverGoals
    /// ISO dates, in input order. Contiguous by construction.
    public var dates: [String]
}

public enum Levers {
    /// The rungs, easiest first. `custom` is deliberately NOT here.
    public static let all: [NutritionLever] = [
        NutritionLever(id: .baseline, kind: .deficit, label: "Baseline",
                       summary: "The plan as written — full carbs, 10k steps.",
                       calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55, stepsGoal: 10000),
        NutritionLever(id: .lever1, kind: .deficit, label: "Lever 1",
                       summary: "−70 kcal off carbs and fat, steps to 10k.",
                       calorieGoal: 1885, proteinGoalG: 170, carbsGoalG: 182, fatGoalG: 53, stepsGoal: 10000),
        // From here the FOOD stops moving; the deficit deepens with movement.
        // The last rung is a BAND: 12k is the floor that counts, 15k is where it runs out.
        NutritionLever(id: .lever2, kind: .deficit, label: "Lever 2",
                       summary: "Same food as Lever 1, steps 12k–15k. The last rung.",
                       calorieGoal: 1885, proteinGoalG: 170, carbsGoalG: 182, fatGoalG: 53, stepsGoal: 12000),
        // The maintenance week — a lever, not a phase (a phase would change the
        // training programme and has no end date). 2,151 = 170·4 + 244·4 + 55·9.
        NutritionLever(id: .maintenanceWeek, kind: .release, label: "Maintenance Week",
                       summary: "A planned week at maintenance — full food, lighter steps. Still cutting.",
                       calorieGoal: 2151, proteinGoalG: 170, carbsGoalG: 244, fatGoalG: 55, stepsGoal: 7500),
    ]

    /// The ordered ladder — the rungs the "each is harder than the last" rule governs.
    public static let deficit: [NutritionLever] = all.filter { $0.kind == .deficit }

    public static let defaultLever: LeverId = .baseline

    /// WHEN each rung came into force. Inclusive lower bounds, newest LAST.
    public static let schedule: [LeverPeriod] = [
        LeverPeriod(from: "2026-07-15", leverId: .baseline),
        LeverPeriod(from: "2026-08-16", leverId: .lever1),
        // Released — back to hand-set numbers. The stretch is CLOSED (the
        // maintenance week opens on 30 Aug), so it pins what it meant: 1,999.
        LeverPeriod(from: "2026-08-20", leverId: .custom, goals: LeverGoals(calorie: 1999, protein: 170, carbs: 206, fat: 55, steps: 10000)),
        // The scheduled maintenance week, and its end. The second row is not optional.
        LeverPeriod(from: "2026-08-30", leverId: .maintenanceWeek),
        // Open stretch — no goals, so it answers with the live `user_goals` row.
        LeverPeriod(from: "2026-09-06", leverId: .custom),
    ]

    /// The schedule row covering a date, or nil before the cut opened.
    public static func scheduledPeriod(on dateISO: String) -> LeverPeriod? {
        var found: LeverPeriod?
        for p in schedule {
            if dateISO >= p.from { found = p } else { break }
        }
        return found
    }

    /// The rung the SCHEDULE puts on a date, or nil before the cut opened.
    public static func scheduledLever(on dateISO: String) -> LeverId? {
        scheduledPeriod(on: dateISO)?.leverId
    }

    /// The rung in force on a date — the one thing every grader should ask.
    ///
    /// The past belongs to the schedule; today and after belong to the stored
    /// selection when it is a valid id — except a `release` past `releaseEndsOn`
    /// (`user_goals.maintenance_until`), which stops being honoured and falls
    /// back to the schedule so a release closes itself whether or not anyone
    /// remembered to. `today` is a parameter, never a clock.
    public static func leverForDate(_ dateISO: String, stored: String?, today: String, releaseEndsOn: String? = nil) -> LeverId? {
        if dateISO >= today, let id = leverId(stored) {
            let expired = releaseEndsOn != nil && releaseEndsOn != ""
                && lever(byId: stored)?.kind == .release
                && dateISO > releaseEndsOn!
            if !expired { return id }
        }
        return scheduledLever(on: dateISO)
    }

    /// The rung a stored value names, or nil for `custom` / unknown / absent.
    public static func lever(byId id: String?) -> NutritionLever? {
        guard let id, !id.isEmpty else { return nil }
        return all.first { $0.id.rawValue == id }
    }

    /// Is this a value the lever column may hold at all?
    public static func isLeverId(_ id: String?) -> Bool { leverId(id) != nil }

    private static func leverId(_ id: String?) -> LeverId? {
        guard let id else { return nil }
        return LeverId(rawValue: id)
    }

    /// Atwater energy of a macro triple, for the invariant every rung must satisfy.
    public static func atwaterKcal(proteinG: Double, carbsG: Double, fatG: Double) -> Double {
        proteinG * 4 + carbsG * 4 + fatG * 9
    }

    /// Apply a lever over resolved goals. Hands the input back untouched for
    /// `custom`, an unknown id and no selection — the three cases where the
    /// user has not asked for a rung.
    public static func applyLever(_ goals: LeverGoals, _ leverId: String?) -> LeverGoals {
        guard let lever = lever(byId: leverId) else { return goals }
        return LeverGoals(calorie: lever.calorieGoal, protein: lever.proteinGoalG, carbs: lever.carbsGoalG, fat: lever.fatGoalG, steps: lever.stepsGoal)
    }

    /// The targets that were in force on a date — rung, pinned history, or your
    /// row. A real rung wins; otherwise a `custom` row's pinned goals (that
    /// stretch is finished and said what it meant); otherwise the fallback,
    /// the live `user_goals` row, correct only for the stretch you are inside.
    public static func goalsForDate(_ dateISO: String, stored: String?, today: String, fallback: LeverGoals, releaseEndsOn: String? = nil) -> LeverGoals {
        let id = leverForDate(dateISO, stored: stored, today: today, releaseEndsOn: releaseEndsOn) ?? defaultLever
        if lever(byId: id.rawValue) != nil { return applyLever(fallback, id.rawValue) }
        return scheduledPeriod(on: dateISO)?.goals ?? fallback
    }

    /// Which KIND of week a date belongs to. `custom` and any date before the
    /// cut opened are `deficit`; only a `release` rung is the other thing.
    public static func leverKind(on dateISO: String, stored: String?, today: String, releaseEndsOn: String? = nil) -> LeverKind {
        let id = leverForDate(dateISO, stored: stored, today: today, releaseEndsOn: releaseEndsOn)
        return lever(byId: id?.rawValue)?.kind ?? .deficit
    }

    /// Which targets were in force on each day of a range, collapsed into runs.
    ///
    /// Resolve every day (rung ⊂ pinned custom ⊂ fallback, then the day's own
    /// `daily_targets` row on top) and glue equal NEIGHBOURS. Runs are compared
    /// on the RESOLVED GOALS, not the rung's name: two rungs asking for the same
    /// food and steps are the same instruction however they are labelled.
    public static func leverPeriods(
        _ dates: [String], stored: String?, today: String, fallback: LeverGoals,
        releaseEndsOn: String? = nil, dailyTargets: [DailyTarget]? = nil
    ) -> [TargetPeriod] {
        var out: [TargetPeriod] = []
        // `new Map(rows.map(t => [t.date, t]))` — a later duplicate wins.
        var overrides: [String: DailyTarget] = [:]
        for t in dailyTargets ?? [] { overrides[t.date] = t }

        for date in dates {
            let id = leverForDate(date, stored: stored, today: today, releaseEndsOn: releaseEndsOn) ?? defaultLever
            let goals = DailyTargets.apply(
                goalsForDate(date, stored: stored, today: today, fallback: fallback, releaseEndsOn: releaseEndsOn),
                overrides[date]
            )
            if let last = out.indices.last, out[last].goals == goals {
                out[last].dates.append(date)
                continue
            }
            // `lever(byId:)` is nil for `custom`, which is the point — it names
            // the ABSENCE of a rung, and the numbers beside it are the user's own.
            out.append(TargetPeriod(leverId: id, label: lever(byId: id.rawValue)?.label ?? "Custom", goals: goals, dates: [date]))
        }
        return out
    }
}
