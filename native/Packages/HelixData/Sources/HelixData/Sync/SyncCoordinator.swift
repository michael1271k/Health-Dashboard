import Foundation
import Supabase

/// Why a sync is running. Not decoration: the coordinator coalesces on it, the
/// ledger records it, and `.pull` is the only one a person is watching.
public enum SyncReason: Hashable, Sendable {
    case launch
    case foreground
    case pull
    case realtime(table: String)
    case healthKit

    var isRealtime: Bool {
        if case .realtime = self { return true }
        return false
    }

    var ledgerName: String {
        switch self {
        case .launch: return "launch"
        case .foreground: return "foreground"
        case .pull: return "pull"
        case .realtime(let table): return "realtime:\(table)"
        case .healthKit: return "healthKit"
        }
    }
}

/// Where a running sync is.
public enum SyncStep: String, Sendable, Equatable {
    case push, health, pull, score
}

public struct SyncProgress: Sendable, Equatable {
    public var reason: SyncReason
    public var step: SyncStep
}

public enum SyncState: Sendable, Equatable {
    case idle
    case running(SyncProgress)
    case failed(String)
}

public enum SyncCoordinatorError: Error, Equatable, CustomStringConvertible {
    /// Every step ran, but these tables did not land. Thrown AFTER the score
    /// and the closing drain, so one table a migration has not reached costs
    /// the sync its green light and nothing else.
    case tablesFailed([String: String])

    public var description: String {
        switch self {
        case .tablesFailed(let failures):
            return "Sync failed for \(failures.keys.sorted().joined(separator: ", "))."
        }
    }
}

/// The one object that runs a sync, in order, once at a time.
///
/// ── THE ORDER, AND THE ONE PLACE IT DEPARTS FROM §7.1 ───────────────────────
/// `resetInFlight` → HealthKit → `drain` → pull → score → `drain`.
///
/// §7.1 writes the HealthKit read AFTER the first drain. It cannot go there:
/// `saveMirrorRows` is a blind upsert, so a pull that follows a local write and
/// precedes its push overwrites the write with the server's older row — and the
/// outbox item, which reads the row at drain time, then pushes the server's own
/// value back at it. Today's steps would vanish on every sync. Reading Apple
/// first and pushing second keeps §7.1's actual rule — a pull never overwrites
/// a local edit — for the health rows too.
///
/// The second drain is for what the sync itself wrote: two `daily_scores`
/// rows. An empty queue costs one SQLite read.
///
/// ── COALESCING ──────────────────────────────────────────────────────────────
/// A call while one is running is queued ONCE; a third call joins the queued
/// one. Every caller awaits the run that will include its request, so
/// `.refreshable` holds its spinner for exactly as long as the truth takes.
///
/// ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
/// It does not touch WidgetKit — this package compiles for macOS, and the app
/// already reloads timelines from `AppDatabase.onCommit`. It does not present
/// anything. It does not know about the backfill sheet; 2.3 puts that inside.
public actor SyncCoordinator: MirrorRefreshing {

    private let database: AppDatabase
    private let engine: SyncEngine
    private let puller: MirrorPuller
    private let training: TrainingPuller
    private let health: HealthSync?
    private let userId: String
    private let calendar: Calendar
    private let now: @Sendable () -> Date

    public private(set) var state: SyncState = .idle

    private var current: Task<Void, any Error>?
    private var queued: Task<Void, any Error>?
    /// Whether `current` has begun its steps. Between one run's handover and
    /// the next run's first line there is a hop back onto the actor; a caller
    /// arriving in that gap can still join the promoted task instead of
    /// queueing a third run behind it.
    private var started = false
    private var realtime: MirrorRealtime?
    private var coalescer: MirrorCoalescer?
    /// Set by `stop()`. A launch sync that finishes after sign-out must not
    /// open a socket nobody will close.
    private var stopped = false

    /// The pieces, injected. What the tests build.
    public init(
        database: AppDatabase,
        engine: SyncEngine,
        puller: MirrorPuller,
        training: TrainingPuller,
        health: HealthSync? = nil,
        userId: String,
        calendar: Calendar = .current,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.database = database
        self.engine = engine
        self.puller = puller
        self.training = training
        self.health = health
        self.userId = userId
        self.calendar = calendar
        self.now = now
    }

    /// The production wiring, over one Supabase client. `windowDays: nil` —
    /// the cap is gone (decision 7).
    public init(database: AppDatabase, client: SupabaseClient, userId: String, health: HealthSync? = nil) {
        let mirror = PostgRESTMirrorRemote(client: client, userId: userId)
        self.init(
            database: database,
            engine: SyncEngine(database: database, remote: PostgRESTRemote(client: client, userId: userId), rows: mirror),
            puller: MirrorPuller(database: database, remote: mirror, userId: userId, windowDays: nil),
            training: TrainingPuller(database: database, remote: mirror, userId: userId, windowDays: nil),
            health: health,
            userId: userId
        )
    }

    // MARK: - Running

    /// One full sync. Awaits the run that includes this request.
    public func syncNow(reason: SyncReason) async throws {
        let task: Task<Void, any Error>
        if let running = current {
            if let waiting = queued ?? (started ? nil : running) {
                task = waiting
            } else {
                let t = Task {
                    _ = await running.result
                    try await self.run(reason)
                }
                queued = t
                task = t
            }
        } else {
            let t = Task { try await self.run(reason) }
            current = t
            task = t
        }
        try await task.value
    }

    private func run(_ reason: SyncReason) async throws {
        // The task that finishes hands over to the one waiting, if any. A
        // queued task was created holding `current`'s result, so by the time
        // it reaches here this line has already made it `current`.
        started = true
        defer {
            current = queued
            queued = nil
            started = false
        }
        do {
            try await steps(reason)
            state = .idle
        } catch {
            state = .failed(String(describing: error))
            throw error
        }
    }

    private func steps(_ reason: SyncReason) async throws {
        let now = now()
        state = .running(SyncProgress(reason: reason, step: .push))
        try database.resetInFlight()

        // Not for a realtime note: the socket said a row moved on the server,
        // and reading Apple again for that is a HealthKit round trip per
        // notification. Foreground and pull still read it.
        if let health, !reason.isRealtime {
            state = .running(SyncProgress(reason: reason, step: .health))
            // Silent, like the app's own read was: a withheld permission and a
            // device without Health data both render as "—" downstream, and
            // neither is a reason to fail the push that follows.
            if (try? await health.requestAuthorization()) == true {
                _ = try? await health.syncRecent(now: now, calendar: calendar)
            }
        }

        state = .running(SyncProgress(reason: reason, step: .push))
        try await drainAll(now: now)

        state = .running(SyncProgress(reason: reason, step: .pull))
        var report = await puller.refresh(now: now)
        do {
            let trained = try await training.refresh(now: now)
            report.rows += trained.rows
            report.tables += trained.tables
            report.rowsByTable.merge(trained.rowsByTable) { _, new in new }
        } catch {
            report.failures["workout_sessions"] = String(describing: error)
        }
        try record(report, reason: reason, at: now)

        state = .running(SyncProgress(reason: reason, step: .score))
        try scoreRecentDays(now: now)
        try await drainAll(now: now)

        if !report.failures.isEmpty { throw SyncCoordinatorError.tablesFailed(report.failures) }
    }

    /// Drain until the queue is empty or the backoff is holding the rest.
    /// Bounded: `hasMore` is also what a concurrent drain answers, and a loop
    /// that trusted it forever would spin on another engine's work.
    private func drainAll(now: Date) async throws {
        var pushed = 0
        for _ in 0..<20 {
            let report = try await engine.drain(now: now)
            pushed += report.pushed
            if !report.hasMore || report.pushed == 0 { break }
        }
        try database.recordSync(userId: userId, table: "outbox", rows: pushed, reason: "push", at: now)
    }

    private func record(_ report: MirrorReport, reason: SyncReason, at now: Date) throws {
        for (table, rows) in report.rowsByTable.sorted(by: { $0.key < $1.key }) {
            try database.recordSync(userId: userId, table: table, rows: rows, reason: reason.ledgerName, at: now)
        }
    }

    /// Today live, yesterday sealed — the production caller `writeDailyScore`
    /// was waiting for. A day the freeze refuses is a `nil`, not an error.
    private func scoreRecentDays(now: Date) throws {
        let today = LogicalDayISO.string(now, calendar: calendar)
        _ = try database.refreshDailyScore(userId: userId, date: today, now: now, calendar: calendar)
        _ = try database.refreshDailyScore(
            userId: userId, date: NightWindow.previousDay(today), now: now, calendar: calendar
        )
    }

    // MARK: - Realtime

    /// A change notification.
    ///
    /// ── THROUGH THE QUEUE, NOT AROUND IT ────────────────────────────────────
    /// The obvious shape — pull just that table — is the one path that breaks
    /// the rule at the top of this file: a blind pull with no drain in front of
    /// it overwrites a local edit still waiting in the outbox, and the drainer
    /// then pushes the server's stale copy back. Draining first inside this
    /// method does not help either, because `SyncEngine.drain` yields to a
    /// drain already running and answers `hasMore` without pushing anything.
    /// So a note is a sync, coalesced like any other; the delta cursors keep
    /// the cost of the twenty-six pulls small, and the coalescer has already
    /// folded a burst into one call.
    public func refresh(table: String?) async {
        try? await syncNow(reason: .realtime(table: table ?? "workout_sessions"))
    }

    /// Open the socket. Once; a second call is a no-op.
    public func startRealtime(client: SupabaseClient) async {
        guard realtime == nil, !stopped else { return }
        let coalescer = MirrorCoalescer(refresher: self)
        let realtime = MirrorRealtime(client: client, coalescer: coalescer)
        self.coalescer = coalescer
        self.realtime = realtime
        await realtime.start()
    }

    /// Close the socket and abandon the run. Sign-out calls this before
    /// dropping the coordinator: a step still awaiting the network would
    /// otherwise finish and write the previous user's rows.
    public func stop() async {
        stopped = true
        current?.cancel()
        queued?.cancel()
        await realtime?.stop()
        realtime = nil
        coalescer = nil
    }

    // MARK: - Reading

    /// Table → when it last synced. What Settings' Sync Status section draws.
    public func lastSync() throws -> [String: Date] {
        try database.lastSync(userId: userId)
    }
}
