import Foundation
import GRDB
import HelixCore

/// The Nutrition screen's local read model.
///
/// ── THIS IS A CACHE, AND IT IS SHAPED LIKE THE SCREEN, NOT LIKE POSTGRES ────
/// Everything in `Models.swift` is a write path: the logger produces rows and
/// the outbox carries them up. This is the opposite direction and it earns a
/// different shape.
///
/// `useDailyLogs` in the web app issues FOUR parallel Supabase queries and zips
/// them by date into one `DailyLog` object:
///
///   · `nutrition_entries` where `meal_type = 'daily'` — calories and macros
///   · `daily_metrics` — steps, active calories
///   · `daily_logs` — water, and the two declaration flags
///   · `daily_scores` — score and battery (NOT read by this screen; omitted)
///
/// Mirroring those four tables locally would mean re-deriving the join on every
/// render, on a device, for a list that is already the join's result. So the
/// local table IS the zip: one row per date, exactly the fields the screen
/// draws. `NutritionSync` is the only writer and it does the zip once, on
/// arrival.
///
/// The trade is explicit. This table cannot answer a question the screen does
/// not ask, and a second screen wanting `score` adds a column here rather than
/// discovering that this row was the wrong shape all along. That is a cheap
/// edit; a per-render four-way join is not.
///
/// ── AND IT IS DISPOSABLE ────────────────────────────────────────────────────
/// Nothing here is a fact this device produced. Every field arrived from
/// Postgres, which remains the source of truth for all of it, so the whole table
/// can be dropped and refetched without losing anything. That is what separates
/// it from `set_events`, where the local row IS the record and losing it loses
/// the workout.
public struct NutritionDay: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable, Equatable {
    public static let databaseTableName = "nutrition_days"

    /// `yyyy-MM-dd`, and the primary key. One row per logical day.
    public var date: String
    /// Nil means the day was never tracked, which is not the same as zero — a
    /// day with no intake recorded says nothing, and grading it as a perfect
    /// deficit is the bug that distinction exists to prevent.
    public var calories: Double?
    public var proteinG: Double?
    public var carbsG: Double?
    public var fatG: Double?
    /// The phase stored on the row at write time. A CACHE of
    /// `NutritionPhase.resolve`'s own answer — readers pass it back in, writers
    /// never do. See `NutritionPhase.DayInput.stored`.
    public var phase: String?
    public var steps: Double?
    public var activeCal: Double?
    public var waterMl: Double?
    /// `daily_logs.nutrition_exception` — a reason string, or nil for an
    /// ordinary day. Note the inversion against `weighin_skip_reason`, whose
    /// absent value means "As Planned".
    public var exception: String?
    /// `daily_logs.nutrition_estimated`. Orthogonal to `exception`; the two
    /// co-occur constantly and neither implies the other.
    public var estimated: Bool

    public var id: String { date }

    /// The resolved phase, given what the era is currently in.
    ///
    /// Resolution lives in `HelixCore` and is called here rather than stored,
    /// because the answer depends on the ACTIVE phase — which changes without
    /// any of these rows changing.
    public func resolvedPhase(activePhase: NutritionPhase?) -> NutritionPhase? {
        NutritionPhase.resolve(.init(
            calories: calories,
            exception: exception,
            estimated: estimated,
            activePhase: activePhase,
            stored: phase.flatMap(NutritionPhase.init(rawValue:))
        ))
    }

    public enum CodingKeys: String, CodingKey {
        case date
        case calories
        case proteinG = "protein_g"
        case carbsG = "carbs_g"
        case fatG = "fat_g"
        case phase
        case steps
        case activeCal = "active_cal"
        case waterMl = "water_ml"
        case exception = "nutrition_exception"
        case estimated = "nutrition_estimated"
    }

    public init(
        date: String, calories: Double? = nil, proteinG: Double? = nil,
        carbsG: Double? = nil, fatG: Double? = nil, phase: String? = nil,
        steps: Double? = nil, activeCal: Double? = nil, waterMl: Double? = nil,
        exception: String? = nil, estimated: Bool = false
    ) {
        self.date = date
        self.calories = calories
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.phase = phase
        self.steps = steps
        self.activeCal = activeCal
        self.waterMl = waterMl
        self.exception = exception
        self.estimated = estimated
    }
}

/// The stored `user_goals` row, narrowed to what a nutrition surface reads.
///
/// ── THIS IS NOT THE WHOLE GOAL RESOLUTION, AND IT SAYS SO ───────────────────
/// The web app answers "what are today's targets?" through `useNutritionGoals`,
/// which walks a ladder: the day's own `daily_targets` override, then the active
/// LEVER, then a `plan_phase_goals` edit, then `phaseGoalsFor(plan, phase)`, and
/// only then this row. That ladder is four more modules and its own set of
/// golden vectors, and it is a wave of its own.
///
/// What makes the stored row a defensible stand-in *for now* is the auto-heal
/// on `/nutrition`: whenever the row drifts from its preset, the web app writes
/// the preset back over it. So the row is normally the preset, which is the
/// bottom two rungs of that ladder already agreeing.
///
/// Where it will be WRONG is the top two: a per-day override, and a pulled
/// lever. The maintenance rung raised carbohydrate from 206 g to 244 g on
/// 30 Aug; a screen reading only this row grades that day against 206 and paints
/// it over target. Until the ladder is ported, that is the known gap, and it is
/// the reason the history rows here are graded against ONE goal rather than
/// pretending to a per-date resolution they cannot do.
public struct StoredGoals: Codable, FetchableRecord, PersistableRecord, Identifiable, Sendable, Equatable {
    public static let databaseTableName = "user_goals"

    public var userId: String
    public var calorieGoal: Int?
    public var proteinGoalG: Int?
    public var carbsGoalG: Int?
    public var fatGoalG: Int?
    public var waterGoalMl: Int?
    public var stepsGoal: Int?
    /// `cut` | `maintenance` | `bulk`, or nil for an account that never picked
    /// one.
    public var goalPreset: String?

    public var id: String { userId }

    /// The calorie target, with the web app's own fallback.
    ///
    /// `WaterBar` defaults to 3,000 ml and the calorie ring has no default at
    /// all — a missing goal renders the ring ungraded rather than graded against
    /// a guess. `0` is that "ungraded" signal, and every consumer checks
    /// `goal > 0` before colouring anything, exactly as the TSX does.
    public var calorie: Double { Double(calorieGoal ?? 0) }
    public var protein: Double? { proteinGoalG.map(Double.init) }
    public var carbs: Double? { carbsGoalG.map(Double.init) }
    public var fat: Double? { fatGoalG.map(Double.init) }
    /// `userGoals?.water_goal_ml ?? 3000`, verbatim from the page.
    public var waterMl: Double { Double(waterGoalMl ?? 3000) }

    public var preset: NutritionPhase? {
        goalPreset.flatMap(NutritionPhase.init(rawValue:))
    }

    public enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case calorieGoal = "calorie_goal"
        case proteinGoalG = "protein_goal_g"
        case carbsGoalG = "carbs_goal_g"
        case fatGoalG = "fat_goal_g"
        case waterGoalMl = "water_goal_ml"
        case stepsGoal = "steps_goal"
        case goalPreset = "goal_preset"
    }

    public init(
        userId: String, calorieGoal: Int? = nil, proteinGoalG: Int? = nil,
        carbsGoalG: Int? = nil, fatGoalG: Int? = nil, waterGoalMl: Int? = nil,
        stepsGoal: Int? = nil, goalPreset: String? = nil
    ) {
        self.userId = userId
        self.calorieGoal = calorieGoal
        self.proteinGoalG = proteinGoalG
        self.carbsGoalG = carbsGoalG
        self.fatGoalG = fatGoalG
        self.waterGoalMl = waterGoalMl
        self.stepsGoal = stepsGoal
        self.goalPreset = goalPreset
    }
}
