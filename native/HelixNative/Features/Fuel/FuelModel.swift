import Foundation
import Observation
import HelixCore
import HelixData

/// Everything the Fuel tab reads and writes, for ONE selected day.
///
/// ── THE TARGET IS RESOLVED FOR THE SELECTED DATE, NOT TODAY ─────────────────
/// A Tuesday opened on Friday is graded against the rung that was in force on
/// the Tuesday: `Levers.goalsForDate` reads the schedule for the past and the
/// stored selection for today-and-after, then the day's own `daily_targets` row
/// is laid on top. This is the same chain the You tab performs for today, with
/// the date as a parameter instead of a clock.
///
/// ── SIX STREAMS, ONE MODEL ──────────────────────────────────────────────────
/// Two are keyed on the user (goals, target profiles) and live for the tab;
/// four are keyed on the date (the flat day row, the entries, the water ledger,
/// the day target) and are torn down and restarted when the day changes. The
/// values in hand belong to the previous day until the new streams' first yield,
/// so they are cleared rather than left standing across the gap.
@MainActor
@Observable
final class FuelModel {

    private let database: AppDatabase
    let userId: String

    /// The logical day, held so one render resolves every rung the same way.
    private(set) var today: String = LogicalDay.today()
    /// The day on screen. Changes only through `select`, which restarts the
    /// per-date streams.
    private(set) var date: String

    private(set) var goals: UserGoalRow?
    private(set) var profileRows: [TargetProfileRow] = []
    private(set) var dailyLog: DailyLogRow?
    /// `nil` until the first yield — the loading state, which is not an empty
    /// day and must not be drawn as one.
    private(set) var entries: [NutritionEntryRow]?
    private(set) var water: [WaterIntakeRow] = []
    private(set) var dailyTarget: DailyTargetRow?

    /// The last write that failed, for the one banner at the top.
    private(set) var failure: String?

    init(database: AppDatabase, userId: String, date: String = LogicalDay.today()) {
        self.database = database
        self.userId = userId
        self.date = date
    }

    // MARK: - Reading

    private var isObserving = false
    private var profilesTask: Task<Void, Never>?
    private var dateTasks: [Task<Void, Never>] = []

    /// Subscribe. Called from `.task`, cancelled with the view. Re-entrant
    /// calls are no-ops; the child tasks are reaped when the owner's is.
    func observe() async {
        guard !isObserving else { return }
        isObserving = true
        defer {
            profilesTask?.cancel()
            profilesTask = nil
            cancelDateTasks()
            isObserving = false
        }
        today = LogicalDay.today()
        profilesTask = track(database.targetProfilesStream(userId: userId)) { [weak self] in self?.profileRows = $0 }
        restartDateStreams()
        do {
            for try await row in database.userGoalsStream(userId: userId) { goals = row }
        } catch {
            report(error)
        }
    }

    func select(date newDate: String) {
        guard newDate != date else { return }
        date = newDate
        restartDateStreams()
    }

    /// Step a day. Never past today — a target for a day that has not happened
    /// is not a thing this screen grades.
    func shift(_ days: Int) {
        guard let next = ISODate.addDays(date, days), next <= today else { return }
        select(date: next)
    }

    var isToday: Bool { date == today }

    /// Re-read the logical day; an app left open across midnight otherwise
    /// resolves the rung against yesterday.
    func refreshToday() {
        today = LogicalDay.today()
    }

    private func restartDateStreams() {
        cancelDateTasks()
        dailyLog = nil
        entries = nil
        water = []
        dailyTarget = nil
        guard isObserving else { return }
        let date = self.date
        dateTasks = [
            track(database.dailyLogStream(userId: userId, date: date)) { [weak self] in self?.dailyLog = $0 },
            track(database.nutritionEntriesStream(userId: userId, date: date)) { [weak self] in self?.entries = $0 },
            track(database.waterIntakeStream(userId: userId, date: date)) { [weak self] in self?.water = $0 },
            track(database.dailyTargetStream(userId: userId, date: date)) { [weak self] in self?.dailyTarget = $0 },
        ]
    }

    private func cancelDateTasks() {
        dateTasks.forEach { $0.cancel() }
        dateTasks = []
    }

    private func track<T: Sendable>(
        _ stream: AsyncThrowingStream<T, any Error>,
        _ apply: @escaping @MainActor (T) -> Void
    ) -> Task<Void, Never> {
        Task { [weak self] in
            do {
                for try await value in stream { apply(value) }
            } catch {
                self?.report(error)
            }
        }
    }

    /// Cancellation is not a failure: every day change cancels four streams.
    private func report(_ error: any Error) {
        if error is CancellationError { return }
        failure = "That change could not be saved on this device."
    }

    // MARK: - The target

    /// The day's override as the domain sees it, or `nil`.
    var dayTarget: DailyTarget? {
        guard let r = dailyTarget else { return nil }
        return DailyTarget(
            date: r.date, kcal: r.kcal.map(Double.init), proteinG: r.proteinG.map(Double.init),
            carbsG: r.carbsG.map(Double.init), fatG: r.fatG.map(Double.init),
            stepsGoal: r.stepsGoal.map(Double.init), note: r.note, profileKey: r.profileKey,
            trackCarbs: r.trackCarbs, trackFat: r.trackFat
        )
    }

    var hasOverride: Bool { DailyTargets.hasTarget(dayTarget) }
    var tracksCarbs: Bool { DailyTargets.tracksCarbs(dayTarget) }
    var tracksFat: Bool { DailyTargets.tracksFat(dayTarget) }

    /// The user's own five numbers, before any rung. Same shape as the You tab.
    var ownGoals: LeverGoals {
        LeverGoals(
            calorie: Double(goals?.calorieGoal ?? 0),
            protein: goals?.proteinGoalG.map(Double.init),
            carbs: goals?.carbsGoalG.map(Double.init),
            fat: goals?.fatGoalG.map(Double.init),
            steps: goals?.stepsGoal.map(Double.init)
        )
    }

    /// The rung in force on the SELECTED date.
    var leverInForce: LeverId? {
        Levers.leverForDate(date, stored: goals?.activeLever, today: today, releaseEndsOn: goals?.maintenanceUntil)
    }

    /// Non-nil when a rung holds the numbers; `custom` and no selection are nil.
    var heldBy: NutritionLever? { Levers.lever(byId: leverInForce?.rawValue) }

    /// The rung's (or pinned history's) numbers for the date, before the override.
    var rungGoals: LeverGoals {
        Levers.goalsForDate(
            date, stored: goals?.activeLever, today: today,
            fallback: ownGoals, releaseEndsOn: goals?.maintenanceUntil
        )
    }

    /// What the day is graded against. Untracked macros resolve to `nil`.
    var target: LeverGoals { DailyTargets.apply(rungGoals, dayTarget) }

    /// A zero calorie goal is an unset row, not a fast.
    var targetKcal: Double? { target.calorie > 0 ? target.calorie : nil }

    /// The user's saved profiles first, then the built-ins they have not
    /// replaced. A stored row missing its two required figures is skipped
    /// rather than shown as a 0 kcal day.
    var profiles: [TargetProfile] {
        var out: [TargetProfile] = profileRows.compactMap { r in
            guard let kcal = r.kcal, let protein = r.proteinG else { return nil }
            return TargetProfile(
                key: r.key, label: r.label, summary: r.summary ?? "", sort: r.sort,
                kcal: Double(kcal), proteinG: Double(protein),
                carbsG: r.carbsG.map(Double.init), fatG: r.fatG.map(Double.init),
                stepsGoal: r.stepsGoal.map(Double.init)
            )
        }
        let known = Set(out.map(\.key))
        out += TargetProfiles.builtin.filter { !known.contains($0.key) }
        return out
    }

    /// The profile the day's figures actually MATCH — not the stamp.
    var matchedProfile: TargetProfile? {
        profiles.first { TargetProfiles.matches(dayTarget, $0) }
    }

    /// Where the target came from, in one line.
    var provenance: String {
        if hasOverride {
            if let matched = matchedProfile { return "Day override · \(matched.label)" }
            if let stamped = TargetProfiles.byKey(profiles, dailyTarget?.profileKey) {
                return "Day override · \(stamped.label), edited"
            }
            return "Day override · Custom"
        }
        if let held = heldBy { return "\(held.label) · held by rung" }
        return "My own numbers"
    }

    // MARK: - Eaten

    struct Eaten: Equatable {
        var kcal = 0.0, protein = 0.0, carbs = 0.0, fat = 0.0
    }

    /// Summed over the day's rows. `nil` when nothing is logged — never a zero.
    var eaten: Eaten? {
        guard let entries, !entries.isEmpty else { return nil }
        return entries.reduce(into: Eaten()) { sum, row in
            sum.kcal += row.calories
            sum.protein += row.proteinG
            sum.carbs += row.carbsG
            sum.fat += row.fatG
        }
    }

    // MARK: - Flags

    var exceptionReason: String? { ExceptionDay.reason(dailyLog?.nutritionException) }
    var isEstimated: Bool { dailyLog?.nutritionEstimated ?? false }

    // MARK: - Water

    /// `daily_logs.water_ml`. Zero or less reads as untracked, which is what
    /// the scorer does with it.
    var waterMl: Double? {
        guard let ml = dailyLog?.waterMl, ml > 0 else { return nil }
        return ml
    }
    var waterGoalMl: Double? { goals?.waterGoalMl.map(Double.init) }
    var isWaterManual: Bool { water.contains { ManualEntry.isManualWater($0.hkUuid) } }

    // MARK: - Writing

    /// One failure path for every write. The stream confirms a hop later; the
    /// callers patch the published value first where a snap-back would show.
    @discardableResult
    private func write<T>(_ save: () throws -> T) -> T? {
        do {
            let value = try save()
            failure = nil
            return value
        } catch {
            report(error)
            return nil
        }
    }

    /// The phase to stamp on a hand-entered row — the same resolution the
    /// HealthKit ingest performs, so a flagged day keeps the block's phase.
    func setManualMacros(kcal: Double, protein: Double, carbs: Double, fat: Double) {
        let phase = NutritionPhase.resolve(.init(
            calories: kcal,
            exception: dailyLog?.nutritionException,
            estimated: dailyLog?.nutritionEstimated,
            activePhase: goals?.goalPreset.flatMap(NutritionPhase.init(rawValue:))
        ))?.rawValue
        write {
            try database.setManualMacros(
                userId: userId, date: date,
                calories: kcal, proteinG: protein, carbsG: carbs, fatG: fat, phase: phase
            )
        }
    }

    /// `nil` un-marks the day; the column is named in `clearing` so the server
    /// clears it too rather than keeping "Event".
    func setException(_ reason: String?) {
        let value = ExceptionDay.reason(reason)
        let row = write {
            try database.editDailyLog(
                userId: userId, date: date, clearing: value == nil ? ["nutrition_exception"] : []
            ) { $0.nutritionException = value }
        }
        if let row { dailyLog = row }
    }

    func setEstimated(_ on: Bool) {
        let row = write {
            try database.editDailyLog(userId: userId, date: date) { $0.nutritionEstimated = on }
        }
        if let row { dailyLog = row }
    }

    /// Blank fields stay blank — "no opinion, ask the rung". An empty draft is
    /// a cleared override, not an all-nil row.
    func saveDailyTarget(
        kcal: Double?, protein: Double?, carbs: Double?, fat: Double?, steps: Double?,
        trackCarbs: Bool, trackFat: Bool, note: String?, profileKey: String?
    ) {
        let trimmedNote = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let change: @Sendable (inout DailyTargetRow) -> Void = { row in
            row.kcal = kcal.map { Int($0.rounded()) }
            row.proteinG = protein.map { Int($0.rounded()) }
            row.carbsG = carbs.map { Int($0.rounded()) }
            row.fatG = fat.map { Int($0.rounded()) }
            row.stepsGoal = steps.map { Int($0.rounded()) }
            row.trackCarbs = trackCarbs
            row.trackFat = trackFat
            row.note = trimmedNote?.isEmpty == false ? trimmedNote : nil
            row.profileKey = profileKey
        }
        var local = dailyTarget ?? DailyTargetRow(userId: userId, date: date, updatedAt: Date(), trackCarbs: true, trackFat: true)
        change(&local)
        guard DailyTargets.hasTarget(dayTargetFrom(local)) else {
            clearDailyTarget()
            return
        }
        dailyTarget = local
        write { try database.setDailyTarget(userId: userId, date: date, change) }
    }

    func clearDailyTarget() {
        dailyTarget = nil
        write { try database.clearDailyTarget(userId: userId, date: date) }
    }

    private func dayTargetFrom(_ r: DailyTargetRow) -> DailyTarget {
        DailyTarget(
            date: r.date, kcal: r.kcal.map(Double.init), proteinG: r.proteinG.map(Double.init),
            carbsG: r.carbsG.map(Double.init), fatG: r.fatG.map(Double.init),
            stepsGoal: r.stepsGoal.map(Double.init), note: r.note, profileKey: r.profileKey,
            trackCarbs: r.trackCarbs, trackFat: r.trackFat
        )
    }

    /// Below `minWaterMl` the day would score as untracked rather than as a
    /// low day, so that is the floor — the honest way to blank a day is
    /// `clearWater`.
    static let minWaterMl: Double = 100

    func setWater(ml: Double) {
        let amount = max(Self.minWaterMl, ml.rounded())
        dailyLog?.waterMl = amount
        write { try database.setWaterOverride(userId: userId, date: date, ml: amount) }
    }

    func clearWater() {
        dailyLog?.waterMl = nil
        write { try database.clearWaterOverride(userId: userId, date: date) }
    }
}

// MARK: - Formatting

enum FuelFormat {
    /// `1,420` — grouped, no decimals. Every kcal and gram figure on the tab.
    static func whole(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0)))
    }

    /// `1.8` — litres to one decimal, which is the precision of the thing.
    static func litres(_ ml: Double) -> String {
        (ml / 1000).formatted(.number.precision(.fractionLength(1)))
    }

    /// `Thu 3 Sep`, in the device's locale.
    static func dayTitle(_ iso: String) -> String {
        guard let date = LogicalDay.date(fromISO: iso) else { return iso }
        return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }
}
