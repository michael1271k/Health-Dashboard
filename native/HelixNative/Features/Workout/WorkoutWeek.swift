import Foundation
import Observation
import GRDB
import HelixCore
import HelixData

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
        var programId = Program.helix5.id
        var state: State = .none
        var progression: [ProgressionRow] = []
        var lastCardio: CardioLogRow?
        var todayCardio: [CardioLogRow] = []
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
        return (Program.byId(snapshot.programId) ?? .helix5).day(key: key)
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

    func deleteCardio(_ id: String) {
        try? database.deleteCardio(id: id)
        Task { await refresh() }
    }

    // MARK: - The read

    // ponytail: a query per day of the week plus one per session — a dozen
    // indexed reads on a table with a date index, run detached. A single ranged
    // SELECT belongs in HelixData, which Track E owns; this tab may not edit it
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
        // every other read in `HelixData` are unfiltered for exactly that
        // reason. Filtering here as well looks safer and is not: it silently
        // answers "no sessions" whenever the id in hand is not the id the rows
        // were written under, which is every screenshot, every preview, and any
        // read that lands before auth resolves. The id is still carried for
        // WRITES, where the column is NOT NULL and the value has to be right.
        let goals: UserGoalRow? = (try? database.read { db in
            try UserGoalRow.fetchOne(db)
        }) ?? nil
        let programId = goals?.activePlan ?? Program.helix5.id
        out.programId = programId
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
        let context = ScheduleContext(programId: programId, phase: phase, overrides: overrides, layout: layout)
        out.sessionTarget = Schedule.sessionTargetIn(context)
        out.todayKey = seededDayKey ?? Schedule.scheduleDayIn(context, today)?.dayKey

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

        var tonnage = 0.0
        for session in finished.values {
            let rows = (try? database.historySets(sessionId: session.id)) ?? []
            tonnage += SessionVolume.sessionVolumeKg(
                rows.filter { SetTags.isWorkingSet($0.setType) }.map(SessionAnalysis.volumeSet)
            )
        }
        out.weekTonnageKg = jsRound(tonnage)
        out.sessionsLogged = finished.count

        out.cells = dates.map { date in
            let logged = finished[date]
            let planned = Schedule.scheduleDayIn(context, date)
            let key = logged?.dayKey ?? planned?.dayKey
            return DayCell(
                date: date,
                initial: Self.initial(date),
                dayKey: key,
                label: logged.flatMap { SessionAnalysis.dayLabel($0.dayKey) } ?? planned?.label,
                sessionId: logged?.id,
                hasCardio: cardioDates.contains(date),
                isToday: date == today,
                isFuture: date > today
            )
        }

        // ── Today ───────────────────────────────────────────────────────────
        out.todayCardio = cardio.filter { $0.date == today }
        out.lastCardio = (try? database.read { db in
            try CardioLogRow
                .order(Column("date").desc, Column("created_at").desc)
                .fetchOne(db)
        }) ?? nil

        let day = out.todayKey.flatMap { (Program.byId(programId) ?? .helix5).day(key: $0) }

        // ── Ready to progress, and the day's state, off one history read ────
        //
        // Both questions are about the SAME lifts — the ones today asks for —
        // so the ledger is fetched once. The verdict is `Ceilings` over the last
        // two sessions of each lift, newest last, which is the program's own
        // double-progression rule and not a second opinion on it.
        var byName: [String: String] = [:]   // canonical name → exercise id
        if let day {
            let names = Set(day.exercises(for: phase).map { ExerciseAliases.canonicalName($0.name).lowercased() })
            let catalogue = (try? database.read { db in try Exercise.fetchAll(db) }) ?? []
            for row in catalogue {
                let canonical = ExerciseAliases.canonicalName(row.name)
                if names.contains(canonical.lowercased()), byName[canonical] == nil { byName[canonical] = row.id }
            }
        }
        let ledger = (try? database.historySets(exerciseIds: Array(byName.values))) ?? []
        let byExercise = Dictionary(grouping: ledger, by: \.exerciseId)

        if let day {
            for exercise in day.exercises(for: phase) {
                let canonical = ExerciseAliases.canonicalName(exercise.name)
                guard let id = byName[canonical], let rows = byExercise[id] else { continue }
                // The last two sessions of THIS lift, oldest first, working
                // sets only — a warm-up in the ladder makes every session look
                // like it faded.
                let sessionIds = rows.map(\.sessionId).reduce(into: [String]()) { out, id in
                    if out.last != id { out.append(id) }
                }
                let recent = sessionIds.suffix(2)
                let ladder = recent.map { sessionId in
                    rows.filter { $0.sessionId == sessionId && SetTags.isWorkingSet($0.setType) }
                        .map { WorkingSet(weightKg: $0.weightKg, reps: Double($0.reps)) }
                }.filter { !$0.isEmpty }
                guard !ladder.isEmpty else { continue }

                let timed = TimedExercise.isTimed(canonical)
                let verdict: ProgressionVerdict = timed
                    ? Ceilings.timedProgressionVerdict(ladder, targetSec: Ceilings.holdTarget(for: canonical, dayKey: day.key, program: Program.byId(programId) ?? .helix5, phase: phase))
                    : Ceilings.progressionVerdict(ladder, ceiling: Ceilings.repWindow(for: canonical, dayKey: day.key, program: Program.byId(programId) ?? .helix5, phase: phase)?.ceiling)

                switch verdict.state {
                case .ready:
                    let top = ladder.last?.filter { $0.weightKg > 0 }.map(\.weightKg).max()
                    let detail: String
                    if timed || verdict.suggestKg == nil {
                        detail = timed ? "extend hold" : "add a rep"
                    } else if let top, let next = verdict.suggestKg {
                        detail = "\(HelixFormat.kg(top)) → \(HelixFormat.kg(next)) kg"
                    } else {
                        detail = "\(HelixFormat.kg(verdict.suggestKg ?? 0)) kg"
                    }
                    out.progression.append(ProgressionRow(name: canonical, detail: detail, ready: true))
                case .oneMore:
                    out.progression.append(ProgressionRow(name: canonical, detail: "1 more session", ready: false))
                case .no:
                    continue
                }
            }
        }

        // ── The footer's state ──────────────────────────────────────────────
        if let key = out.todayKey {
            if let live = sessions.first(where: { $0.date == today && $0.dayKey == key && $0.endedAt == nil }) {
                let rows = (try? database.historySets(sessionId: live.id)) ?? []
                let working = rows.filter { SetTags.isWorkingSet($0.setType) }
                out.state = .live(
                    sets: SessionDetail.toRows(working.map(SessionAnalysis.detailSet)).filter { $0.num != nil }.count,
                    volumeKg: SessionVolume.sessionVolumeKg(working.map(SessionAnalysis.volumeSet))
                )
            } else if let closed = finished[today], closed.dayKey == key {
                let rows = (try? database.historySets(sessionId: closed.id)) ?? []
                let working = rows.filter { SetTags.isWorkingSet($0.setType) }
                let groups = SessionAnalysis.grouped(rows)
                // Records replayed against everything logged before this
                // session, exactly as the save path asked on the day —
                // `personal_records` is a current-best table and would answer
                // "none" for any session whose records have since been beaten.
                let prior = groups.flatMap { (byExercise[$0.exerciseId] ?? []).filter { $0.sessionId != closed.id } }
                let pr = SessionAnalysis.detect(groups: groups, prior: prior, dayKey: closed.dayKey, date: closed.date)
                out.state = .done(
                    id: closed.id,
                    sets: SessionDetail.toRows(working.map(SessionAnalysis.detailSet)).filter { $0.num != nil }.count,
                    volumeKg: jsRound(SessionVolume.sessionVolumeKg(working.map(SessionAnalysis.volumeSet))),
                    minutes: closed.durationMin,
                    prCount: pr.prCount
                )
            }
        }

        return out
    }

    /// "S" — the weekday's initial in the user's own locale, so a German week
    /// reads S M D M D F S rather than the English letters.
    private nonisolated static func initial(_ iso: String) -> String {
        guard let date = LogicalDay.date(fromISO: iso) else { return "·" }
        return String(date.formatted(.dateTime.weekday(.narrow)).prefix(1))
    }
}
