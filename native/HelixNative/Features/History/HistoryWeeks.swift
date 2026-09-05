import Foundation
import GRDB
import HelixCore
import HelixData

/// Every week you have trained, and the days inside one of them (§5.9).
///
/// ── WHY THE WEEK IS THE UNIT ────────────────────────────────────────────────
/// The flat "every session, newest first" list this replaces answered one
/// question — what did I lift on the 1st — and the block is not run in
/// sessions. It is run in weeks: five sessions against a target of five, a
/// tonnage that should be climbing, a weight that should be falling, a phase
/// that turns over on a Sunday. A list of sessions cannot show a MISSED day,
/// because a day nothing happened on has no row; a week of seven cells can, and
/// that absence is most of what a training log is for.
///
/// ── AND WHY IT IS ONE PASS OVER EVERYTHING ──────────────────────────────────
/// Every read here is unfiltered and unranged, then folded by week in memory.
/// That is deliberate at this size — a few thousand sets, one weigh-in a day,
/// one score a day — and it is what lets every capsule agree with every other:
/// one `SessionAnalysis.summaries` walk replays the record book ONCE, in order,
/// so a PR counted in Week 5 is not counted again in Week 6. Paginating this
/// would mean replaying the ledger per page, which is the same walk plus a
/// chance to disagree with itself.
///
/// ponytail: whole-history scan on open, ~1 s detached at 60 sessions. If it
/// ever stops feeling instant, the fix is a ranged read in `HelixData` (Track
/// E's package) rather than a cache here.
enum HistoryWeeks {

    // MARK: - Shapes

    /// One dot of a capsule's seven-dot strip.
    struct DayCell: Identifiable, Sendable, Equatable {
        var id: String { date }
        let date: String
        let initial: String
        /// The split this day was, or was going to be. `nil` is a rest day.
        let dayKey: String?
        let sessionId: String?
        let isFuture: Bool

        var isLogged: Bool { sessionId != nil }
        var isRest: Bool { dayKey == nil }
        /// Planned and not done — the state a session list cannot draw.
        var isMissed: Bool { !isLogged && !isRest && !isFuture }
    }

    struct Capsule: Identifiable, Sendable, Equatable {
        let window: WeekWindow
        var id: String { window.start }
        let cells: [DayCell]
        let sessions: Int
        let tonnageKg: Double
        let sets: Int
        let prCount: Int
        /// Week over week, from the last scale reading of each. Nil until two
        /// weeks have one — never rendered as 0.0, which reads as "no change".
        let weightDeltaKg: Double?
        let era: PhaseEra?
        /// `Cut W7`, when the week sits inside a defined phase.
        let phaseLabel: String?
    }

    /// One row of `WeekDaysView`.
    struct DayRow: Identifiable, Sendable, Equatable {
        var id: String { date }
        let date: String
        let dayKey: String?
        /// `Chest & Back A`, or nil for a rest day.
        let label: String?
        let sessionId: String?
        let tonnageKg: Double
        let sets: Int
        let prCount: Int
        let durationMin: Double?
        let steps: Int?
        let sleepMinutes: Int?
        let isFuture: Bool

        var isLogged: Bool { sessionId != nil }
    }

    /// The 2×4 strip above the day rows. Every field optional: a week with no
    /// weigh-in has no delta, and printing a zero there is a claim.
    struct WeekVitals: Sendable, Equatable {
        var weightDeltaKg: Double?
        var fatDeltaPct: Double?
        var batteryMean: Double?
        var sleepScoreMean: Double?
        var sleepMeanMinutes: Double?
        var stepsMean: Double?
        var tonnageKg: Double = 0
        var sessions: Int = 0
    }

    struct WeekDetail: Sendable, Equatable {
        let window: WeekWindow
        var days: [DayRow] = []
        var vitals = WeekVitals()
        /// The weekly report covering this week, when one has been written.
        var report: ReportRow?
    }

    // MARK: - The list

    /// Every week from the first day anything was recorded to the week you are
    /// standing in, newest first.
    nonisolated static func capsules(
        database: AppDatabase, today: String = LogicalDay.today()
    ) -> [Capsule] {
        let context = scheduleContext(database: database)
        let startDay = WeekWindow.startDay(from: context.goals)

        let sessions = (try? database.sessionHistory()) ?? []
        let ledger = (try? database.historySets()) ?? []
        let summaries = SessionAnalysis.summaries(sessions, ledger: ledger)
        let byDate = Dictionary(summaries.map { ($0.date, $0) }, uniquingKeysWith: { first, _ in first })
        let finishedIds = Set(sessions.filter { $0.endedAt != nil }.map(\.id))

        // The scale, folded to one reading a day, oldest first.
        let readings = BodyVitals.readings(ledger: bodyRows(database), logs: dailyLogs(database))
            .filter { $0.weight != nil }

        // `min()` over the dates, not `.first` of either array. `summaries` is
        // NEWEST first — it is what the reverse-chronological list was built
        // for — so reading its head as "the beginning of history" produced a
        // single capsule for the most recent week and silently dropped every
        // week before it.
        guard let earliest = (summaries.map(\.date) + readings.map(\.date)).min() else {
            return []
        }

        var out: [Capsule] = []
        var window = WeekWindow(containing: earliest, startDay: startDay)
        let last = WeekWindow(containing: today, startDay: startDay)
        var previousWeight: Double?

        while window.start <= last.start {
            let dates = window.days
            let plannable = isPlannable(window)
            let cells = dates.map { date -> DayCell in
                let summary = byDate[date]
                let planned = plannable ? Schedule.scheduleDayIn(context.schedule, date) : nil
                return DayCell(
                    date: date,
                    initial: WeekWindow.initial(date),
                    dayKey: summary?.dayKey ?? planned?.dayKey,
                    sessionId: summary.map(\.id).flatMap { finishedIds.contains($0) ? $0 : nil },
                    isFuture: date > today
                )
            }
            let weekSummaries = dates.compactMap { byDate[$0] }
            // Last reading of the week against the last reading of any earlier
            // week — not first-to-last within the week, which reports nothing
            // at all for the many weeks holding a single weigh-in.
            let weight = dates.compactMap { date in readings.last { $0.date == date }?.weight }.last
            let delta = (weight != nil && previousWeight != nil) ? weight! - previousWeight! : nil
            if let weight { previousWeight = weight }

            let phase = window.phase
            out.append(Capsule(
                window: window,
                cells: cells,
                sessions: weekSummaries.count,
                tonnageKg: weekSummaries.reduce(0) { $0 + $1.tonnageKg },
                sets: weekSummaries.reduce(0) { $0 + $1.sets },
                prCount: weekSummaries.reduce(0) { $0 + $1.prCount },
                weightDeltaKg: delta,
                era: phase?.era,
                phaseLabel: phase?.short
            ))
            guard let next = window.offset(byWeeks: 1) else { break }
            window = next
        }
        return out.reversed()
    }

    // MARK: - One week

    nonisolated static func detail(
        database: AppDatabase, window: WeekWindow, today: String = LogicalDay.today()
    ) -> WeekDetail {
        let context = scheduleContext(database: database)
        let sessions = (try? database.sessionHistory()) ?? []
        let ledger = (try? database.historySets()) ?? []
        let byDate = Dictionary(
            SessionAnalysis.summaries(sessions, ledger: ledger).map { ($0.date, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        let finishedIds = Set(sessions.filter { $0.endedAt != nil }.map(\.id))

        let dates = window.days
        let plannable = isPlannable(window)
        let range = Set(dates)
        let logs = dailyLogs(database).filter { range.contains($0.date) }
        let logsByDate = Dictionary(logs.map { ($0.date, $0) }, uniquingKeysWith: { _, last in last })
        let scores = dailyScores(database).filter { range.contains($0.date) }

        var out = WeekDetail(window: window)
        out.days = dates.map { date in
            let summary = byDate[date]
            let planned = plannable ? Schedule.scheduleDayIn(context.schedule, date) : nil
            let key = summary?.dayKey ?? planned?.dayKey
            return DayRow(
                date: date,
                dayKey: key,
                label: SessionAnalysis.dayLabel(key) ?? planned?.label,
                sessionId: summary.map(\.id).flatMap { finishedIds.contains($0) ? $0 : nil },
                tonnageKg: summary?.tonnageKg ?? 0,
                sets: summary?.sets ?? 0,
                prCount: summary?.prCount ?? 0,
                durationMin: summary?.durationMin,
                steps: logsByDate[date]?.steps,
                sleepMinutes: logsByDate[date]?.sleepMinutes,
                isFuture: date > today
            )
        }

        // ── The 2×4 ─────────────────────────────────────────────────────────
        // The two body deltas are the week's own span — first reading to last —
        // because this screen is about THIS week, unlike the capsule list where
        // week-over-week is the comparison being scanned.
        let readings = BodyVitals.readings(ledger: bodyRows(database), logs: logs)
            .filter { range.contains($0.date) }
        let weights = readings.compactMap(\.weight)
        let fats = readings.compactMap(\.fatPct)
        out.vitals.weightDeltaKg = weights.count >= 2 ? weights.last! - weights.first! : nil
        out.vitals.fatDeltaPct = fats.count >= 2 ? fats.last! - fats.first! : nil
        out.vitals.batteryMean = mean(scores.compactMap { $0.batteryPct.map(Double.init) })
        out.vitals.sleepScoreMean = mean(scores.compactMap { $0.sleepScore.map(Double.init) })
        out.vitals.sleepMeanMinutes = mean(logs.compactMap { $0.sleepMinutes.map(Double.init) })
        out.vitals.stepsMean = mean(logs.compactMap { $0.steps.map(Double.init) })
        out.vitals.tonnageKg = out.days.reduce(0) { $0 + $1.tonnageKg }
        out.vitals.sessions = out.days.filter(\.isLogged).count

        // `period_start` is the week the report was written FOR. Any weekly row
        // whose span covers this window counts, because the web wrote some of
        // them against a Sunday start and some against a Monday one.
        out.report = (try? database.read { db in
            try ReportRow
                .filter(Column("period_start") <= window.end && Column("period_end") >= window.start)
                .order(Column("period_start").desc)
                .fetchOne(db)
        }) ?? nil

        return out
    }

    // MARK: - Reads

    /// The schedule as the plan resolves it, plus the goals row the week start
    /// comes from. Built exactly the way the Workout tab's This-week panel
    /// builds it — same overrides, same layout, same phase — so a day the panel
    /// calls Rest is a day History calls Rest.
    ///
    /// Nothing filters on `user_id`: the local store is ONE user's mirror, and
    /// filtering here silently answers "no sessions" whenever the id in hand is
    /// not the id the rows were written under — which is every preview, every
    /// screenshot, and any read that lands before auth resolves.
    private nonisolated static func scheduleContext(
        database: AppDatabase
    ) -> (schedule: ScheduleContext, goals: UserGoalRow?) {
        let goals: UserGoalRow? = (try? database.read { db in try UserGoalRow.fetchOne(db) }) ?? nil
        let programId = goals?.activePlan ?? Program.helix5.id
        let overrides: [String: String] = (try? database.read { db in
            let rows = try ScheduleOverrideRow.fetchAll(db)
            return Dictionary(rows.map { ($0.date, $0.dayKey) }, uniquingKeysWith: { _, last in last })
        }) ?? [:]
        let layoutRow: ProgramDayLayoutRow? = (try? database.read { db in
            try ProgramDayLayoutRow.filter(Column("program_id") == programId).fetchOne(db)
        }) ?? nil
        let layout = ScheduleLayout.parseLayout(
            layoutRow.flatMap { try? JSONSerialization.jsonObject(with: Data($0.layout.raw.utf8)) }
        )
        let phase = ProgramPhase.stored(goals?.activePhase ?? goals?.goalPreset)
        return (
            ScheduleContext(programId: programId, phase: phase, overrides: overrides, layout: layout),
            goals
        )
    }

    /// Can the schedule speak for this week?
    ///
    /// ── WHY A WEEK CAN HAVE NO PLANNED DAYS ─────────────────────────────────
    /// `Schedule.scheduleDayIn` answers with the ACTIVE programme's layout — it
    /// has no memory of what was running last spring. Before Week 0 the block
    /// was PPL: six days, different splits, none of them in `Program.helix5`.
    /// Asking the current schedule about those weeks does not fail, it answers
    /// confidently and wrongly, and the strip fills with hollow rings claiming
    /// five Helix days were missed in a week the user actually trained six PPL
    /// ones.
    ///
    /// So the schedule is consulted from Week 0 forward and nowhere else. An
    /// earlier week draws what was LOGGED and leaves the rest blank, which is
    /// the whole of what this app can honestly say about it.
    private nonisolated static func isPlannable(_ window: WeekWindow) -> Bool {
        window.start >= Week.week0Start
    }

    private nonisolated static func dailyLogs(_ database: AppDatabase) -> [DailyLogRow] {
        (try? database.read { db in try DailyLogRow.order(Column("date")).fetchAll(db) }) ?? []
    }

    private nonisolated static func bodyRows(_ database: AppDatabase) -> [BodyCompositionRow] {
        (try? database.read { db in
            try BodyCompositionRow.order(Column("date"), Column("measured_at")).fetchAll(db)
        }) ?? []
    }

    private nonisolated static func dailyScores(_ database: AppDatabase) -> [DailyScoreRow] {
        (try? database.read { db in try DailyScoreRow.order(Column("date")).fetchAll(db) }) ?? []
    }

    /// Nil for an empty set rather than zero: a week with no scores has no mean,
    /// and 0 % battery is a reading somebody would act on.
    private nonisolated static func mean(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }
}
