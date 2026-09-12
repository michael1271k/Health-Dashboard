import Foundation
import Observation
import GRDB
import OnyxCore
import OnyxData

/// Everything the Workout tab reads: the week behind you, the session in front
/// of you, and the lifts that have earned a heavier load.
///
/// ── ONE READ, NOT FIVE STREAMS ──────────────────────────────────────────────
/// The Day tab keeps eleven `ValueObservation`s because it is a live surface —
/// a fatigue slot ticked in a sheet has to repaint the tile behind it. This tab
/// is not: the only things that change it are finishing a session and logging a
/// bout, and both of them come back through a dismissal. So it is one detached
/// read, run on appear and on every dismissal, which costs a dozen indexed
/// queries and no observation to reap.
///
/// ── AND WHY THE WEEK IS RESOLVED, NOT GUESSED ───────────────────────────────
/// A day cell answers two different questions and they must not be confused. A
/// day that HOLDS a session takes that session's own `day_key`: a swap moves a
/// workout to another date and the weekday stops meaning anything — a Wednesday
/// "Delts & Arms" landed in the Upper A curve exactly that way. A day that does
/// not takes `Schedule.scheduleDayIn`, which is the plan, the per-date
/// overrides and the permanent weekday layout run as one rule.
@MainActor
@Observable
final class WorkoutWeek {

    // MARK: - Shapes

    /// One 36 pt cell of the This-week panel.
    struct DayCell: Identifiable, Sendable, Equatable {
        var id: String { date }
        let date: String
        /// "S", "M", "T" … the weekday's first letter, localised.
        let initial: String
        /// The split this day carries; nil is a rest day.
        let dayKey: String?
        let label: String?
        /// Set when a finished session sits on this date — the cell is a link.
        let sessionId: String?
        let hasCardio: Bool
        let isToday: Bool
        /// Later than today: planned, and not yet a fact.
        let isFuture: Bool

        var isLogged: Bool { sessionId != nil }
        var isRest: Bool { dayKey == nil }
    }

    /// One row of "Ready to progress".
    struct ProgressionRow: Identifiable, Sendable, Equatable {
        var id: String { name }
        let name: String
        /// `40 → 42.5 kg` · `extend hold` · `1 more session`.
        let detail: String
        /// Earned it. `false` is the "one more session" case, which is the
        /// nearly-there state and wears gold rather than green (§5.2).
        let ready: Bool
    }

    /// One movement's best set from the last time this split was trained.
    ///
    /// A PAIR is collapsed to its weaker side before it competes, the same rule
    /// `SessionVolume` scores it by: a Side Plank logged 66 s left and 61 s
    /// right is a 61 s hold, and printing the better half as "last time" sets a
    /// target that was never held.
    struct TopSet: Sendable, Equatable {
        let weightKg: Double
        /// Reps, or SECONDS on a timed hold — the same overload `reps` carries
        /// everywhere else in this app.
        let reps: Double
        let rpe: Double?
        let timed: Bool
    }

    /// The last session of the split TODAY is, and what was done in it.
    ///
    /// ── WHY THE SAME `day_key` AND NOT "THE LAST TIME YOU DID THIS LIFT" ────
    /// The founder's call (2026-09-11), and it is the stricter of the two. Leg
    /// Press appears in Legs A and Legs B; "last time you trained it" would put
    /// Monday's 75 × 13 on a Thursday card whose prescription is a different
    /// movement pattern at a different point in the week. One session, one
    /// date, one comparison — and a movement that was not in it shows nothing
    /// rather than a number from some other day, which is the honest blank.
    ///
    /// Keyed by CANONICAL name, because the card has plan names and the ledger
    /// has whatever was logged; `ExerciseAliases` is the one join between them.
    struct Previous: Sendable, Equatable {
        let id: String
        let date: String
        let top: [String: TopSet]

        func top(for name: String) -> TopSet? {
            top[ExerciseAliases.canonicalName(name).lowercased()]
        }
    }

    /// Where today's session stands.
    enum State: Sendable, Equatable {
        case none
        case live(sets: Int, volumeKg: Double)
        case done(id: String, sets: Int, volumeKg: Double, minutes: Double?, prCount: Int)
    }

    /// Everything the screen draws, built off the main actor in one pass.
    struct Snapshot: Sendable {
        var cells: [DayCell] = []
        var sessionsLogged = 0
        var sessionTarget = 5
        var weekTonnageKg = 0.0
        /// Today's day key, or nil for a rest day.
        var todayKey: String?
        /// The active plan's deck — `routines` rows (W2). Empty until loaded.
        var program = Program(id: "", label: "", days: [])
        var programId: String { program.id }
        var state: State = .none
        var progression: [ProgressionRow] = []
        /// This week's tonnage minus last week's. Nil until there is a week
        /// behind this one to compare against.
        var weekDeltaKg: Double?
        /// Distinct movements this device has ever logged a set of — the
        /// Library door's number.
        var liftsTracked = 0
        /// Finished sessions in the CALENDAR month — the History door's.
        var sessionsThisMonth = 0
        var lastCardio: CardioLogRow?
        var todayCardio: [CardioLogRow] = []
        /// The last eight bouts, oldest first, for the card's trail.
        var recentCardio: [CardioLogRow] = []
        /// This week's bouts long enough to count (`Zone2.minMinutes`).
        var zone2Done = 0
        /// Whether today carries a `schedule_overrides` row — the one fact the
        /// swap menu needs that the plan alone cannot answer, since an override
        /// resolves to a perfectly ordinary-looking day.
        var isOverridden = false
        /// The last time this split was trained — what the plan card prints in
        /// place of the prescription. Nil on the first ever session of a split.
        var previous: Previous?

        // ── THE WEEK SHEET'S THREE ASSIGNMENTS (W6) ─────────────────────────
        // `weekCurrent` is what the panel draws — plan plus overrides. `weekBase`
        // is the same week with the overrides taken away, and it is the one the
        // sheet could not work without: it is how "put this back where it was"
        // is told from "pin the plan's own value here", which look identical for
        // a week and diverge the moment the layout is permanently changed.
        /// The week as it stands: plan, layout and per-date overrides.
        var weekCurrent = WeekAssignment(dates: [], days: [:])
        /// The same week with no per-date overrides at all.
        var weekBase = WeekAssignment(dates: [], days: [:])
        /// Committed sessions inside the week, for the placement rule.
        var loggedDays: [LoggedDay] = []
        /// The day keys the plan asks for this week, in plan order — what a
        /// draft is checked against for a session it has left homeless.
        var scheduledKeys: [String] = []
        /// Training-only supplement keys, unioned over the week's seven days.
        ///
        /// The day tier passes ONE date's keys. A week batch touches seven
        /// weekdays whose stacks differ, and `applyScheduleWrites` takes a
        /// single list — so the union is what makes the cascade complete.
        /// Deleting a key that was never scheduled on a date removes no row,
        /// which is why the wider list is the safe one rather than the lossy one.
        var trainingOnlyKeys: [String] = []
    }

    // MARK: - Live state

    private(set) var snapshot = Snapshot()
    private(set) var loaded = false

    private let database: AppDatabase
    let userId: String
    /// Pinned by the screenshot harness so the panel is not a different picture
    /// every day of the week. The app always passes nil.
    private let seededToday: String?
    /// Also the harness's: the seeded week's Thursday is a rest day in some
    /// plans and the shot has to show a session card, not an empty state.
    private let seededDayKey: String?
    private var phase: ProgramPhase

    init(database: AppDatabase, userId: String, phase: ProgramPhase,
         seededToday: String? = nil, seededDayKey: String? = nil) {
        self.database = database
        self.userId = userId
        self.phase = phase
        self.seededToday = seededToday
        self.seededDayKey = seededDayKey
    }

    var today: String { seededToday ?? LogicalDay.today() }

    /// Today's deck, phase applied. nil on a rest day.
    var todayDay: ProgramDay? {
        guard let key = snapshot.todayKey else { return nil }
        return snapshot.program.day(key: key)
    }

    func setPhase(_ next: ProgramPhase) {
        guard next != phase else { return }
        phase = next
        Task { await refresh() }
    }

    // MARK: - Loading

    func refresh() async {
        let database = self.database, today = self.today
        let phase = self.phase, dayKey = self.seededDayKey
        snapshot = await Task.detached(priority: .userInitiated) {
            Self.build(database: database, today: today, phase: phase, seededDayKey: dayKey)
        }.value
        loaded = true
    }

    /// Cardio written straight through, then the whole tab re-read: a bout
    /// changes the day cell's dot and the row at the same time, and re-reading
    /// is cheaper than keeping two copies of one fact in agreement.
    func addCardio(_ row: CardioLogRow) -> Bool {
        do {
            try database.addCardio(row)
            Task { await refresh() }
            return true
        } catch {
            return false
        }
    }

    /// Apply a week's edit: the overrides that must be written, and the ones
    /// that must go.
    ///
    /// Both halves in one call because they are one change. Writing the moves
    /// and failing to clear the returns leaves a week that is half rearranged
    /// and half pinned — the state `undoSwap` exists to prevent one tier down,
    /// and the reason that method takes a list rather than a date.
    @discardableResult
    func applyWeekPlan(_ plan: WeekPlan) -> Bool {
        guard plan.block == nil, !plan.isEmpty else { return false }
        do {
            if !plan.writes.isEmpty {
                try database.applyScheduleWrites(
                    userId: userId, plan.writes.map { (date: $0.date, dayKey: $0.dayKey) },
                    trainingOnlySupplementKeys: snapshot.trainingOnlyKeys
                )
            }
            if !plan.clears.isEmpty {
                try database.clearScheduleOverrides(
                    userId: userId, dates: plan.clears, trainingOnlySupplementKeys: snapshot.trainingOnlyKeys
                )
            }
            Task { await refresh() }
            return true
        } catch {
            return false
        }
    }

    func deleteCardio(_ id: String) {
        try? database.deleteCardio(id: id)
        Task { await refresh() }
    }

    // MARK: - The read

    // ponytail: a query per day of the week plus one per session — a dozen
    // indexed reads on a table with a date index, run detached. A single ranged
    // SELECT belongs in OnyxData, which Track E owns; this tab may not edit it
    // in the same wave (plan §10).
    private nonisolated static func build(
        database: AppDatabase, today: String,
        phase: ProgramPhase, seededDayKey: String?
    ) -> Snapshot {
        var out = Snapshot()

        // ── The schedule context ────────────────────────────────────────────
        //
        // ── WHY NOTHING HERE FILTERS ON `user_id` ───────────────────────────
        // The local store is ONE user's mirror — the puller only ever writes
        // the signed-in user's rows and `sessionHistory()`, `historySets()` and
        // every other read in `OnyxData` are unfiltered for exactly that
        // reason. Filtering here as well looks safer and is not: it silently
        // answers "no sessions" whenever the id in hand is not the id the rows
        // were written under, which is every screenshot, every preview, and any
        // read that lands before auth resolves. The id is still carried for
        // WRITES, where the column is NOT NULL and the value has to be right.
        let goals: UserGoalRow? = (try? database.read { db in
            try UserGoalRow.fetchOne(db)
        }) ?? nil
        // The catalogue with the selection applied — one assembly, shared with
        // every other reader (`AppDatabase.scheduleContext`). The user is the
        // goals row's own, for the reason stated above.
        var context = (try? database.scheduleContext(userId: database.localUserId())) ?? ScheduleContext(programId: "", phase: phase)
        context.phase = phase
        let overrides = context.overrides
        out.program = context.activeProgram
        let analysis = SessionAnalysis.context(database: database)
        out.sessionTarget = Schedule.sessionTargetIn(context)
        out.todayKey = seededDayKey ?? Schedule.scheduleDayIn(context, today)?.dayKey
        out.isOverridden = overrides[today] != nil

        // ── The week ────────────────────────────────────────────────────────
        // `Week.startDay(fromEndDay:)` is the same conversion Settings writes
        // and the export reads, so changing "week starts on" re-cuts this panel
        // and the weekly report together.
        let startDay = Week.startDay(fromEndDay: goals?.weekEndDay)
        let weekStart = Week.start(of: today, startDay: startDay)
        let dates = (0..<7).compactMap { ISODate.addDays(weekStart, $0) }

        let sessions = (try? database.read { db in
            try WorkoutSession
                .filter(dates.contains(Column("date")))
                .order(Column("date"), Column("started_at"))
                .fetchAll(db)
        }) ?? []
        let cardio = (try? database.read { db in
            try CardioLogRow.filter(dates.contains(Column("date"))).fetchAll(db)
        }) ?? []
        let cardioDates = Set(cardio.map(\.date))

        // One finished session per date wins the cell; a date holding two takes
        // the first, which is the one the plan was for.
        var finished: [String: WorkoutSession] = [:]
        for s in sessions where s.endedAt != nil {
            if finished[s.date] == nil { finished[s.date] = s }
        }

        // ── EVERY NON-GHOST ROW, NOT THE WORKING ONES ───────────────────────
        // `SessionVolume`'s header is the rule and it is one sentence: "A ghost
        // weighs nothing; a warm-up still counts." Filtering to working sets
        // before calling it was this file overruling that rule, and the cost
        // was visible on 2026-09-11 — the Workout tab's card said 8,815 kg for
        // a session whose own summary page, `closeSession` and
        // `workout_sessions.total_volume_kg` all said 9,715. The gap was one
        // 60 × 15 warm-up on the leg press, and a reader has no way to tell
        // which of the two numbers is the workout.
        //
        // Set COUNTS stay on the working rows: a warm-up is not a set of the
        // prescription, and that is a different question from what was lifted.
        var tonnage = 0.0
        for session in finished.values {
            let rows = (try? database.historySets(sessionId: session.id)) ?? []
            tonnage += SessionVolume.sessionVolumeKg(rows.map(SessionAnalysis.volumeSet))
        }
        out.weekTonnageKg = jsRound(tonnage)
        out.sessionsLogged = finished.count

        out.cells = dates.map { date in
            let logged = finished[date]
            let planned = Schedule.scheduleDayIn(context, date)
            let key = logged?.dayKey ?? planned?.dayKey
            return DayCell(
                date: date,
                initial: WeekWindow.initial(date),
                dayKey: key,
                label: logged.flatMap { SessionAnalysis.dayLabel($0.dayKey, in: out.program) } ?? planned?.label,
                sessionId: logged?.id,
                hasCardio: cardioDates.contains(date),
                isToday: date == today,
                isFuture: date > today
            )
        }

        // ── THE WEEK SHEET'S INPUT ──────────────────────────────────────────
        // Built here rather than in the sheet so it costs the same one detached
        // pass as everything else on this tab: a sheet that opened its own
        // schedule context would read the catalogue a second time, on the main
        // actor, while a modal was animating in.
        //
        // `bare` is `context` with the overrides removed and NOTHING else
        // changed — same plan, same phase, same permanent layout — so it
        // answers "what does the plan say about this date", which is the only
        // question `planWeek` needs a second context for.
        // `let` copies, not the mutable `context` above: `ResolveDay` is
        // `@Sendable` and captures its context, so capturing a `var` is a data
        // race the compiler refuses outright. Two immutable snapshots is also
        // what the two closures actually mean.
        let withOverrides = context
        var stripped = context
        stripped.overrides = [:]
        let bare = stripped
        // ── A LOGGED DAY IS WHAT IT LOGGED, NOT WHAT THE PLAN SAYS ──────────
        // The same rule `DayCell` above applies, and for the same reason: a
        // session is attributed by its own `day_key` everywhere in this app, so
        // a Wednesday that ran Chest & Back after a swap IS Chest & Back. The
        // first build of this sheet took the plan's answer for every date and
        // drew "Rest" beside a completed-session seal on the one row where the
        // two disagree — the exact day a week sheet exists to be opened about.
        //
        // `weekBase` is deliberately NOT given this treatment: its job is to
        // answer "what does the plan say", which is how `planWeek` tells
        // clearing an override from pinning one.
        var current = Swap.weekAssignment(of: today, resolve: { Schedule.scheduleDayIn(withOverrides, $0) })
        for (date, session) in finished {
            guard let key = session.dayKey, !key.isEmpty else { continue }
            // `set`, not `place`: the record may hold the same split on two
            // dates and neither one evicts the other. See `WeekAssignment.set`.
            current.set(key, on: date)
        }
        out.weekCurrent = current
        out.weekBase = Swap.weekAssignment(of: today, resolve: { Schedule.scheduleDayIn(bare, $0) })
        // A session's own `day_key` is what it is attributed by, everywhere in
        // this app. A finished session with no key cannot collide with a
        // placement and is carried as nil rather than dropped, because
        // `blockForPlacement` still refuses to overwrite the DATE.
        out.loggedDays = dates.compactMap { date in
            finished[date].map { LoggedDay(date: date, dayKey: $0.dayKey) }
        }
        out.scheduledKeys = out.weekBase.dates
            .map { out.weekBase.key(on: $0) }
            .filter { $0 != Schedule.restOverride }
        let customs = (try? database.read { db in try CustomSupplementRow.fetchAll(db) }) ?? []
        let active = Supplements.active(customs.map(AppDatabase.custom), on: today)
        out.trainingOnlyKeys = Array(Set((0..<7).flatMap { weekday in
            Supplements.stackForDate(
                Supplements.customSlotsForDate(active, weekday: weekday, isTraining: true),
                isTraining: true, weekday: weekday
            )
            .flatMap(\.items)
            .filter { $0.trainingOnly == true }
            .map(\.key)
        })).sorted()

        // ── Last week, for the Trends door's delta ──────────────────────────
        //
        // The same loop as above over the seven dates before this week. It is
        // the only number on the screen that needs a second week, and a door
        // that says "Trends" with no number on it is a door with nothing
        // behind it.
        if let lastWeekStart = ISODate.addDays(weekStart, -7) {
            let lastDates = (0..<7).compactMap { ISODate.addDays(lastWeekStart, $0) }
            let lastSessions = (try? database.read { db in
                try WorkoutSession
                    .filter(lastDates.contains(Column("date")) && Column("ended_at") != nil)
                    .order(Column("date"), Column("started_at"))
                    .fetchAll(db)
            }) ?? []
            // One session per date, first wins — the same rule the current
            // week's `finished` dictionary applies. Without it a date holding
            // two finished sessions counts twice on one side of the subtraction
            // and once on the other, and the delta is wrong by a whole session.
            var lastFinished: [String: WorkoutSession] = [:]
            for session in lastSessions where lastFinished[session.date] == nil {
                lastFinished[session.date] = session
            }
            if !lastFinished.isEmpty {
                var previous = 0.0
                for session in lastFinished.values {
                    let rows = (try? database.historySets(sessionId: session.id)) ?? []
                    previous += SessionVolume.sessionVolumeKg(rows.map(SessionAnalysis.volumeSet))
                }
                out.weekDeltaKg = jsRound(out.weekTonnageKg - previous)
            }
        }

        // ── What the card prints where the rep window used to be ────────────
        out.previous = previousSession(database, dayKey: out.todayKey, before: today)

        // ── The other two doors ─────────────────────────────────────────────
        out.liftsTracked = (try? database.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(DISTINCT exercise_id) FROM workout_sets") ?? 0
        }) ?? 0
        // The calendar month, not a rolling thirty days: "sessions this month"
        // is a sentence people say, and a rolling window would tick down while
        // you were looking at it.
        let month = String(today.prefix(7))
        out.sessionsThisMonth = (try? database.read { db in
            try WorkoutSession
                .filter(Column("date").like("\(month)%") && Column("ended_at") != nil)
                .fetchCount(db)
        }) ?? 0

        // ── Today ───────────────────────────────────────────────────────────
        out.todayCardio = cardio.filter { $0.date == today }
        out.zone2Done = cardio.filter { Zone2.isZone2($0.durationMin) }.count
        out.lastCardio = (try? database.read { db in
            try CardioLogRow
                .order(Column("date").desc, Column("created_at").desc)
                .fetchOne(db)
        }) ?? nil
        // Oldest first: a trail reads left to right like everything else in
        // the app, and `Sparkline` takes the points in that order.
        out.recentCardio = ((try? database.read { db in
            try CardioLogRow
                .order(Column("date").desc, Column("created_at").desc)
                .limit(8)
                .fetchAll(db)
        }) ?? []).reversed()

        // ── Ready to progress ───────────────────────────────────────────────
        //
        // `AppDatabase.progressionQueue` (OnyxData, §6.5): the lifts today
        // asks for, graded by `Ceilings` over their last two sessions logged
        // UNDER TODAY'S DAY KEY — not the lift's whole history, which graded
        // Legs A's ceiling against Legs B's sets.
        if let key = out.todayKey {
            let alerts = (try? database.progressionQueue(dayKey: key, program: out.program, phase: phase, today: today)) ?? []
            out.progression = alerts.compactMap { alert in
                switch alert.state {
                case .ready:
                    let detail: String
                    if alert.timed || alert.suggestKg == nil {
                        detail = alert.timed ? "extend hold" : "add a rep"
                    } else if let top = alert.currentKg, let next = alert.suggestKg {
                        detail = "\(OnyxFormat.kg(top)) → \(OnyxFormat.kg(next)) kg"
                    } else {
                        detail = "\(OnyxFormat.kg(alert.suggestKg ?? 0)) kg"
                    }
                    return ProgressionRow(name: alert.name, detail: detail, ready: true)
                case .oneMore:
                    return ProgressionRow(name: alert.name, detail: "1 more session", ready: false)
                case .no:
                    return nil
                }
            }
        }

        // ── The footer's state ──────────────────────────────────────────────
        //
        // ── AN OPEN ROW WITH NOTHING IN IT DOES NOT BEAT A FINISHED ONE ─────
        // `.live` used to win outright, so a single stray open session for
        // today's split pinned the footer to "Resume workout" for good — the
        // finished session sat right there in `finished[today]` and was never
        // reached. Stray rows are easy to make: `openSession` is
        // look-up-or-create over `ended_at IS NULL`, so ANY append after a
        // close mints a second row beside the closed one.
        //
        // The test is whether the open session has WORK in it, not whether it
        // exists. That keeps a real two-a-day live — finish the morning
        // session, start the evening one, log a set, and the footer says Resume
        // — while an empty row loses to the workout that actually happened.
        // `finish` itself refuses a session with no working sets, so an open
        // row with none is a session nobody could have finished anyway.
        if let key = out.todayKey {
            let open = sessions.first { $0.date == today && $0.dayKey == key && $0.endedAt == nil }
            let openWorking = open.map { session in
                ((try? database.historySets(sessionId: session.id)) ?? [])
                    .filter { SetTags.isWorkingSet($0.setType) }
            } ?? []
            if let live = open, !openWorking.isEmpty || finished[today] == nil {
                let rows = (try? database.historySets(sessionId: live.id)) ?? []
                let working = rows.filter { SetTags.isWorkingSet($0.setType) }
                out.state = .live(
                    sets: SessionDetail.toRows(working.map(SessionAnalysis.detailSet)).filter { $0.num != nil }.count,
                    volumeKg: SessionVolume.sessionVolumeKg(rows.map(SessionAnalysis.volumeSet))
                )
            } else if let closed = finished[today], closed.dayKey == key {
                let rows = (try? database.historySets(sessionId: closed.id)) ?? []
                let working = rows.filter { SetTags.isWorkingSet($0.setType) }
                let groups = SessionAnalysis.grouped(rows)
                // Records replayed against everything logged before this
                // session, exactly as the save path asked on the day —
                // `personal_records` is a current-best table and would answer
                // "none" for any session whose records have since been beaten.
                let prior = ((try? database.historySets(exerciseIds: groups.map(\.exerciseId))) ?? [])
                    .filter { $0.sessionId != closed.id }
                let pr = SessionAnalysis.detect(groups: groups, prior: prior, dayKey: closed.dayKey, date: closed.date, in: analysis)
                out.state = .done(
                    id: closed.id,
                    sets: SessionDetail.toRows(working.map(SessionAnalysis.detailSet)).filter { $0.num != nil }.count,
                    volumeKg: jsRound(SessionVolume.sessionVolumeKg(rows.map(SessionAnalysis.volumeSet))),
                    minutes: closed.durationMin,
                    prCount: pr.prCount
                )
            }
        }

        return out
    }

    // MARK: - The last time this split was trained

    /// The most recent FINISHED session carrying `dayKey`, and each movement's
    /// best set in it.
    ///
    /// ── WHAT THIS REPLACED, AND WHY IT IS NOT A SECOND KIND OF NUMBER ──────
    /// The plan card printed the prescription — `3 × 10-15`. Two of those three
    /// figures are a range the program asserts, and a reader standing at the
    /// machine does not need to be told the window they have been inside for
    /// eight weeks; they need the number they have to beat. The window has not
    /// been deleted from the app — the logger's own card still carries it, at
    /// the moment it is actionable, and `Ceilings.repWindow` still gates the
    /// e1RM axis and the progression cue. It is gone from the SUMMARY, where it
    /// was the only thing on the row and said the least.
    ///
    /// ── THE TOP SET IS THE HEAVIEST, TIES TO REPS ───────────────────────────
    /// The founder's rule (2026-09-11), and it is `ExerciseSummary`'s own:
    /// "at equal load the set that says the most is the one with the most
    /// reps". A warm-up cannot win it — `isWorkingSet` — because "last time"
    /// is a claim about work. On an unloaded movement every set weighs 0 and
    /// the reps alone decide, which is the right answer for a knee raise and
    /// for a hold.
    private nonisolated static func previousSession(
        _ database: AppDatabase, dayKey: String?, before today: String
    ) -> Previous? {
        guard let dayKey else { return nil }
        let session = ((try? database.sessionHistory()) ?? [])
            .first { $0.dayKey == dayKey && $0.endedAt != nil && $0.date < today }
        // `sessionHistory` is already newest-first, so `first` IS the latest.
        guard let session else { return nil }
        let rows = ((try? database.historySets(sessionId: session.id)) ?? [])
            .filter { SetTags.isWorkingSet($0.setType) }
        guard !rows.isEmpty else { return nil }

        var top: [String: TopSet] = [:]
        for group in SessionAnalysis.grouped(rows) {
            let canonical = SessionAnalysis.displayName(id: group.exerciseId, stored: group.name)
            let timed = TimedExercise.isTimed(canonical)
            var best: TopSet?
            for candidate in collapsed(group.sets) {
                let set = TopSet(weightKg: candidate.weightKg, reps: candidate.reps,
                                 rpe: candidate.rpe, timed: timed)
                guard let held = best else { best = set; continue }
                if set.weightKg > held.weightKg
                    || (set.weightKg == held.weightKg && set.reps > held.reps) {
                    best = set
                }
            }
            // A row with no load AND no reps is not a set anybody can beat: a
            // treadmill bout is `0 kg × 0` with its content in `duration_sec`,
            // and `collapsed` reads neither of those columns. Printing
            // `Last: 0 reps` under Treadmill states a fact about a walk that is
            // false and useless at once. A blank is already what this card says
            // for a movement the last session did not hold.
            if let best, best.reps > 0 || best.weightKg > 0 {
                top[canonical.lowercased()] = best
            }
        }
        return Previous(id: session.id, date: session.date, top: top)
    }

    /// One movement's rows as PHYSICAL sets: a genuine L/R pair becomes one
    /// candidate at `min(weight) × min(reps)`, everything else stands alone.
    ///
    /// The same collapse `SessionVolume` and `PrEngine.volumeCredits` apply,
    /// for the same reason — a pair is one set of work, and scoring it at its
    /// better side invents a set that was not performed. The RPE kept is the
    /// HARDER of the two: the pair was as hard as its worse side felt.
    private nonisolated static func collapsed(
        _ rows: [HistorySetRow]
    ) -> [(weightKg: Double, reps: Double, rpe: Double?)] {
        var out: [(weightKg: Double, reps: Double, rpe: Double?)] = []
        var pairAt: [String: Int] = [:]
        for row in rows {
            let reps = Double(row.reps)
            guard let pairId = row.pairId, !pairId.isEmpty, row.lr == "L" || row.lr == "R" else {
                out.append((row.weightKg, reps, row.rpe))
                continue
            }
            if let i = pairAt[pairId] {
                out[i] = (
                    Swift.min(out[i].weightKg, row.weightKg),
                    Swift.min(out[i].reps, reps),
                    [out[i].rpe, row.rpe].compactMap { $0 }.max()
                )
            } else {
                pairAt[pairId] = out.count
                out.append((row.weightKg, reps, row.rpe))
            }
        }
        return out
    }
}
