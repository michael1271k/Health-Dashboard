import Foundation
import GRDB
import OnyxCore

/// Builds the widget payload from the local store — the port of the deleted
/// `GET /api/widget/snapshot` route onto the App Group GRDB file.
///
/// ── WHAT CHANGED AND WHAT DID NOT ────────────────────────────────────────────
/// The route's bearer token, timezone query and edge cache are gone: the
/// extension opens the file `AppDatabase.readOnly(folderURL:)` and asks the
/// store whose data it is (`knownUserId`). Every derivation is the same code
/// the route called — `WidgetDerive`, `Schedule`, `Levers`, `Score`, `Battery`
/// — so a tile and the app can never disagree about a number.
///
/// Every field stays optional where the route returned null. Nil renders as
/// "—"; an invented zero renders as a lie.
public struct WidgetSnapshotBuilder: Sendable {
    public let database: AppDatabase
    public let userId: String
    public let timeZone: TimeZone

    public init(database: AppDatabase, userId: String, timeZone: TimeZone = .current) {
        self.database = database
        self.userId = userId
        self.timeZone = timeZone
    }

    // The route's windows, unchanged.
    static let volumeWeeks = 8
    static let calendarDays = Streak.windowDays
    static let trendDays = 7
    static let vitalsBaselineDays = 14
    static let performanceHistoryDays = 35
    static let ledgerLimit = 40

    /// One session with the figures the route read off `workout_sessions`
    /// columns; the local table has none, so they come from the sets.
    struct SessionTotals {
        let session: WorkoutSession
        let volumeKg: Double
        let sets: Int
        let prs: Int
        var date: String { session.date }
    }

    struct Rows {
        var goals: UserGoalRow?
        var overrides: [String: String]
        var layout: DayLayout
        var dayTarget: DailyTargetRow?
        var storedScore: DailyScoreRow?
        var logs: [DailyLogRow]
        var metrics: [DailyMetricRow]
        var sleep: [SleepSessionRow]
        var nutrition: [NutritionEntryRow]
        var water: [WaterIntakeRow]
        var weights: [BodyCompositionRow]
        var sessions: [SessionTotals]
        var sets: [WorkoutSet]
        var exerciseNames: [String: String]
        var ledger: [PersonalRecordRow]
        var cardio: [CardioLogRow]
    }

    public func build(scope: OnyxScope, now: Date = Date()) throws -> OnyxSnapshot {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let date = LogicalDay.iso(now, calendar: calendar)

        let wantsLifestyle = scope == .lifestyle || scope == .full
        let wantsPerformance = scope == .performance || scope == .full
        let wantsTraining = scope == .training || scope == .full
        let wantsBody = scope == .body || scope == .full

        let trendFrom = ISODate.addDays(date, -(Self.trendDays - 1)) ?? date
        let rows = try fetch(date: date, trendFrom: trendFrom)
        let goals = rows.goals

        let weekStartDay = Week.startDay(fromEndDay: goals?.weekEndDay)
        let week = WeekWindow(containing: date, startDay: weekStartDay, today: date)
        let weekStart = week.start
        let prevWeekStart = ISODate.addDays(weekStart, -7) ?? weekStart

        // ── The plan the user is ACTUALLY running ─────────────────────────
        // Stored layout and overrides, never a default plan (see the
        // "Server-side plan resolution" rule): a widget that guesses from the
        // weekday announces the wrong session after every swap.
        let programId = Programs.normalizePlanId(goals?.activePlan ?? goals?.activeProgram) ?? Programs.defaultPlanId
        let schedule = ScheduleContext(
            programId: programId,
            phase: ProgramPhase.stored(goals?.activePhase ?? goals?.goalPreset),
            overrides: rows.overrides,
            layout: rows.layout
        )
        let program = Schedule.programForContext(schedule, date).program
        func prescribed(_ dayKey: String?) -> (exercises: Int, sets: Int)? {
            guard let dayKey, let day = program.day(key: dayKey) else { return nil }
            return (day.exercises(for: schedule.phase).count, max(1, day.plannedSets(for: schedule.phase)))
        }

        // ── The targets this day is graded against ────────────────────────
        let resolved = TargetSnapshot(goals: goals, dailyTargets: rows.dayTarget.map { [$0.date: $0] } ?? [:], overrides: rows.overrides)
            .targets(for: date, today: date)
        let resolvedGoals = resolved.goals

        // ── Today, picked out of the week ─────────────────────────────────
        let log = rows.logs.first { $0.date == date }
        let metrics = rows.metrics.first { $0.date == date }
        let water = rows.water.filter { $0.date == date }
        let nutri = rows.nutrition.first { $0.date == date }
        // Ordered by duration descending, so the first row inside tonight's
        // window is the longest — the one the detail face wants.
        let sleep = rows.sleep.first { Night.nightOf(Self.iso($0.startTime)) == date }

        let allSessions = rows.sessions
        let weekSessions = allSessions.filter { $0.date >= weekStart }
        let prevSessions = allSessions.filter { $0.date >= prevWeekStart && $0.date < weekStart }
        let todaySessions = allSessions.filter { $0.date == date }

        // Weigh-ins de-duplicated by VALUE, so a re-synced identical reading
        // is not a fresh weigh-in.
        let weighIns = rows.weights.compactMap { r in Format.validWeight(r.weightKg).map { (date: r.date, kg: $0) } }
        let latest = weighIns.first
        let previous = weighIns.first { r in latest.map { abs(r.kg - $0.kg) >= 0.05 } ?? false }
        let weightSeries = WidgetDerive.trendPoints(weighIns.map { DatedValue(date: $0.date, value: $0.kg) }, limit: 14)

        let day = Schedule.scheduleDayIn(schedule, date)
        let isTraining = Schedule.isTrainingDayIn(schedule, date)
        let planned = prescribed(day?.dayKey)

        // The last time THIS split was trained. Today's own session excluded:
        // comparing a session to itself is not a target.
        let lastVolumeKg: Double? = day?.dayKey.flatMap { key in
            allSessions.filter { $0.session.dayKey == key && $0.date < date }
                .max { $0.date < $1.date }
                .map { $0.volumeKg.rounded() }
        }

        // ── Keep the score honest before answering ────────────────────────
        // `battery_pct` decays with hours awake, so the mirrored row is wrong
        // within an hour of being written. Recomputed here, today only, off
        // the same inputs the app scores with; the stored row is the fallback.
        let hoursAwake = Battery.hoursAwake(at: now, calendar: calendar)
        let live = try liveScore(
            date: date, hoursAwake: hoursAwake, isRestDay: !isTraining,
            todaySessions: todaySessions, allSessions: allSessions,
            goals: goals, resolvedGoals: resolvedGoals, prescribed: prescribed
        )
        let stored = rows.storedScore
        let battery = live?.battery ?? stored?.batteryPct
        let score = live?.total ?? stored?.score
        let scores = OnyxSnapshot.Scores(
            sleep: live?.components.sleepScore ?? stored?.sleepScore.map(Double.init),
            nutrition: live?.components.nutritionScore ?? stored?.nutritionScore.map(Double.init),
            activity: live?.components.activityScore ?? stored?.activityScore.map(Double.init),
            workout: live?.components.workoutScore ?? stored?.workoutScore.map(Double.init),
            recovery: live?.components.recoveryScore ?? stored?.recoveryScore.map(Double.init)
        )

        // ── The calendar ──────────────────────────────────────────────────
        // Union of the streak's trailing window and the current month, so a
        // month grid has its back half and the streak keeps its 42 days.
        let trailingStart = ISODate.addDays(date, -(Self.calendarDays - 1)) ?? date
        let windowStart = min(ISODate.monthStart(date), trailingStart)
        let windowEnd = max(ISODate.lastDayOfMonth(date), date)
        var calendarWindow: [String] = []
        var d = windowStart
        while d <= windowEnd { calendarWindow.append(d); d = ISODate.addDays(d, 1) ?? windowEnd + "z" }
        let calendarSessions = allSessions.map { CalendarSession(date: $0.date, volumeKg: $0.volumeKg) }
        let calendarGrid = WidgetDerive.calendarDays(calendarWindow, sessions: calendarSessions) { iso in
            let sd = Schedule.scheduleDayIn(schedule, iso)
            return ScheduledDay(dayKey: sd?.dayKey, scheduled: Schedule.isTrainingDayIn(schedule, iso), label: sd?.label)
        }

        // Two sessions in a day sum for tonnage and counts; RPE and duration
        // take the longer one, because averaging two efforts describes neither.
        let longest = todaySessions.max { ($0.session.durationMin ?? 0) < ($1.session.durationMin ?? 0) }

        let context: OnyxSnapshot.DayContext? = {
            let mode = Context.fromDayLabel(log?.nutritionException)
            guard mode != .normal, let meta = Context.meta[mode] else { return nil }
            return OnyxSnapshot.DayContext(mode: mode.rawValue, label: meta.label)
        }()

        let streak = Streak.programDayCount(date)

        // ── The scoped slices ─────────────────────────────────────────────
        let stepsTrend: [OnyxSnapshot.Point]? = wantsLifestyle ? Self.points(stepsTrend(rows, date: date)) : nil
        let vitals: OnyxSnapshot.Vitals? = wantsLifestyle ? vitalsSlice(rows.logs, date: date) : nil
        let performance = wantsPerformance ? performanceSlice(rows, date: date, weekStart: weekStart) : nil
        let volumeTrend: [OnyxSnapshot.Point]? = wantsTraining || wantsPerformance
            ? Self.points(WidgetDerive.weeklyVolume(calendarSessions, weekStartOfDate: { Week.start(of: $0, startDay: weekStartDay) }, limit: Self.volumeWeeks))
            : nil
        let cardio: OnyxSnapshot.Cardio? = wantsTraining ? cardioSlice(rows.cardio, date: date, weekStart: weekStart) : nil
        let body: OnyxSnapshot.Body? = wantsBody ? bodySlice(rows.weights) : nil
        let readiness: OnyxSnapshot.Readiness? = {
            guard wantsBody, let battery else { return nil }
            let r = Readiness.compute(sleepScore: scores.sleep, recoveryScore: scores.recovery, batteryPct: Double(battery))
            return OnyxSnapshot.Readiness(level: r.level.rawValue, label: r.label, color: r.color, reason: r.reason)
        }()

        return OnyxSnapshot(
            date: date,
            generatedAt: Self.iso(now),
            scope: scope.rawValue,
            battery: battery,
            score: score,
            sleep: OnyxSnapshot.Sleep(
                minutes: sleep?.durationMin ?? log?.sleepMinutes,
                deepMin: sleep?.deepMin, remMin: sleep?.remMin, coreMin: sleep?.coreMin, awakeMin: sleep?.awakeMin,
                score: sleep?.sleepScore,
                startTime: sleep.map { Self.iso($0.startTime) },
                endTime: sleep.map { Self.iso($0.endTime) },
                goalMin: goals?.sleepGoalHours.map { Int(($0 * 60).rounded()) },
                // Seven nights bucketed by `nightOf`, never by the start date.
                trend: wantsBody ? Self.points(WidgetDerive.dailySeries(
                    rows.sleep.map { DatedValue(date: Night.nightOf(Self.iso($0.startTime)), value: Double($0.durationMin)) },
                    limit: Self.trendDays, combine: .max
                )) : nil
            ),
            weight: OnyxSnapshot.Weight(
                kg: latest?.kg,
                deltaKg: zip2(latest, previous).map { (($0.kg - $1.kg) * 100).rounded() / 100 },
                measuredOn: latest?.date,
                targetKg: goals?.targetWeightKg,
                prevWeekMeanKg: WidgetDerive.meanBetween(weightSeries, from: prevWeekStart, to: weekStart),
                trend: wantsLifestyle || wantsBody ? Self.points(weightSeries) : nil
            ),
            macros: OnyxSnapshot.Macros(
                kcal: nutri?.calories,
                kcalGoal: resolvedGoals.calorie == 0 ? nil : resolvedGoals.calorie,
                proteinG: nutri?.proteinG, proteinGoalG: resolvedGoals.protein,
                carbsG: nutri?.carbsG, carbsGoalG: resolvedGoals.carbs,
                fatG: nutri?.fatG, fatGoalG: resolvedGoals.fat,
                kcalTrend: wantsLifestyle ? Self.points(WidgetDerive.dailySeries(
                    rows.nutrition.map { DatedValue(date: $0.date, value: $0.calories) }, limit: Self.trendDays
                )) : nil
            ),
            water: OnyxSnapshot.Water(
                ml: water.isEmpty ? log?.waterMl : water.reduce(0) { $0 + $1.amountMl },
                goalMl: goals?.waterGoalMl.map(Double.init),
                trend: wantsLifestyle ? Self.points(WidgetDerive.dailySeries(
                    rows.water.map { DatedValue(date: $0.date, value: $0.amountMl) }, limit: Self.trendDays
                )) : nil
            ),
            steps: OnyxSnapshot.Steps(
                count: metrics?.steps ?? log?.steps,
                goal: resolvedGoals.steps.map { Int($0) },
                distanceM: log?.distanceM,
                activeKcal: metrics?.activeCal.map(Double.init) ?? log?.activeEnergy,
                trend: stepsTrend
            ),
            workout: OnyxSnapshot.Workout(
                label: day?.label ?? "Rest",
                dayKey: day?.dayKey,
                logged: weekSessions.contains { $0.date == date },
                isRestDay: !isTraining,
                // Null, never 0: on a training day a zero reads as "nothing
                // to do", the one thing it cannot mean.
                plannedExercises: planned?.exercises,
                plannedSets: planned?.sets,
                lastVolumeKg: lastVolumeKg
            ),
            week: {
                let t = Self.totals(weekSessions)
                return OnyxSnapshot.Week(sessions: t.sessions, volumeKg: t.volumeKg, prs: t.prs, sets: t.sets,
                                          sessionTarget: Schedule.sessionTargetIn(schedule))
            }(),
            weekPrev: Self.totals(prevSessions),
            records: performance?.records,
            e1rm: performance?.e1rm,
            volumeByFamily: performance?.volumeByFamily,
            today: todaySessions.isEmpty ? nil : OnyxSnapshot.Today(
                durationMin: longest?.session.durationMin.map { Int($0.rounded()) },
                sessionRpe: longest?.session.sessionRpe,
                volumeKg: todaySessions.reduce(0) { $0 + $1.volumeKg },
                setCount: todaySessions.reduce(0) { $0 + $1.sets },
                prCount: todaySessions.reduce(0) { $0 + $1.prs }
            ),
            streak: OnyxSnapshot.Streak(current: streak, best: streak),
            context: context,
            cardio: cardio,
            calendar: wantsTraining ? calendarGrid.map {
                OnyxSnapshot.CalendarDay(d: $0.d, dayKey: $0.dayKey, label: $0.label, scheduled: $0.scheduled, logged: $0.logged, volumeKg: $0.volumeKg)
            } : nil,
            volumeTrend: volumeTrend,
            body: body,
            scores: wantsBody ? scores : nil,
            readiness: readiness,
            vitals: vitals
        )
    }

    // MARK: - Reads

    /// Every table the payload draws on, in one read. Eight weeks of this
    /// athlete's sessions is ~40 rows; the wide read is cheaper than the
    /// round trips and every derived figure is guaranteed to agree.
    func fetch(date: String, trendFrom: String) throws -> Rows {
        let user = Column("user_id") == userId
        return try database.writer.read { db in
            let goals = try UserGoalRow.filter(user).fetchOne(db)
            let weekStartDay = Week.startDay(fromEndDay: goals?.weekEndDay)
            let weekStart = Week.start(of: date, startDay: weekStartDay)
            let weekEndExclusive = ISODate.addDays(weekStart, 7) ?? date
            let historyStart = ISODate.addDays(weekStart, -7 * (Self.volumeWeeks - 1)) ?? weekStart
            let calendarStart = ISODate.addDays(date, -(Self.calendarDays - 1)) ?? date
            let sessionsFrom = min(historyStart, calendarStart)
            let programId = Programs.normalizePlanId(goals?.activePlan ?? goals?.activeProgram) ?? Programs.defaultPlanId

            var overrides: [String: String] = [:]
            for r in try ScheduleOverrideRow.filter(user).fetchAll(db) { overrides[r.date] = r.dayKey }
            let layoutRaw = try ProgramDayLayoutRow.filter(user && Column("program_id") == programId).fetchOne(db)?.layout.raw
            let layout = ScheduleLayout.parseLayout(layoutRaw.flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) })

            let sessions = try WorkoutSession
                .filter(user && Column("date") >= sessionsFrom && Column("date") < weekEndExclusive)
                .fetchAll(db)
            let ids = sessions.map(\.id)
            let sets = ids.isEmpty ? [] : try WorkoutSet.filter(ids.contains(Column("session_id"))).fetchAll(db)
            let ledger = try PersonalRecordRow.filter(user).fetchAll(db)
            var prsBySession: [String: Int] = [:]
            for r in ledger { if let s = r.sessionId { prsBySession[s, default: 0] += 1 } }
            var setsBySession: [String: [WorkoutSet]] = [:]
            for s in sets { setsBySession[s.sessionId, default: []].append(s) }
            let totals = sessions.map { s in
                let own = setsBySession[s.id] ?? []
                return SessionTotals(session: s, volumeKg: Self.volume(own), sets: Self.committedSets(own), prs: prsBySession[s.id] ?? 0)
            }

            let vitalsFrom = ISODate.addDays(date, -(Self.vitalsBaselineDays - 1)) ?? date
            let sleepFrom = NightWindow.range(trendFrom)?.from
            let sleepTo = NightWindow.range(date)?.to
            let cardioFrom = ISODate.addDays(date, -13) ?? date

            return Rows(
                goals: goals,
                overrides: overrides,
                layout: layout,
                dayTarget: try DailyTargetRow.filter(user && Column("date") == date).fetchOne(db),
                storedScore: try DailyScoreRow.filter(user && Column("date") == date).fetchOne(db),
                logs: try DailyLogRow.filter(user && Column("date") >= vitalsFrom && Column("date") <= date).fetchAll(db),
                metrics: try DailyMetricRow.filter(user && Column("date") >= trendFrom && Column("date") <= date).fetchAll(db),
                sleep: sleepFrom == nil || sleepTo == nil ? [] : try SleepSessionRow
                    .filter(user && Column("start_time") >= sleepFrom! && Column("start_time") < sleepTo!)
                    .order(Column("duration_min").desc)
                    .fetchAll(db),
                nutrition: try NutritionEntryRow
                    .filter(user && Column("date") >= trendFrom && Column("date") <= date && Column("meal_type") == "daily")
                    .fetchAll(db),
                water: try WaterIntakeRow.filter(user && Column("date") >= trendFrom && Column("date") <= date).fetchAll(db),
                weights: try BodyCompositionRow.filter(user).order(Column("date").desc).limit(30).fetchAll(db),
                sessions: totals,
                sets: sets,
                exerciseNames: Dictionary(try Exercise.fetchAll(db).map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a }),
                ledger: ledger,
                cardio: try CardioLogRow
                    .filter(user && Column("date") >= cardioFrom && Column("date") <= date)
                    .order(Column("created_at").asc)
                    .fetchAll(db)
            )
        }
    }

    // MARK: - Score

    struct LiveScore {
        let total: Int
        let battery: Int
        let components: OnyxCore.ScoreComponents
    }

    /// `refreshTodayScore` without the write: the same inputs the app scores
    /// with (`scoringInputs`), the same supplements `computeForDate` resolved.
    /// Nil when the scorer has nothing to say, so the stored row answers.
    func liveScore(
        date: String, hoursAwake: Double, isRestDay: Bool,
        todaySessions: [SessionTotals], allSessions: [SessionTotals],
        goals: UserGoalRow?, resolvedGoals: LeverGoals,
        prescribed: (String?) -> (exercises: Int, sets: Int)?
    ) throws -> LiveScore? {
        let dayKey = todaySessions.first { $0.session.dayKey != nil }?.session.dayKey
        let planned = prescribed(dayKey)
        let supplements = ScoringSupplements(
            goals: ResolvedGoals(
                calorie: resolvedGoals.calorie, protein: resolvedGoals.protein ?? 0, carbs: resolvedGoals.carbs ?? 0,
                fat: resolvedGoals.fat ?? 0, steps: resolvedGoals.steps ?? Double(goals?.stepsGoal ?? 0)
            ),
            isMaintenance: Maintenance.isMaintenanceDate(date, stored: goals?.activeLever, until: goals?.maintenanceUntil, today: date),
            plannedExercises: planned.map { Double($0.exercises) },
            plannedSets: planned.map { Double($0.sets) }
        )
        guard let inputs = try database.scoringInputs(
            userId: userId, date: date, hoursAwake: hoursAwake, isRestDay: isRestDay,
            todayISO: date, isToday: true, supplements: supplements
        ) else { return nil }

        let components = Score.daily(inputs)
        guard let total = components.totalScore else { return nil }
        let battery = Battery.computeBattery(inputs, hoursAwake: hoursAwake)
        return LiveScore(total: Int(total.rounded()), battery: Int(battery.currentPct.rounded()), components: components)
    }

    // MARK: - Slices

    /// Seven days of step counts, the HealthKit mirror winning over the log.
    func stepsTrend(_ rows: Rows, date: String) -> [TrendPoint] {
        let from = ISODate.addDays(date, -6) ?? date
        var byDate: [String: Double?] = [:]
        var order: [String] = []
        for r in rows.logs where r.date >= from {
            if byDate[r.date] == nil { order.append(r.date) }
            byDate[r.date] = r.steps.map(Double.init)
        }
        for r in rows.metrics where r.steps != nil {
            if byDate[r.date] == nil { order.append(r.date) }
            byDate[r.date] = r.steps.map(Double.init)
        }
        return WidgetDerive.trendPoints(order.map { DatedValue(date: $0, value: byDate[$0] ?? nil) }, limit: 7)
    }

    /// Records, 1RM movement and the week's muscle-family split.
    func performanceSlice(_ rows: Rows, date: String, weekStart: String) -> (records: [OnyxSnapshot.Record], e1rm: [OnyxSnapshot.E1rm], volumeByFamily: [OnyxSnapshot.FamilyVolume]) {
        let since = ISODate.addDays(date, -Self.performanceHistoryDays) ?? date
        let weekEnd = ISODate.addDays(weekStart, 7) ?? date
        let dayOf = Dictionary(rows.sessions.map { ($0.session.id, $0.date) }, uniquingKeysWith: { a, _ in a })
        // A set whose exercise or session cannot be named is a set nothing
        // can say anything true about — dropped rather than attributed to "".
        let sets: [WidgetSetRow] = rows.sets.compactMap { s in
            guard let day = dayOf[s.sessionId], day >= since, let name = rows.exerciseNames[s.exerciseId], !name.isEmpty
            else { return nil }
            return WidgetSetRow(exercise: name, day: day, weightKg: s.weightKg, reps: Double(s.reps), est1rmKg: s.est1rmKg, setType: s.setType)
        }
        let weekSets = sets.filter { $0.day >= weekStart && $0.day < weekEnd }
        let ledger = rows.ledger
            .sorted { $0.achievedOn > $1.achievedOn }
            .prefix(Self.ledgerLimit)
            .map { LedgerRow(exerciseKey: $0.exerciseKey, axis: $0.axis, value: $0.value, reps: $0.reps.map(Double.init), achievedOn: $0.achievedOn) }
        return (
            WidgetDerive.topRecords(Array(ledger), limit: 6).map {
                OnyxSnapshot.Record(exercise: $0.exercise, axis: $0.axis, value: $0.value, reps: $0.reps.map { Int($0) }, achievedOn: $0.achievedOn)
            },
            WidgetDerive.e1rmTrends(sets, asOf: date, limit: 5).map {
                OnyxSnapshot.E1rm(exercise: $0.exercise, kg: $0.kg, deltaKg: $0.deltaKg, trend: Self.points($0.trend))
            },
            WidgetDerive.volumeByFamily(weekSets).map {
                OnyxSnapshot.FamilyVolume(family: $0.family, kg: $0.kg, sets: $0.sets)
            }
        )
    }

    /// Five overnight readings, each against its own fortnight baseline.
    func vitalsSlice(_ logs: [DailyLogRow], date: String) -> OnyxSnapshot.Vitals {
        func of(_ pick: (DailyLogRow) -> Double?) -> OnyxSnapshot.Vital {
            let b = WidgetDerive.vitalBlock(logs.map { DatedValue(date: $0.date, value: pick($0)) }, todayISO: date, trendLimit: Self.trendDays)
            return OnyxSnapshot.Vital(value: b.value, baseline: b.baseline, trend: Self.points(b.trend))
        }
        return OnyxSnapshot.Vitals(
            hrvMs: of { $0.hrvMs },
            restingBpm: of { $0.avgRestHeartRate.map(Double.init) },
            wristTempDeltaC: of { $0.wristTempDelta },
            bloodOxygenPct: of { $0.bloodOxygen },
            respiratoryRate: of { $0.respiratoryRate }
        )
    }

    func cardioSlice(_ rows: [CardioLogRow], date: String, weekStart: String) -> OnyxSnapshot.Cardio {
        let block = WidgetDerive.cardioBlock(
            rows.map { WidgetCardioRow(date: $0.date, kind: $0.kind, distanceM: $0.distanceM, durationMin: $0.durationMin) },
            today: date, weekStart: weekStart,
            zone2MinMinutes: Zone2.minMinutes, weekTarget: Zone2.weeklyTarget,
            paceOf: { CardioMetrics.paceMinPerKm(distanceM: $0, durationMin: $1) },
            trendDays: Self.trendDays
        )
        return OnyxSnapshot.Cardio(
            last: block.last.map {
                OnyxSnapshot.Cardio.Session(kind: $0.kind, date: $0.date, distanceM: $0.distanceM, durationMin: $0.durationMin, paceMinPerKm: $0.paceMinPerKm)
            },
            weekSessions: block.weekSessions, weekTarget: block.weekTarget,
            weekMinutes: Int(block.weekMinutes), trend: Self.points(block.trend)
        )
    }

    /// Field by field, not row by row: the newest muscle figure often lives on
    /// an older row than the newest weight, and `latestDelta` skips back to
    /// the previous DIFFERING reading because the table carries values forward.
    func bodySlice(_ rows: [BodyCompositionRow]) -> OnyxSnapshot.Body {
        func field(_ pick: (BodyCompositionRow) -> Double?) -> LatestDelta {
            WidgetDerive.latestDelta(WidgetDerive.trendPoints(rows.map { DatedValue(date: $0.date, value: pick($0)) }, limit: 30))
        }
        let fat = field { $0.bodyFatPct }, lean = field { $0.muscleMassKg }
        let skeletal = field { $0.skeletalMuscleMassKg }, ffm = field { $0.fatFreeMassKg }
        return OnyxSnapshot.Body(
            fatPct: fat.value, muscleKg: lean.value, smmKg: skeletal.value, ffmKg: ffm.value,
            fatPctDelta: fat.delta, muscleKgDelta: lean.delta, smmKgDelta: skeletal.delta, ffmKgDelta: ffm.delta,
            fatTrend: Self.points(WidgetDerive.trendPoints(rows.map { DatedValue(date: $0.date, value: $0.bodyFatPct) }, limit: 14))
        )
    }

    // MARK: - Helpers

    /// Counts are zero when nothing happened; tonnage is NIL.
    ///
    /// `reduce(0)` over no sessions is 0, and the faces printed "0.0 t" for it
    /// — on Monday morning, on a fresh install, and for the whole of the
    /// casing bug, which hid every synced session from the query behind it.
    /// That is this file's own rule broken at the top of the file: an invented
    /// zero renders as a lie.
    static func totals(_ rows: [SessionTotals]) -> OnyxSnapshot.WeekTotals {
        OnyxSnapshot.WeekTotals(
            sessions: rows.count,
            volumeKg: rows.isEmpty ? nil : rows.reduce(0) { $0 + $1.volumeKg }.rounded(),
            prs: rows.reduce(0) { $0 + $1.prs },
            sets: rows.reduce(0) { $0 + $1.sets }
        )
    }

    /// `sessionVolumeKg` over the local rows — a unilateral pair is one set.
    static func volume(_ sets: [WorkoutSet]) -> Double { AppDatabase.volume(sets) }

    /// `countCommittedSets`: solo sets plus distinct pairs. A ghost is a pencil
    /// mark, not a set.
    static func committedSets(_ sets: [WorkoutSet]) -> Int {
        var pairs = Set<String>()
        var solo = 0
        for s in sets where s.setType != "ghost" {
            if let p = s.pairId, !p.isEmpty { pairs.insert(p) } else { solo += 1 }
        }
        return solo + pairs.count
    }

    static func points(_ trend: [TrendPoint]) -> [OnyxSnapshot.Point] {
        trend.map { OnyxSnapshot.Point(d: $0.d, v: $0.v) }
    }

    /// `Date.toISOString()` — UTC, milliseconds, `Z`. A formatter per call:
    /// `ISO8601DateFormatter` is not Sendable and this runs a handful of times
    /// per build.
    static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}

private func zip2<A, B>(_ a: A?, _ b: B?) -> (A, B)? {
    guard let a, let b else { return nil }
    return (a, b)
}
