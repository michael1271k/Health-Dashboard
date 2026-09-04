import Foundation
import GRDB
import HelixCore

/// Everything the Today screen draws that is not the arrangement, built in one
/// read from the mirror.
///
/// ── ONE BUILD, FOUR CARDS ────────────────────────────────────────────────────
/// The web dashboard ran nine hooks with nine caches and nine invalidation
/// lists. Here the tiles are the widget snapshot (`WidgetSnapshotBuilder`, the
/// same payload the Home Screen draws — one implementation, two surfaces), and
/// the three cards under the grid derive from windows the snapshot already
/// needed or from a couple of extra table reads. The whole thing is rebuilt
/// after any commit; on a phone-sized mirror it is a few milliseconds.
public struct TodayFeed: Sendable, Equatable {
    public var snapshot: HelixSnapshot
    /// The coach headline — scored readiness made aware of the plan.
    public var readiness: ReadinessResult?
    public var insights: [Insight]
    public var weekSoFar: WeekSoFarSummary
    /// The week-complete CTA fires on the first day of a new week, once every
    /// training day the previous week asked for was logged.
    public var weeklySummaryReady: Bool
    /// Last week's start, for the CTA's destination.
    public var lastWeekStart: String

    public init(snapshot: HelixSnapshot, readiness: ReadinessResult?, insights: [Insight], weekSoFar: WeekSoFarSummary, weeklySummaryReady: Bool, lastWeekStart: String) {
        self.snapshot = snapshot
        self.readiness = readiness
        self.insights = insights
        self.weekSoFar = weekSoFar
        self.weeklySummaryReady = weeklySummaryReady
        self.lastWeekStart = lastWeekStart
    }
}

public struct WeekSoFarSummary: Sendable, Equatable {
    public var weekStart: String
    public var weekNumber: Int
    /// Days elapsed including today, 1…7.
    public var dayOfWeek: Int
    public var current: WeekTotals
    public var previous: WeekTotals
    public var change: WeekChange?
    public var sessionTarget: Int

    public init(weekStart: String, weekNumber: Int, dayOfWeek: Int, current: WeekTotals, previous: WeekTotals, change: WeekChange?, sessionTarget: Int) {
        self.weekStart = weekStart
        self.weekNumber = weekNumber
        self.dayOfWeek = dayOfWeek
        self.current = current
        self.previous = previous
        self.change = change
        self.sessionTarget = sessionTarget
    }
}

public struct TodayFeedBuilder: Sendable {
    public let database: AppDatabase
    public let userId: String
    public let timeZone: TimeZone

    /// The Fuel→Force correlator wants two months.
    static let insightDays = 60

    public init(database: AppDatabase, userId: String, timeZone: TimeZone = .current) {
        self.database = database
        self.userId = userId
        self.timeZone = timeZone
    }

    public func build(now: Date = Date()) throws -> TodayFeed {
        let widgets = WidgetSnapshotBuilder(database: database, userId: userId, timeZone: timeZone)
        let snapshot = try widgets.build(scope: .full, now: now)
        let today = snapshot.date

        // The plan, resolved the way the snapshot resolved it, for "is this a
        // training day" over last week.
        let rows = try widgets.fetch(date: today, trendFrom: today)
        let goals = rows.goals
        let programId = Programs.normalizePlanId(goals?.activePlan ?? goals?.activeProgram) ?? Programs.defaultPlanId
        let schedule = ScheduleContext(
            programId: programId,
            phase: ProgramPhase.stored(goals?.activePhase ?? goals?.goalPreset),
            overrides: rows.overrides,
            layout: rows.layout
        )

        let weekStart = Week.start(of: today, startDay: Week.startDay(fromEndDay: goals?.weekEndDay))
        let lastWeekStart = ISODate.addDays(weekStart, -7) ?? weekStart
        let lastWeekEnd = ISODate.addDays(weekStart, -1) ?? weekStart
        let insightsFrom = ISODate.addDays(today, -Self.insightDays) ?? today

        let user = Column("user_id") == userId
        let (days, sessionPoints, weekCur, weekPrev, lastWeekLogged) = try database.writer.read { db in
            let logs = try DailyLogRow.filter(user && Column("date") >= insightsFrom && Column("date") <= today)
                .order(Column("date")).fetchAll(db)
            let meals = try NutritionEntryRow.filter(user && Column("meal_type") == "daily" && Column("date") >= insightsFrom && Column("date") <= today)
                .fetchAll(db)
            var calories: [String: Double] = [:], carbs: [String: Double] = [:]
            for m in meals { calories[m.date] = m.calories; carbs[m.date] = m.carbsG }
            let calorieGoal = goals?.calorieGoal.map(Double.init)
            let days = logs.map { l in
                DayPoint(
                    date: l.date,
                    sleepMin: l.sleepMinutes.map(Double.init),
                    restHr: (l.avgRestHeartRate ?? l.avgHeartRate).map(Double.init),
                    respiratory: l.respiratoryRate,
                    weightKg: Format.validWeight(l.weightKg),
                    calories: calories[l.date],
                    calorieGoal: calorieGoal,
                    carbsG: carbs[l.date],
                    steps: l.steps.map(Double.init),
                    waterMl: l.waterMl,
                    exception: l.nutritionException
                )
            }

            // Sessions with their volume, the same way the snapshot totals them.
            let sessions = try WorkoutSession.filter(user && Column("date") >= insightsFrom && Column("date") <= today)
                .order(Column("date")).fetchAll(db)
            let ids = sessions.map(\.id)
            let sets = ids.isEmpty ? [] : try WorkoutSet.filter(ids.contains(Column("session_id"))).fetchAll(db)
            var setsBySession: [String: [WorkoutSet]] = [:]
            for s in sets { setsBySession[s.sessionId, default: []].append(s) }
            let volumes = sessions.map { ($0, WidgetSnapshotBuilder.volume(setsBySession[$0.id] ?? [])) }
            let points = volumes
                .filter { !($0.0.notes ?? "").hasPrefix("__seed_") }
                .map { SessionPoint(date: $0.0.date, volumeKg: $0.1) }

            let nights = try SleepSessionRow.filter(user).order(Column("start_time").desc).limit(30).fetchAll(db)
            let scores = try DailyScoreRow.filter(user && Column("date") >= lastWeekStart && Column("date") <= today).fetchAll(db)
            func totals(_ from: String, _ to: String) -> WeekTotals {
                let inRange = { (iso: String) in iso >= from && iso <= to }
                let wk = volumes.filter { inRange($0.0.date) }
                let sl = nights.filter { inRange(LogicalDay.iso($0.startTime, calendar: self.calendar)) }
                    .map { Double($0.durationMin) }.filter { $0 > 0 }
                let sc = scores.filter { inRange($0.date) }.map { Double($0.score) }
                let mean = { (xs: [Double]) -> Double? in xs.isEmpty ? nil : xs.reduce(0, +) / Double(xs.count) }
                return WeekTotals(volumeKg: wk.reduce(0) { $0 + $1.1 }, sessions: wk.count, sleepMin: mean(sl), score: mean(sc))
            }
            let logged = Set(sessions.filter { $0.date >= lastWeekStart && $0.date <= lastWeekEnd }.map(\.date))
            return (days, points, totals(weekStart, today), totals(lastWeekStart, lastWeekEnd), logged)
        }

        let base = snapshot.readiness.flatMap { r in
            ReadinessResult.Level(rawValue: r.level).map { ReadinessResult(level: $0, label: r.label, color: r.color, reason: r.reason) }
        }
        let readiness = ScheduleReadiness.apply(base, ScheduleReadinessContext(
            dayLabel: snapshot.workout.isRestDay ? nil : snapshot.workout.label,
            workoutToday: snapshot.workout.logged,
            contextMode: goals?.contextMode ?? "normal",
            reentry: ScheduleReadiness.isReentryWeek(today)
        ))
        let insights = Insights.compute(days: days, sessions: sessionPoints, contextMode: goals?.contextMode, todayISO: today)

        let weekSoFar = WeekSoFarSummary(
            weekStart: weekStart,
            weekNumber: Int(Week.number(ofWeekStart: weekStart)),
            dayOfWeek: ((ISODate.dayNumber(today) ?? 0) - (ISODate.dayNumber(weekStart) ?? 0)) + 1,
            current: weekCur,
            previous: weekPrev,
            change: WeekSoFar.biggestChange(weekCur, weekPrev),
            sessionTarget: snapshot.week.sessionTarget ?? Schedule.sessionTargetIn(schedule)
        )
        let weeklySummaryReady = today == weekStart
            && WeekReady.isComplete(weekStart: lastWeekStart, today: today)
            && WeekReady.isReady(weekStart: lastWeekStart, logged: lastWeekLogged, today: lastWeekEnd) {
                Schedule.isTrainingDayIn(schedule, $0)
            }

        return TodayFeed(
            snapshot: snapshot, readiness: readiness, insights: insights,
            weekSoFar: weekSoFar, weeklySummaryReady: weeklySummaryReady, lastWeekStart: lastWeekStart
        )
    }

    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        return c
    }
}
