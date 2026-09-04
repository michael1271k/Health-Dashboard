import Foundation
import Observation
import GRDB
import HelixCore
import HelixData

/// Everything the Day screen reads and writes, for one selected date.
///
/// ── ONE MODEL, ELEVEN STREAMS, ONE DATE ─────────────────────────────────────
/// The web page mounted a hook per table, each with its own cache and its own
/// invalidation list, and the schedule lived in `localStorage` where React could
/// not see it change. Here the schedule is three streams like everything else,
/// and every tile derives from the same published rows — so a swap made on the
/// web redraws the fatigue slots here, because `isTraining` is a computed
/// property and not a value somebody remembered to refresh.
///
/// Per-user streams (goals, overrides, layout, the stack) are opened once. The
/// per-date streams are torn down and reopened when the date changes, and the
/// old day's rows are cleared in the same breath so nothing renders under the
/// new title that belongs to the previous one.
@MainActor
@Observable
final class DayModel {

    private let database: AppDatabase
    let userId: String

    /// The selected logical day, ISO. Never later than today.
    private(set) var date: String
    private(set) var today: String = LogicalDay.today()

    // ── Per user ────────────────────────────────────────────────────────────
    private(set) var goals: UserGoalRow?
    private(set) var overrides: [String: String] = [:]
    private(set) var layout: DayLayout = [:]
    private(set) var customs: [CustomSupplementRow] = []

    // ── Per date ────────────────────────────────────────────────────────────
    private(set) var log: DailyLogRow?
    private(set) var fatigueRows: [FatigueLogRow] = []
    private(set) var doms: [DomsLogRow] = []
    private(set) var supplementLog: [SupplementLogRow] = []
    private(set) var cardio: [CardioLogRow] = []
    private(set) var night: SleepSessionRow?
    private(set) var nights: [NightMinutes] = []
    private(set) var entries: [NutritionEntryRow] = []
    private(set) var dailyTarget: DailyTargetRow?

    /// The fortnight behind the selected date, folded once. Read rather than
    /// observed — see `loadWindow()`.
    private(set) var window = Window()

    /// The last write that failed, for the banner.
    private(set) var failure: String?
    /// What the last swap did, echoed back until the date changes.
    private(set) var swapNote: String?

    init(database: AppDatabase, userId: String, date: String = LogicalDay.today()) {
        self.database = database
        self.userId = userId
        self.date = min(date, LogicalDay.today())
    }

    // MARK: - Date

    func select(_ iso: String) {
        guard iso != date, iso <= today else { return }
        date = iso
        if isObserving { restartDateStreams() }
    }

    func step(_ days: Int) {
        if let next = ISODate.addDays(date, days) { select(next) }
    }

    var isToday: Bool { date == today }

    /// Re-read the logical day — an app left open across midnight otherwise
    /// keeps offering "next day" into the future.
    func refreshToday() { today = LogicalDay.today() }

    // MARK: - Reading

    private var isObserving = false
    private var userTasks: [Task<Void, Never>] = []
    private var dateTasks: [Task<Void, Never>] = []
    private var layoutTask: Task<Void, Never>?
    private var layoutKey = ""
    private var streamedDate = ""

    func observe() async {
        guard !isObserving else { return }
        isObserving = true
        defer {
            (userTasks + dateTasks).forEach { $0.cancel() }
            layoutTask?.cancel()
            userTasks = []
            dateTasks = []
            layoutKey = ""
            streamedDate = ""
            isObserving = false
        }
        today = LogicalDay.today()
        userTasks = [
            watch(database.scheduleOverridesStream(userId: userId), into: \.overrides),
            watch(database.customSupplementsStream(userId: userId), into: \.customs),
        ]
        restartDateStreams()
        do {
            for try await row in database.userGoalsStream(userId: userId) {
                goals = row
                // The layout row is keyed on the plan, which this row names.
                restartLayoutStream()
            }
        } catch {
            report(error)
        }
    }

    private func restartLayoutStream() {
        let plan = planId
        guard layoutKey != plan else { return }
        layoutKey = plan
        layoutTask?.cancel()
        layout = [:]
        layoutTask = Task { [weak self] in
            guard let self else { return }
            do {
                for try await row in database.programDayLayoutStream(userId: userId, programId: plan) {
                    let object = row.flatMap { try? JSONSerialization.jsonObject(with: Data($0.layout.raw.utf8)) }
                    layout = ScheduleLayout.parseLayout(object)
                }
            } catch {
                report(error)
            }
        }
    }

    private func restartDateStreams() {
        guard streamedDate != date else { return }
        streamedDate = date
        dateTasks.forEach { $0.cancel() }
        // Cleared, not left standing: these belong to the previous day until the
        // new streams' first yield, and a stale row under a new title is a lie.
        log = nil; fatigueRows = []; doms = []; supplementLog = []; cardio = []; night = nil; nights = []
        swapNote = nil
        let d = date
        let from = ISODate.addDays(d, -(SleepDebt.windowDays - 1)) ?? d
        dateTasks = [
            // The day's own row is the one stream that also invalidates the
            // fortnight: a HealthKit sync writes today's HRV and steps, and the
            // baseline behind them moves with it.
            Task { [weak self] in
                guard let self else { return }
                do {
                    for try await row in database.dailyLogStream(userId: userId, date: d) {
                        log = row
                        loadWindow()
                    }
                } catch {
                    report(error)
                }
            },
            watch(database.fatigueStream(userId: userId, date: d), into: \.fatigueRows),
            watch(database.domsStream(userId: userId, date: d), into: \.doms),
            watch(database.supplementLogStream(userId: userId, date: d), into: \.supplementLog),
            watch(database.cardioStream(userId: userId, date: d), into: \.cardio),
            watch(database.sleepNightStream(userId: userId, date: d), into: \.night),
            watch(database.nightMinutesStream(userId: userId, from: from, to: d), into: \.nights),
            watch(database.nutritionEntriesStream(userId: userId, date: d), into: \.entries),
            watch(database.dailyTargetStream(userId: userId, date: d), into: \.dailyTarget),
        ]
        loadWindow()
    }

    // MARK: - The fortnight

    /// Everything Pulse needs that is a WINDOW rather than a day: the vitals
    /// against their own fortnight baseline, the activity trends behind them,
    /// and the day's stored score.
    struct Window: Sendable, Equatable {
        var vitals = HelixSnapshot.Vitals()
        var steps: VitalBlock?
        var standHours: VitalBlock?
        var activeKcal: VitalBlock?
        var score: DailyScoreRow?
        /// False until the first read lands, so the rows can say "—" honestly
        /// rather than draw a zero they have not read yet.
        var loaded = false
    }

    /// One detached read of `daily_logs` over the fortnight, plus the day's
    /// `daily_scores` row.
    ///
    /// ── WHY A READ AND NOT A NINTH STREAM ───────────────────────────────────
    /// Every vital on this screen is a reading against ITS OWN fortnight
    /// baseline, which is a window query — and `HelixData` (Track E, plan §10)
    /// exposes streams per DATE, not per range. Rather than reach across the
    /// track boundary for a `dailyLogsStream(from:to:)`, this goes through the
    /// public `read` door on the same schedule the streams fire on: once per
    /// date change, and again whenever the day's own row yields, which is what
    /// a HealthKit sync or a manual edit produces. Fourteen indexed rows.
    // ponytail: a `ValueObservation` over the range would repaint without the
    // nudge below; it belongs in HelixData, which this wave may not edit.
    func loadWindow() {
        let to = date
        let from = ISODate.addDays(to, -(Self.baselineDays - 1)) ?? to
        let database = database
        Task { [weak self] in
            let window = await Task.detached(priority: .userInitiated) {
                Self.readWindow(database: database, from: from, to: to)
            }.value
            guard let self, self.date == to else { return }
            self.window = window
        }
    }

    /// Apple's own baseline window, and the one `WidgetSnapshotBuilder` uses —
    /// the delta chips on this screen and on the Home Screen have to be the
    /// same number or one of them is lying.
    private nonisolated static let baselineDays = 14
    private nonisolated static let trendDays = 7

    private nonisolated static func readWindow(database: AppDatabase, from: String, to: String) -> Window {
        // Unfiltered on `user_id`, like every other read in the app: the local
        // store is one user's mirror and the id is `""` until auth resolves.
        // See the long note in `WorkoutWeek.build`.
        let logs: [DailyLogRow] = (try? database.read { db in
            try DailyLogRow
                .filter(Column("date") >= from && Column("date") <= to)
                .order(Column("date"))
                .fetchAll(db)
        }) ?? []
        let score: DailyScoreRow? = (try? database.read { db in
            try DailyScoreRow.filter(Column("date") == to).fetchOne(db)
        }) ?? nil

        func block(_ pick: (DailyLogRow) -> Double?) -> VitalBlock {
            WidgetDerive.vitalBlock(
                logs.map { DatedValue(date: $0.date, value: pick($0)) },
                todayISO: to, trendLimit: trendDays
            )
        }
        func vital(_ pick: (DailyLogRow) -> Double?) -> HelixSnapshot.Vital {
            let b = block(pick)
            return HelixSnapshot.Vital(
                value: b.value, baseline: b.baseline,
                trend: b.trend.map { HelixSnapshot.Point(d: $0.d, v: $0.v) }
            )
        }

        return Window(
            vitals: HelixSnapshot.Vitals(
                hrvMs: vital { $0.hrvMs },
                restingBpm: vital { $0.avgRestHeartRate.map(Double.init) },
                wristTempDeltaC: vital { $0.wristTempDelta },
                bloodOxygenPct: vital { $0.bloodOxygen },
                respiratoryRate: vital { $0.respiratoryRate }
            ),
            steps: block { $0.steps.map(Double.init) },
            standHours: block { $0.standHours.map(Double.init) },
            activeKcal: block { $0.activeEnergy },
            score: score,
            loaded: true
        )
    }

    private func watch<T: Sendable>(
        _ stream: AsyncThrowingStream<T, any Error>,
        into keyPath: ReferenceWritableKeyPath<DayModel, T>
    ) -> Task<Void, Never> {
        Task { [weak self] in
            do {
                for try await value in stream { self?[keyPath: keyPath] = value }
            } catch {
                self?.report(error)
            }
        }
    }

    /// Cancellation is not a failure — every date change cancels seven streams.
    private func report(_ error: any Error) {
        if error is CancellationError { return }
        failure = "That change could not be saved on this device."
    }

    // MARK: - Schedule

    var planId: String {
        Programs.normalizePlanId(goals?.activePlan ?? goals?.activeProgram) ?? Programs.defaultPlanId
    }

    var phase: ProgramPhase { ProgramPhase.stored(goals?.activePhase ?? goals?.goalPreset) }

    var context: ScheduleContext {
        ScheduleContext(programId: planId, phase: phase, overrides: overrides, layout: layout)
    }

    /// The plan that owns the selected date (era-aware), and its layout.
    var program: Program { Schedule.programForContext(context, date).program }

    var scheduled: ScheduleDay? { Schedule.scheduleDayIn(context, date) }
    var isTraining: Bool { Schedule.isTrainingDayIn(context, date) }
    var isOverridden: Bool { overrides[date] != nil }

    /// What is on any date, overrides included — the closure `Swap` plans over.
    func resolver() -> ResolveDay {
        let ctx = context
        return { Schedule.scheduleDayIn(ctx, $0) }
    }

    /// The date a program day would fall on this week, layout applied.
    func naturalDate(of day: ProgramDay) -> String {
        Swap.dateForWeekday(date, ScheduleLayout.effectiveWeekday(day, Schedule.programForContext(context, date).layout))
    }

    func loggedDays(_ dates: [String]) -> [LoggedDay] {
        ((try? database.loggedDays(userId: userId, dates: dates)) ?? []).map { LoggedDay(date: $0.date, dayKey: $0.dayKey) }
    }

    // MARK: - Recovery

    var fatigueSlots: [FatigueSlot] { Fatigue.slotsForDay(isTraining: isTraining) }

    var fatigue: FatigueDay {
        Fatigue.foldRows(fatigueRows.map { FatigueRow(slot: $0.slot, level: $0.level) }, isTraining: isTraining)
    }

    /// The STORED keys this slot stands in for, the modern key excluded — the
    /// writer already owns the row spelled the modern way, and listing it here
    /// would delete the row it had just saved.
    private func legacyKeys(for slot: FatigueSlot) -> [String] {
        let training = isTraining
        return Array(Set(fatigueRows.map(\.slot).filter {
            $0 != slot.rawValue && FatigueSlot(rawValue: $0) == nil && Fatigue.normalizeSlot($0, isTraining: training) == slot
        }))
    }

    /// Muscle group → severity, as rated today.
    var domsSeverity: [String: Int] {
        Dictionary(doms.map { ($0.muscleGroup, $0.severity) }, uniquingKeysWith: { _, last in last })
    }

    /// The bank, or nil when fewer than three nights have data — too little
    /// history to be honest about debt. The window ENDS on the selected date.
    var sleepDebt: SleepDebt? {
        let debt = SleepDebt.compute(
            nights: nights.map { SleepDebtNight(date: $0.date, sleepMinutes: $0.sleepMinutes.map(Double.init)) },
            goalHours: sleepGoalHours,
            weekAgo: ISODate.addDays(date, -7) ?? date
        )
        return debt.nights >= 3 ? debt : nil
    }

    var sleepGoalHours: Double { goals?.sleepGoalHours ?? 8 }

    // MARK: - The now strip

    /// The day's stored composite, or nil while the read is in flight or the
    /// day has not been scored. Never a zero — 0 is a real score.
    var score: Int? { window.score?.score }
    var battery: Int? { window.score?.batteryPct }

    /// `1,420 / 1,955 kcal · P 128 · water 2.1 L` — the whole of nutrition on
    /// this screen, because the gauges live in the Nutrition tab (§5.7).
    ///
    /// The kcal figure is what was RECORDED, never the Atwater sum of the
    /// macros beside it: Apple Health owns the day's energy (memory
    /// `no-tape-measurements`' sibling rule, and `MacroEditSheet`'s long note).
    var fuelLine: String? {
        guard !entries.isEmpty || log?.waterMl != nil else { return nil }
        let target = TargetChain.resolve(date: date, today: today, goals: goals, dayTarget: TargetChain.dayTarget(dailyTarget))
        var parts: [String] = []
        if !entries.isEmpty {
            let kcal = entries.reduce(0) { $0 + $1.calories }
            parts.append(target.calorie > 0
                ? "\(NutritionFormat.whole(kcal)) / \(NutritionFormat.whole(target.calorie)) kcal"
                : "\(NutritionFormat.whole(kcal)) kcal")
            let protein = entries.reduce(0) { $0 + $1.proteinG }
            parts.append("P \(NutritionFormat.whole(protein))")
        }
        if let ml = log?.waterMl, ml > 0 {
            parts.append("water \(DayFormat.number(ml / 1000)) L")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: - The stack

    private var decodedCustoms: [CustomSupplement] {
        customs.map { row in
            CustomSupplement(
                id: row.id, name: row.name, dose: row.dose, color: row.color, form: row.form, time: row.time,
                schedule: row.schedule.flatMap { try? JSONDecoder().decode(CustomSchedule.self, from: Data($0.raw.utf8)) }
            )
        }
    }

    private func stack(isTraining training: Bool) -> [SupplementSlot] {
        let weekday = ISODate.weekday(date) ?? 0
        return Supplements.stackForDate(
            Supplements.customSlotsForDate(decodedCustoms, weekday: weekday, isTraining: training),
            isTraining: training, weekday: weekday
        )
    }

    /// The day's slots, in time order.
    var stack: [SupplementSlot] { stack(isTraining: isTraining) }

    /// Keys of the items skipped today. Absence means taken.
    var skippedKeys: Set<String> { Set(supplementLog.filter { !$0.taken }.map(\.itemKey)) }

    /// The keys a rest day drops — read off the TRAINING stack, because on a
    /// rest day they are already gone from the day's own.
    var trainingOnlyKeys: [String] {
        stack(isTraining: true).flatMap(\.items).filter { $0.trainingOnly == true }.map(\.key)
    }

    // MARK: - Writing

    /// One failure path for every write. Returns whether it landed, for the
    /// sheets that close on success.
    @discardableResult
    private func write(_ body: () throws -> Void) -> Bool {
        do {
            try body()
            failure = nil
            return true
        } catch {
            report(error)
            return false
        }
    }

    func setFatigue(_ slot: FatigueSlot, level: Int?) {
        let superseded = legacyKeys(for: slot)
        // Optimistic: the chips read the fold, and a tap that shows a hop late
        // reads as a tap that missed.
        fatigueRows.removeAll { $0.slot == slot.rawValue || superseded.contains($0.slot) }
        if let level {
            fatigueRows.append(FatigueLogRow(id: "local", userId: userId, date: date, slot: slot.rawValue, level: level))
        }
        write { [database, userId, date] in
            try database.setFatigue(userId: userId, date: date, slot: slot.rawValue, level: level, superseding: superseded)
        }
    }

    /// Attribution (`source`) is left nil: the session that caused the soreness
    /// is a 72-hour lookup over `workout_sessions` the web runs per muscle, and
    /// nothing on this screen reads it back yet.
    func setDoms(_ muscle: String, severity: Int) {
        if let i = doms.firstIndex(where: { $0.muscleGroup == muscle }) {
            doms[i].severity = severity
        } else {
            doms.append(DomsLogRow(id: "local", userId: userId, date: date, muscleGroup: muscle, severity: severity))
        }
        write { [database, userId, date] in
            try database.setDoms(userId: userId, date: date, muscleGroup: muscle, severity: severity)
        }
    }

    func setSupplementSkipped(_ item: Supplement, in slot: SupplementSlot, skipped: Bool) {
        supplementLog.removeAll { $0.itemKey == item.key }
        if skipped {
            supplementLog.append(SupplementLogRow(userId: userId, date: date, itemKey: item.key, taken: false, updatedAt: Date()))
        }
        let due = Self.localInstant(date, hhmm: slot.time)
        write { [database, userId, date] in
            try database.setSupplementSkipped(userId: userId, date: date, itemKey: item.key, skipped: skipped, dueAt: due)
        }
    }

    func setSleepOnsetTrouble(_ on: Bool) {
        log?.sleepOnsetTrouble = on
        write { [database, userId, date] in
            try database.editDailyLog(userId: userId, date: date) { $0.sleepOnsetTrouble = on }
        }
    }

    /// `nil` is "As Planned" and is STORED as nil — the default is resolved on
    /// read, never written, so it can change wording without rewriting history.
    func setWeighInSkipReason(_ reason: String?) {
        let stored = WeighIn.isDefaultSkipReason(reason) ? nil : reason
        log?.weighinSkipReason = stored
        write { [database, userId, date] in
            try database.editDailyLog(userId: userId, date: date, clearing: stored == nil ? ["weighin_skip_reason"] : []) {
                $0.weighinSkipReason = stored
            }
        }
    }

    func saveBody(_ change: @Sendable @escaping (inout DailyLogRow) -> Void) -> Bool {
        write { [database, userId, date] in
            try database.saveBodyMetrics(userId: userId, date: date, change)
        }
    }

    /// The most recent reading before this date, for the form's placeholders.
    func latestBodyReading() throws -> DailyLogRow? {
        try database.latestBodyReading(userId: userId, before: date)
    }

    func addCardio(_ row: CardioLogRow) -> Bool {
        write { [database] in try database.addCardio(row) }
    }

    func deleteCardio(_ id: String) {
        cardio.removeAll { $0.id == id }
        write { [database] in try database.deleteCardio(id: id) }
    }

    // MARK: Swaps

    func applySwap(_ writes: [ScheduleWrite], note: String) -> Bool {
        let landed = write { [database, userId, trainingOnlyKeys] in
            try database.applyScheduleWrites(
                userId: userId, writes.map { (date: $0.date, dayKey: $0.dayKey) },
                trainingOnlySupplementKeys: trainingOnlyKeys
            )
        }
        if landed { swapNote = note }
        return landed
    }

    /// Clear this date's override AND its partner's — a swap is two rows, and
    /// undoing one leaves the week half-rearranged.
    func undoSwap() {
        let dates = swapPairDates()
        guard !dates.isEmpty else { return }
        if write({ [database, userId, trainingOnlyKeys] in
            try database.clearScheduleOverrides(userId: userId, dates: dates, trainingOnlySupplementKeys: trainingOnlyKeys)
        }) {
            swapNote = dates.count > 1
                ? "Swap undone — \(Swap.shortDayLabel(dates[1])) is back to the plan too."
                : "Back to the plan."
        }
    }

    /// The two dates of the swap this date belongs to, this one first.
    ///
    /// The partner is the override, nearest first within the 13-day horizon in
    /// either direction, that now holds what the PLAN put here — and whose own
    /// plan day is what sits here now. A rest-day swap satisfies both halves
    /// (the partner is a plan rest day carrying the moved key); so does an
    /// exchange. When only the first half matches the nearest such row is taken.
    // ponytail: pairs are inferred, not stored — a `swap_id` column would make
    // this a lookup if two swaps in one fortnight ever share a key.
    func swapPairDates() -> [String] {
        guard let here = overrides[date] else { return [] }
        let bare = ScheduleContext(programId: planId, phase: phase, overrides: [:], layout: layout)
        func planKey(_ d: String) -> String { Schedule.scheduleDayIn(bare, d)?.dayKey ?? Schedule.restOverride }
        let wanted = planKey(date)
        guard wanted != here else { return [date] }
        let nearest = (1...Swap.horizonDays).flatMap { [$0, -$0] }.compactMap { ISODate.addDays(date, $0) }
        let partner = nearest.first { overrides[$0] == wanted && planKey($0) == here }
            ?? nearest.first { overrides[$0] == wanted }
        return [date] + (partner.map { [$0] } ?? [])
    }

    // MARK: - Helpers

    /// The slot's own time on that date, in the device's zone — a dose due at
    /// 22:00 was due at 22:00 here, not at some UTC noon.
    static func localInstant(_ iso: String, hhmm: String) -> Date? {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, let noon = LogicalDay.date(fromISO: iso) else { return nil }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: noon)
    }
}
