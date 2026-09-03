import Foundation
import GRDB
import HelixCore

/// The three numbers this store cannot work out for itself.
///
/// ── WHY THEY ARE PARAMETERS AND NOT PROTOCOLS ───────────────────────────────
/// Each is produced by a domain module that has not been ported yet, and each is
/// arithmetic that has already split into two implementations once in this app's
/// history. Rather than five protocol seams that will all be shaped wrong by the
/// time the real functions arrive, they are three named holes with honest
/// defaults, and the compiler shows every call site that has not filled them.
///
///   · `sessionVolumeKg` — `sessions/volume.ts` (Track D item 5). A unilateral
///     pair is scored ONCE, at the WEAKER side; the local set rows carry
///     `pair_id` and `side` precisely so that rule can be applied, and applying
///     a naive Σ(weight × reps) here would produce a number that looks right and
///     double-counts every L/R movement.
///   · `newPRsToday` — `prEngine.ts` (item 2). The local `workout_sets` has no
///     `is_pr` column at all: the logger flags a set that beats the programme's
///     own seed and writes nothing. Zero is the honest reading of "nothing is
///     known", and it is what the web wrote for every Notion-era session too.
///   · `goals` — `levers.ts` + `dailyTargets.ts` + `context.ts` (item 3). The
///     stored `user_goals` figures are the BASELINE, and a lever moves them:
///     scoring against the baseline while the app displays Lever 1's 1,885 kcal
///     is a 70-kcal difference between the goal shown and the goal graded, every
///     day, invisibly. Left `nil`, the stored values are used and the day is
///     graded against the baseline — which is exactly the pre-lever behaviour,
///     wrong in a known direction rather than in an unknown one.
public struct ScoringSupplements: Sendable, Equatable {
    public var sessionVolumeKg: Double
    public var newPRsToday: Double
    public var goals: ResolvedGoals?
    /// Inside a planned maintenance / deload week (`maintenance.ts`). Lowers the
    /// workout-drain ceiling and the relative floor, and nothing else.
    public var isMaintenance: Bool
    /// The programme's prescription for the day (`prescribedFor`). `nil` drops
    /// the coverage component rather than inventing a plan.
    public var plannedExercises: Double?
    public var plannedSets: Double?

    public init(
        sessionVolumeKg: Double = 0,
        newPRsToday: Double = 0,
        goals: ResolvedGoals? = nil,
        isMaintenance: Bool = false,
        plannedExercises: Double? = nil,
        plannedSets: Double? = nil
    ) {
        self.sessionVolumeKg = sessionVolumeKg
        self.newPRsToday = newPRsToday
        self.goals = goals
        self.isMaintenance = isMaintenance
        self.plannedExercises = plannedExercises
        self.plannedSets = plannedSets
    }
}

/// The day's targets after the lever and any day override have been applied.
public struct ResolvedGoals: Sendable, Equatable {
    public var calorie: Double
    public var protein: Double
    public var carbs: Double
    public var fat: Double
    public var steps: Double

    public init(calorie: Double, protein: Double, carbs: Double, fat: Double, steps: Double) {
        self.calorie = calorie
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.steps = steps
    }
}

// MARK: - Gathering

public extension AppDatabase {

    /// One day's `ScoringInputs`, read out of the local store.
    ///
    /// This is the data half of `computeForDate` — six queries that used to be
    /// six Supabase round trips from a Netlify function in UTC, and are now six
    /// reads off a file on the phone.
    ///
    /// `nil` is the GHOST GUARD: a past day with no underlying data at all must
    /// never get a score row. Trailing baselines and rest-day logic can
    /// otherwise fabricate one out of nothing, and a score-only "ghost day"
    /// pollutes every chart that reads the journey. Today accumulates live and
    /// is exempt.
    func scoringInputs(
        userId: String,
        date: String,
        hoursAwake: Double,
        isRestDay: Bool,
        todayISO: String,
        isToday: Bool = false,
        supplements: ScoringSupplements = ScoringSupplements()
    ) throws -> ScoringInputs? {
        try writer.read { db in
            let metrics = try DailyMetricRow
                .filter(Column("user_id") == userId && Column("date") == date)
                .fetchOne(db)

            // ── THE NIGHT WINDOW, NOT THE CALENDAR DAY ──────────────────────
            // `start_time` is BEDTIME — the previous evening. Querying
            // `start_time >= date 00:00` matched NOTHING, so the scorer read
            // `sleepHours = 0` on every single day. That one bug produced
            // "Awaiting Sleep Data" beside a synced night, a 55 % wake battery,
            // and a July-15 score of 81 with the short-sleep gate never firing.
            // Longest session wins.
            let sleep = try NightWindow.range(date).flatMap { window in
                try SleepSessionRow
                    .filter(
                        Column("user_id") == userId
                            && Column("start_time") >= window.from
                            && Column("start_time") < window.to
                    )
                    .order(Column("duration_min").desc)
                    .fetchOne(db)
            }

            let nutrition = try NutritionEntryRow
                .filter(
                    Column("user_id") == userId && Column("date") == date
                        && Column("meal_type") == "daily"
                )
                .fetchOne(db)

            let water = try WaterIntakeRow
                .filter(Column("user_id") == userId && Column("date") == date)
                .fetchAll(db)

            // ── SUPPLEMENTS ARE READ FOR PRESENCE, NOT FOR TICKS ────────────
            // The web counted `taken = true` rows, which made the score a
            // measure of how often the app was open after 22:00 rather than of
            // what was swallowed. Here the rows only answer "did anything happen
            // on this day", for the ghost guard.
            let supplementCount = try SupplementLogRow
                .filter(Column("user_id") == userId && Column("date") == date)
                .fetchCount(db)

            let goals = try UserGoalRow.filter(Column("user_id") == userId).fetchOne(db)
            let sessions = try WorkoutSession
                .filter(Column("user_id") == userId && Column("date") == date)
                .fetchAll(db)

            // The trailing HRV / resting-HR baselines: seven days before this
            // one. `nil` values are dropped rather than read as zero — a missing
            // reading degrades to "no baseline", never to a wrong one.
            let trailingLogs = try DailyLogRow
                .filter(Column("user_id") == userId && Column("date") <= date)
                .order(Column("date").desc)
                .limit(8)
                .fetchAll(db)
            let todayLog = trailingLogs.first { $0.date == date }
            let trail = trailingLogs.filter { $0.date != date }
            let hrvBaseline = Self.mean(trail.compactMap(\.hrvMs))
            let rhrBaseline = Self.mean(trail.compactMap { $0.avgRestHeartRate.map(Double.init) })

            let hasAnything = metrics != nil || sleep != nil || nutrition != nil
                || !water.isEmpty || supplementCount > 0 || !sessions.isEmpty || todayLog != nil
            if !isToday && date != todayISO && !hasAnything { return nil }

            // ── THE DAY'S SETS ──────────────────────────────────────────────
            // Scoped by the parent SESSION rather than by a set's own timestamp:
            // a back-dated session is written today, so filtering on the set
            // would miss it entirely.
            let counted = try Self.countSets(db, sessionIds: sessions.map(\.id))

            // The day's principal session carries its character — the day key
            // feeds the workout score and the RPE feeds the battery, and on a
            // double-session day the second, lighter session's effort rating
            // should not describe the day.
            //
            // ── AND IT IS RANKED BY DURATION, NOT TONNAGE ───────────────────
            // The web ranked by `total_volume_kg`. The local session row has no
            // such column and cannot have one until `volume.ts` ports (Track D
            // item 5), so the longest session stands in. On a single-session day
            // — which is every day the programme prescribes — the two agree
            // exactly, because there is one candidate. They can differ only on a
            // double day, and duration is at least a fact this store actually
            // holds rather than a tonnage guessed from it.
            let hardest = sessions.max { ($0.durationMin ?? 0) < ($1.durationMin ?? 0) }
            let dayKey = sessions.first(where: { $0.dayKey != nil })?.dayKey

            let g = goals
            let resolved = supplements.goals ?? ResolvedGoals(
                calorie: Double(g?.calorieGoal ?? 0),
                // `0` is the preset's own convention for "no macro target":
                // score.ts counts a macro only when its goal is > 0.
                protein: Double(g?.proteinGoalG ?? 0),
                carbs: Double(g?.carbsGoalG ?? 0),
                fat: Double(g?.fatGoalG ?? 0),
                steps: Double(g?.stepsGoal ?? 0)
            )

            var inputs = ScoringInputs()
            inputs.sleepHours = sleep.map { Double($0.durationMin) / 60 } ?? 0
            inputs.deepMinutes = Double(sleep?.deepMin ?? 0)
            inputs.remMinutes = Double(sleep?.remMin ?? 0)
            inputs.sleepGoalHours = g?.sleepGoalHours ?? 8

            inputs.calories = nutrition?.calories ?? 0
            inputs.proteinG = nutrition?.proteinG ?? 0
            inputs.carbsG = nutrition?.carbsG ?? 0
            inputs.fatG = nutrition?.fatG ?? 0
            inputs.calorieGoal = resolved.calorie
            inputs.proteinGoalG = resolved.protein
            inputs.carbsGoalG = resolved.carbs
            inputs.fatGoalG = resolved.fat
            // A declared exception grades the day on protein alone. Read from
            // the DAY's own row, so back-filling the flag onto a past date and
            // recomputing gives that date the score it would have had if it had
            // been flagged at the time.
            inputs.nutritionException = ExceptionDay.isException(todayLog?.nutritionException)

            inputs.steps = Double(metrics?.steps ?? 0)
            inputs.activeCal = Double(metrics?.activeCal ?? 0)
            inputs.stepsGoal = resolved.steps
            inputs.activeCalGoal = Double(g?.activeCalGoal ?? 0)

            inputs.workoutLogged = !sessions.isEmpty
            inputs.isRestDay = isRestDay
            inputs.newPRsToday = supplements.newPRsToday
            inputs.sessionVolumeKg = supplements.sessionVolumeKg
            // Zero is not a gap here, it is the documented signal: `workoutDrain`
            // reads a zero trailing average as "no history yet, assume typical"
            // and applies the full relative charge. Inventing a baseline out of
            // sessions whose tonnage cannot be computed would be worse than
            // saying nothing, which is what this says.
            inputs.trailingAvgVolumeKg = 0
            inputs.sessionRpe = hardest?.sessionRpe
            inputs.sessionDayKey = hardest?.dayKey ?? dayKey
            inputs.isMaintenance = supplements.isMaintenance
            inputs.plannedExercises = supplements.plannedExercises
            // The prescription MINUS what was deliberately ghosted, floored at
            // zero: a set marked skipped on purpose is neither numerator nor
            // denominator, exactly as a prescribed rest day is neither.
            inputs.plannedSets = supplements.plannedSets.map { max(0, $0 - Double(counted.ghostSets)) }
            inputs.loggedExercises = Double(counted.exercises)
            inputs.sessionSets = Double(counted.workingSets)
            inputs.failureSets = Double(counted.failureSets)

            inputs.waterMl = water.reduce(0) { $0 + $1.amountMl }
            inputs.waterGoalMl = Double(g?.waterGoalMl ?? 0)

            inputs.restingHR = metrics?.restHr.map(Double.init)
                ?? todayLog?.avgRestHeartRate.map(Double.init)
            inputs.baselineHR = rhrBaseline
            inputs.hrvMs = todayLog?.hrvMs
            inputs.hrvBaseline = hrvBaseline

            inputs.isCurrentDay = isToday || date == todayISO
            inputs.hoursAwake = hoursAwake
            // Derived from `hoursAwake` on a 07:00 wake convention rather than
            // from a fixed zone, because the device's own hour is the only one
            // that means anything to the person living the day.
            inputs.localHour = min(23, 7 + hoursAwake.rounded())
            return inputs
        }
    }
}

// MARK: - Set arithmetic

private extension AppDatabase {

    struct SetCounts {
        var exercises = 0
        var workingSets = 0
        var ghostSets = 0
        var failureSets = 0
    }

    static func countSets(_ db: Database, sessionIds: [String]) throws -> SetCounts {
        var counts = SetCounts()
        guard !sessionIds.isEmpty else { return counts }
        let rows = try WorkoutSet.filter(sessionIds.contains(Column("session_id"))).fetchAll(db)

        var exercises = Set<String>()
        var working = Set<String>()
        var ghosts = Set<String>()
        for row in rows {
            // ── GHOSTS LEAVE BOTH SIDES OF THE RATIO ────────────────────────
            // A ghost is a set the plan asked for that was deliberately not
            // done. Excluding it from the numerator while the prescription still
            // supplied the denominator graded a deliberate decision as an
            // incomplete session, and docked up to twelve points for it.
            guard Self.isWorkingSet(row.setType) else {
                if row.setType == "ghost" { ghosts.insert(row.pairId ?? row.id) }
                continue
            }
            exercises.insert(row.exerciseId)
            // Unilateral L/R sub-sets share a `pair_id` and are ONE set.
            working.insert(row.pairId ?? row.id)
            if row.setType == "failure" { counts.failureSets += 1 }
        }
        counts.exercises = exercises.count
        counts.workingSets = working.count
        counts.ghostSets = ghosts.count
        return counts
    }

    /// `isWorkingSet`, from `lib/training/setTags.ts`.
    ///
    /// One line, and it stays one line: "not a working set" was written as
    /// `setType !== 'warmup'` in roughly twenty places, so adding `ghost` meant
    /// finding all twenty and getting all twenty right. The ones that were
    /// missed failed silently and in the worst direction — a ghost became a
    /// baseline, and the coach paced against a set explicitly marked as not
    /// counting.
    static func isWorkingSet(_ setType: String?) -> Bool {
        setType != "warmup" && setType != "ghost"
    }

    static func mean(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }
}
