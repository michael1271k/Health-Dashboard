import Foundation
import GRDB
import Observation
import HelixCore

// ─────────────────────────────────────────────────────────────────────────────
// The target resolver — one live answer to "what is this date graded against".
//
// Phase 2 §6.2. The chain itself is `Targets.resolve` in HelixCore; this file
// is the store side of it: the rows it reads, translated once, and ONE
// `ValueObservation` over all of them so a lever pulled in Settings is one
// outbox row and one tick, with no view holding a cached copy to go stale.
// ─────────────────────────────────────────────────────────────────────────────

public extension DailyTarget {
    /// The day's override as the domain sees it. Column names match on the
    /// wire; the row's `Int`s become the domain's `Double`s.
    init(_ r: DailyTargetRow) {
        self.init(
            date: r.date, kcal: r.kcal.map(Double.init), proteinG: r.proteinG.map(Double.init),
            carbsG: r.carbsG.map(Double.init), fatG: r.fatG.map(Double.init), stepsGoal: r.stepsGoal.map(Double.init),
            note: r.note, profileKey: r.profileKey, trackCarbs: r.trackCarbs, trackFat: r.trackFat
        )
    }
}

public extension TargetProfile {
    /// A stored profile missing its two required figures is skipped rather
    /// than shown as a 0 kcal day.
    init?(_ r: TargetProfileRow) {
        guard let kcal = r.kcal, let protein = r.proteinG else { return nil }
        self.init(
            key: r.key, label: r.label, summary: r.summary ?? "", sort: r.sort,
            kcal: Double(kcal), proteinG: Double(protein),
            carbsG: r.carbsG.map(Double.init), fatG: r.fatG.map(Double.init), stepsGoal: r.stepsGoal.map(Double.init)
        )
    }
}

public extension TargetSources {
    /// The sources a `user_goals` row supplies, with a day override chosen by
    /// the caller — the Nutrition tab hands in the row it is editing so a save
    /// never snaps back for the one hop the observation takes.
    init(goals: UserGoalRow?, dayTarget: DailyTarget?, profiles: [TargetProfile]) {
        self.init(
            own: LeverGoals(
                calorie: Double(goals?.calorieGoal ?? 0),
                protein: goals?.proteinGoalG.map(Double.init),
                carbs: goals?.carbsGoalG.map(Double.init),
                fat: goals?.fatGoalG.map(Double.init),
                steps: goals?.stepsGoal.map(Double.init)
            ),
            waterMl: goals?.waterGoalMl.map(Double.init),
            sleepHours: goals?.sleepGoalHours,
            activeLever: goals?.activeLever,
            maintenanceUntil: goals?.maintenanceUntil,
            dayTarget: dayTarget,
            profiles: profiles
        )
    }
}

/// Every row the chain reads, as of one commit.
///
/// Small on purpose: `daily_targets` is a handful of rows per user (a day is
/// only in it when it was given a shape), profiles are two or three, and the
/// goals row is one. Reading all of them in one tracked region means the
/// snapshot answers for ANY date without a second query, and one write to any
/// of the four tables is one tick.
public struct TargetSnapshot: Sendable, Equatable {
    public var goals: UserGoalRow?
    /// Keyed by date.
    public var dailyTargets: [String: DailyTargetRow]
    public var profiles: [TargetProfileRow]
    /// `schedule_overrides`, date → day key. Observed alongside the targets so
    /// a swap and a lever tick the same readers; `Targets` itself has no plan
    /// in it.
    public var overrides: [String: String]

    public init(
        goals: UserGoalRow? = nil, dailyTargets: [String: DailyTargetRow] = [:],
        profiles: [TargetProfileRow] = [], overrides: [String: String] = [:]
    ) {
        self.goals = goals
        self.dailyTargets = dailyTargets
        self.profiles = profiles
        self.overrides = overrides
    }

    /// The user's stored profiles, translated; `Targets.profiles(stored:)`
    /// fills the built-ins in behind them.
    public var storedProfiles: [TargetProfile] { profiles.compactMap(TargetProfile.init) }

    /// The date's override, or nil.
    public func dayTarget(for date: String) -> DailyTarget? { dailyTargets[date].map(DailyTarget.init) }

    /// Sources with a caller-chosen day override (see `TargetSources.init`).
    public func sources(dayTarget: DailyTarget?) -> TargetSources {
        TargetSources(goals: goals, dayTarget: dayTarget, profiles: storedProfiles)
    }

    public func sources(for date: String) -> TargetSources { sources(dayTarget: dayTarget(for: date)) }

    public func targets(for date: String, today: String) -> ResolvedTargets {
        Targets.resolve(sources(for: date), date: date, today: today)
    }

    /// `Preferences.weekStartDay`, off the same row.
    public var weekStartDay: Int { Week.startDay(fromEndDay: goals?.weekEndDay) }
}

public extension AppDatabase {
    /// The four tables, in one tracked read.
    func targetSnapshot(userId: String) throws -> TargetSnapshot {
        try writer.read { db in try Self.targetSnapshot(db, userId: userId) }
    }

    /// A live sequence of them — one yield per commit that touched any of the
    /// four, starting with the current state.
    func targetSnapshotStream(userId: String) -> AsyncThrowingStream<TargetSnapshot, any Error> {
        stream(ValueObservation.tracking { db in try Self.targetSnapshot(db, userId: userId) })
    }

    private static func targetSnapshot(_ db: Database, userId: String) throws -> TargetSnapshot {
        let user = Column("user_id") == userId
        var targets: [String: DailyTargetRow] = [:]
        for r in try DailyTargetRow.filter(user).fetchAll(db) { targets[r.date] = r }
        var overrides: [String: String] = [:]
        for r in try ScheduleOverrideRow.filter(user).fetchAll(db) { overrides[r.date] = r.dayKey }
        return TargetSnapshot(
            goals: try UserGoalRow.filter(user).fetchOne(db),
            dailyTargets: targets,
            profiles: try TargetProfileRow.filter(user).order(Column("sort")).fetchAll(db),
            overrides: overrides
        )
    }
}

/// The one instance `AppEnvironment` holds. Views call `targets(for:today:)`
/// inside `body`; `@Observable` records the read of `snapshot`, and the next
/// commit to any of the four tables invalidates exactly those views.
///
/// `@MainActor` because the snapshot is a published value and SwiftUI reads
/// it on the main actor; the observation itself runs on GRDB's queue and hops
/// here to publish.
@MainActor
@Observable
public final class TargetResolver {
    public private(set) var snapshot = TargetSnapshot()
    /// The observation failed. Rare — an in-process SQLite read — but a
    /// resolver that silently stopped ticking would leave every gauge stale
    /// under no banner at all.
    public private(set) var failure: String?

    @ObservationIgnored private let database: AppDatabase
    @ObservationIgnored public let userId: String
    @ObservationIgnored private var task: Task<Void, Never>?

    public init(database: AppDatabase, userId: String) {
        self.database = database
        self.userId = userId
    }

    /// Subscribe. A second call is a no-op; `stop` ends it.
    ///
    /// The first snapshot is read HERE, synchronously, so a view built in the
    /// same turn never draws the empty state: a resolver with no goals row
    /// answers with the schedule's rung, which for one frame would show the
    /// maintenance week to someone on Lever 1. The stream then re-yields it.
    public func start() {
        guard task == nil else { return }
        if let first = try? database.targetSnapshot(userId: userId) { snapshot = first }
        task = Task { [weak self, database, userId] in
            do {
                for try await snapshot in database.targetSnapshotStream(userId: userId) {
                    guard let self else { return }
                    // `@Observable` notifies on every set; a pull that re-upserts
                    // identical rows must not repaint every gauge.
                    if self.snapshot != snapshot { self.snapshot = snapshot }
                }
            } catch {
                if !(error is CancellationError) { self?.failure = String(describing: error) }
            }
        }
    }

    public func stop() {
        task?.cancel()
        task = nil
    }

    /// A resolver dropped without `stop()` would otherwise keep its
    /// observation alive until the next commit to one of the four tables.
    deinit { task?.cancel() }

    public func targets(for date: String, today: String) -> ResolvedTargets {
        snapshot.targets(for: date, today: today)
    }

    /// The week containing `date`, cut on the athlete's own start day.
    public func weekWindow(containing date: String, today: String) -> WeekWindow {
        WeekWindow(containing: date, startDay: snapshot.weekStartDay, today: today)
    }
}
