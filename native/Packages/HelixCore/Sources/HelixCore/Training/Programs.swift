import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// Which plan you are running, in which direction, and what that direction is
// aiming at.
//
// This is the PREFERENCE half of `src/lib/programs.ts`, joined to the phase
// presets in `src/lib/types/workout.ts` and to `PROGRAM_TARGETS` in
// `src/lib/training/landmarks.ts`. Those three files answer one question
// between them — "what am I doing this block, and what counts as doing it" —
// and in the web app the answer is spread across three imports and a browser
// API. Here it is one file with no I/O in it.
//
// ── WHAT IS DELIBERATELY NOT PORTED ──────────────────────────────────────────
// `programs.ts` also carries `activeProgram()`'s cache, the `helix_active_plan`
// and `helix_active_phase` localStorage keys, a version counter and a
// `window.dispatchEvent` bus. None of that is domain logic: it exists because
// those values are read SYNCHRONOUSLY during a React render, so a change
// arriving from another device had nothing to re-render. The native app reads
// the selection out of GRDB and observes the table, which is the same problem
// solved by the storage layer instead of by a global. Porting the workaround
// would import the bug it works around.
//
// The DECK — days, exercises, set counts — is `Training/Program.swift`. It is
// already ported and this file does not restate it.
// ─────────────────────────────────────────────────────────────────────────────

// MARK: - The plan catalogue

/// One selectable plan, WITHOUT its deck.
///
/// The web `Program` interface carries `days` as well, because there it is one
/// type doing two jobs: the picker's catalogue entry and the training
/// prescription. Only Helix-5's deck is ported (`Program.helix5`), and the
/// picker needs to list all three plans regardless — so the catalogue entry is
/// its own small value and the deck stays a separate one.
///
/// `era`, `active` and `drawer` are dropped on purpose: they are web layout
/// flags (which sheet a plan appears in), and the native picker is one list.
public struct PlanInfo: Identifiable, Codable, Equatable, Sendable {
    /// The stored id. Not a display value and NOT renameable — see `apex51`.
    public let id: String
    public let label: String
    /// The one-line description under the plan's name in the picker.
    ///
    /// Optional in the TypeScript interface and present on all three plans, so
    /// it is a plain `String` here rather than an optional nobody would find
    /// nil. `golden-vectors.test.ts` asserts that on the TS side.
    public let blurb: String
    /// A historical plan — still selectable so old sessions render correctly,
    /// but sorted below the live ones.
    public let isLegacy: Bool

    public init(id: String, label: String, blurb: String, isLegacy: Bool = false) {
        self.id = id
        self.label = label
        self.blurb = blurb
        self.isLegacy = isLegacy
    }
}

public enum Programs {

    /// The plan a device falls back to when it has no valid selection.
    public static let defaultPlanId = "apex51"

    /// `PROGRAMS`, in declaration order.
    ///
    /// ── WHY HELIX-5's ID IS `apex51` ─────────────────────────────────────────
    /// The plan was renamed and the id was not. It is the key a season of
    /// `localStorage` entries, Supabase rows and exported reports were written
    /// under, so renaming it would not rename the history — it would orphan it.
    /// An id is a join key that happens to be readable, never a label.
    public static let all: [PlanInfo] = [
        PlanInfo(
            id: "apex51",
            label: "Helix-5",
            blurb: "5-day antagonist hybrid — Sun/Mon/Tue/Thu/Fri, Wed & Sat Zone-2 rest."
        ),
        PlanInfo(
            id: "axis4",
            label: "Helix-4",
            blurb: "4-day upper/lower backup — Mon/Tue/Thu/Fri. Bulk adds volume; cut trims it."
        ),
        PlanInfo(
            id: "ppl",
            label: "Push/Pull/Legs",
            blurb: "Historical Push/Pull/Legs — Sun/Thu Push · Mon/Fri Pull · Tue Legs · Wed & Sat rest.",
            isLegacy: true
        ),
    ]

    /// `planList()` — live plans first, legacy last. The order of the plan cards.
    ///
    /// ── WHY THIS IS A PARTITION AND NOT A `sorted(by:)` ──────────────────────
    /// The TypeScript sorts on `Number(legacy) - Number(legacy)`, which leaves
    /// every live plan tied with every other live plan. `Array.prototype.sort`
    /// has been REQUIRED to be stable since ES2019, so those ties keep
    /// declaration order and Helix-5 stays ahead of Helix-4. Swift's `sorted`
    /// is an introsort and is explicitly NOT stable: the same predicate here
    /// would be free to hand back Helix-4 first, on some inputs, on some
    /// releases of the standard library. Two filters are a stable partition by
    /// construction, and they are also shorter.
    public static let pickerOrder: [PlanInfo] = all.filter { !$0.isLegacy } + all.filter { $0.isLegacy }

    /// The catalogue entry for an id, or nil when nothing claims it.
    public static func plan(id: String) -> PlanInfo? {
        all.first { $0.id == id }
    }

    /// Ids that no longer name a plan, and the plan that absorbed them.
    ///
    /// Helix-4 used to ship as two plans, "Builder" and "Defender". They are
    /// one plan with two PHASES now — same movements, different set counts —
    /// but a device that last synced before the consolidation still holds the
    /// old string, and a stale id must never dead-end a picker.
    private static let legacyPlanId: [String: String] = [
        "axis4_builder": "axis4",
        "axis4_defender": "axis4",
    ]

    /// A valid, known plan id, or nil.
    ///
    /// ── WHY THIS RETURNS NIL AND NOT THE DEFAULT ─────────────────────────────
    /// The fallback is the CALLER's decision, and the callers disagree: a
    /// picker restoring a selection wants `defaultPlanId`, but a migration
    /// auditing a stored row wants to know the row is broken. Baking the
    /// default in here would make the second question unaskable.
    ///
    /// The match is exact — no trimming, no case folding. Every id in this
    /// table was written by this app, so a padded or mis-cased one did not come
    /// from a place worth guessing on behalf of.
    public static func normalizePlanId(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        let id = legacyPlanId[raw] ?? raw
        return plan(id: id) != nil ? id : nil
    }
}

// MARK: - Reading a stored phase

public extension ProgramPhase {

    /// Narrow a stored phase string — from `user_goals.active_phase`,
    /// `goal_preset`, or a mirrored preference — to one of the two directions.
    ///
    /// ── ONE RULE THAT THE WEB WRITES TWICE ───────────────────────────────────
    /// `activePhase()` in `programs.ts` reads localStorage and `asNutritionMode`
    /// in `types/workout.ts` reads a database column, and both narrow with
    /// `=== 'bulk' ? 'bulk' : 'cut'`. They are the same rule about the same
    /// value arriving by two routes, so this is the single Swift copy; the
    /// golden vectors assert the two TypeScript versions still agree, which is
    /// what makes collapsing them safe.
    ///
    /// ── AND WHY `maintenance` READS AS A CUT ─────────────────────────────────
    /// `maintenance` was deleted as a phase on 2026-08-30 — a week at
    /// maintenance calories is a nutrition LEVER applied on top of whichever
    /// direction the block is running, not a third direction. Rows written
    /// before that still hold the string. It used to resolve to the BULK deck,
    /// purely by accident of a `!== 'cut'` test; it resolves to the cut now,
    /// which is the block it was always taken inside of.
    static func stored(_ raw: String?) -> ProgramPhase {
        raw == "bulk" ? .bulk : .cut
    }
}

// MARK: - Phase goals

/// What a phase is steering toward — `NutritionPreset` in `types/workout.ts`.
///
/// Every field is a STARTING value that Settings seeds into `user_goals` and
/// the user then tunes. It is a suggestion with a number on it, not a constant,
/// which is why nothing downstream should read these directly when a stored
/// goal exists.
///
/// The optionals are optional because they genuinely do not apply: a cut has no
/// body-fat CEILING (it is walking away from one), and a phase graded on
/// calories alone has no macro target. `nil` here is "this phase does not have
/// that goal", and it must never arrive as `0` — a fat target of zero is a diet
/// instruction, an absent one is silence.
public struct PhaseGoals: Codable, Equatable, Sendable {
    public var phase: ProgramPhase
    public var label: String
    public var calorieGoal: Double
    public var proteinGoalG: Double?
    public var carbsGoalG: Double?
    public var fatGoalG: Double?
    public var fiberGoalG: Double?
    /// The band `fiberGoalG` sits inside. Display-only — there is no column.
    public var fiberMin: Double?
    public var fiberMax: Double?
    /// A cut leans on NEAT harder than a bulk does, so this moves with the phase.
    public var stepsGoal: Double
    public var targetWeightKg: Double
    public var targetBodyFatPct: Double?
    public var targetMuscleMassKg: Double?
    /// Signed: negative on a cut, positive on a bulk. The weekly bodyweight
    /// band the phase expects to move in.
    public var rateMinKgWk: Double?
    public var rateMaxKgWk: Double?
    /// Bulk only — the body-fat percentage at which the bulk ends.
    public var bodyFatCeilingPct: Double?
}

public extension PhaseGoals {

    /// The Helix cut. 1955 kcal = 170·4 + 195·4 + 55·9, exactly.
    ///
    /// The calorie figure is not a preference sitting beside the macros, it is
    /// their sum. It read 1950 here while the server's fallback read 1955, so
    /// the same day could be graded against two different targets depending on
    /// which file answered first.
    static let cut = PhaseGoals(
        phase: .cut,
        label: "Cut",
        calorieGoal: 1955,
        proteinGoalG: 170,
        carbsGoalG: 195,
        fatGoalG: 55,
        fiberGoalG: 30,
        fiberMin: 28,
        fiberMax: 35,
        stepsGoal: 10000,
        targetWeightKg: 62,
        targetBodyFatPct: 13.0,
        targetMuscleMassKg: 33.0,
        rateMinKgWk: -0.50,
        rateMaxKgWk: -0.40,
        bodyFatCeilingPct: nil
    )

    /// The Helix lean bulk. `fatGoalG` is a HARD CAP rather than a target.
    ///
    /// Note that 160·4 + 330·4 + 70·9 is 2590, not 2600: this triple is the one
    /// place in HELIX where the calorie figure is NOT the Atwater sum of its
    /// macros. It is copied faithfully from `NUTRITION_PRESETS` — the golden
    /// vectors would fail otherwise — and it is a real ten-kcal discrepancy in
    /// the TypeScript, not a transcription slip here.
    static let bulk = PhaseGoals(
        phase: .bulk,
        label: "Lean Bulk",
        calorieGoal: 2600,
        proteinGoalG: 160,
        carbsGoalG: 330,
        fatGoalG: 70,
        fiberGoalG: 35,
        fiberMin: 33,
        fiberMax: 38,
        stepsGoal: 8000,
        targetWeightKg: 70,
        targetBodyFatPct: 15.0,
        targetMuscleMassKg: 37.0,
        rateMinKgWk: 0.20,
        rateMaxKgWk: 0.25,
        bodyFatCeilingPct: 16.0
    )

    /// `NUTRITION_PRESETS[mode]` — the Helix defaults, before any plan overlay.
    static func preset(_ phase: ProgramPhase) -> PhaseGoals {
        switch phase {
        case .cut:  cut
        case .bulk: bulk
        }
    }
}

public extension Programs {

    /// `PLAN_PHASES` — per-plan overrides layered on the Helix defaults.
    ///
    /// ── WHY THE MERGE IS ALREADY APPLIED ─────────────────────────────────────
    /// The TypeScript stores a PARTIAL preset and spreads it over the base at
    /// read time (`{ ...base, ...override }`). Modelling that in Swift means a
    /// second struct with sixteen optional fields whose only job is to say
    /// "unspecified", and then a merge function to collapse it — thirty lines
    /// of machinery for one override of five fields. Starting from a copy of
    /// the base and mutating what differs is the same value by construction,
    /// and it stays honest if a future overlay ever needs to clear a field to
    /// nil (a spread cannot express that either).
    private static let planOverrides: [String: [ProgramPhase: PhaseGoals]] = [
        // PPL Legacy ran a leaner, higher-protein cut — 1935 = 180·4 + 180·4 +
        // 55·9. It inherits everything else, INCLUDING the Helix cut's body
        // targets, because the overlay never mentioned them.
        "ppl": [.cut: {
            var g = PhaseGoals.cut
            g.label = "PPL Cut"
            g.calorieGoal = 1935
            g.proteinGoalG = 180
            g.carbsGoalG = 180
            g.fatGoalG = 55
            return g
        }()],
    ]

    /// `phaseGoalsFor` — the resolved goals for a plan running in a direction.
    ///
    /// Every macro and body-composition consumer reads this rather than
    /// `PhaseGoals.preset`, so PPL's cut shows its own numbers and not Helix's.
    ///
    /// The id is used RAW, exactly as the TypeScript uses it: a legacy alias
    /// like `axis4_builder` misses the override table and lands on the
    /// defaults. Normalising here would be a second, silent place where ids get
    /// rewritten — call `normalizePlanId` first if that is what you want.
    static func goals(planId: String, phase: ProgramPhase) -> PhaseGoals {
        planOverrides[planId]?[phase] ?? PhaseGoals.preset(phase)
    }
}

// MARK: - Weekly set targets

public extension Programs {

    /// `PROGRAM_TARGETS` / `programTargets(phase)` — the weekly set target per
    /// muscle, per phase, before any user override.
    ///
    /// On a CUT each number is the MEV+ target: the minimum that defends the
    /// muscle in a deficit. On a BULK it is the MAV target: the top of the
    /// productive range. They are set counts, held as `Double` because the
    /// counted side is fractional — assistance work is credited half a set
    /// (`MuscleCredit.secondarySetCredit`), so a target of 6 is compared
    /// against numbers like 5.5.
    ///
    /// ── THE UNKNOWN PHASE FALLS BACK TO CUT, AND CANNOT ──────────────────────
    /// The TypeScript ends `PROGRAM_TARGETS[phase] ?? PROGRAM_TARGETS.cut`,
    /// which mattered when `maintenance` was still a phase and would otherwise
    /// have read as undefined. `ProgramPhase` has exactly two cases here, so
    /// the switch is total and there is no fallback branch left to write. The
    /// rule has not gone away — it moved to `ProgramPhase.stored`, which is
    /// where an unrecognised string becomes `.cut` before it ever gets here.
    /// Landing on the cut's landmarks for a maintenance week is the CORRECT
    /// answer rather than a safe one: a maintenance week is a nutrition lever
    /// and the training prescription genuinely has not changed.
    static func weeklySetTargets(_ phase: ProgramPhase) -> [LandmarkMuscle: Double] {
        switch phase {
        case .cut:  cutTargets
        case .bulk: bulkTargets
        }
    }

    /// Helix Cut — MEV+.
    ///
    /// Adductors are 0, and 0 is a real target rather than a missing one: Hip
    /// Adduction carries `cutSets: 0` in the deck, so the lift is dropped
    /// entirely while cutting and the muscle is prescribed nothing. A muscle
    /// with no entry at all would mean "untracked", which is a different fact.
    ///
    /// The three back numbers sum to the single `Back` target they replaced,
    /// split the way the program actually trains it: pulldowns and rows are
    /// lat-dominant, and the erector work is incidental to RDLs and hip thrusts
    /// rather than directly prescribed.
    static let cutTargets: [LandmarkMuscle: Double] = [
        .chest: 11, .lats: 6, .upperBack: 4, .lowerBack: 1,
        .frontDelts: 4, .sideDelts: 7, .rearDelts: 2,
        .biceps: 8, .triceps: 6, .forearms: 4,
        .quads: 10, .hamstrings: 8, .glutes: 6, .adductors: 0, .calves: 6, .absCore: 10,
    ]

    /// Helix Bulk — MAV.
    static let bulkTargets: [LandmarkMuscle: Double] = [
        .chest: 13, .lats: 8, .upperBack: 5, .lowerBack: 1,
        .frontDelts: 6, .sideDelts: 9, .rearDelts: 3,
        .biceps: 9, .triceps: 7, .forearms: 7,
        .quads: 12, .hamstrings: 9, .glutes: 7, .adductors: 2, .calves: 8, .absCore: 11,
    ]
}
