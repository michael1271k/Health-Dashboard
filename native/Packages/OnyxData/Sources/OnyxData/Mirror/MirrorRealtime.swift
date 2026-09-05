import Foundation
import Supabase

/// What a realtime notification turns into: a re-pull of exactly what changed.
///
/// ── THE WHOLE `TABLE_KEYS` MAP EVAPORATES ───────────────────────────────────
/// The web app carried a hand-maintained dictionary of table → the eight or ten
/// react-query keys that table feeds, because a change had to be translated
/// into every cache entry that might be holding a stale copy. It was wrong
/// twice in ways the file's own comments record: `['daily_scores']` sat in seven
/// lists and matched no query at all, and `schedule_overrides` was missing
/// entirely, which is half of why a rest-day swap on the phone never reached
/// the desktop.
///
/// None of that exists here. A pull writes a row; `ValueObservation` sees the
/// write and pushes it into whatever is drawing. There is no key to match, no
/// list to maintain, and no way for the view and the store to disagree — so the
/// only thing realtime has to decide is WHICH TABLE to re-read.
public protocol MirrorRefreshing: Sendable {
    /// Re-read one table. `nil` means the training trio, which is pulled as a
    /// unit because its three tables are one fact.
    func refresh(table: String?) async
}

/// Turns a burst of change notifications into as few pulls as possible.
///
/// Separated from the socket because this is the only part with a decision in
/// it. Wiring a channel up is verified by the compiler; coalescing is verified
/// by a test, and it is the thing that decides whether finishing a workout on
/// the watch costs the phone one round trip or thirty.
public actor MirrorCoalescer {

    /// The web app settled on 400 ms after watching a session commit arrive as
    /// a session row plus thirty set rows: without a window, that is thirty-one
    /// notifications and thirty-one refetches for one logical event.
    public static let window: Duration = .milliseconds(400)

    private let refresher: any MirrorRefreshing
    private let window: Duration
    private var pending: Set<String> = []
    private var flush: Task<Void, Never>?

    public init(refresher: any MirrorRefreshing, window: Duration = MirrorCoalescer.window) {
        self.refresher = refresher
        self.window = window
    }

    /// A table changed somewhere else.
    public func note(_ table: String) {
        pending.insert(table)
        flush?.cancel()
        flush = Task { [window] in
            try? await Task.sleep(for: window)
            guard !Task.isCancelled else { return }
            await self.drain()
        }
    }

    /// Pull everything noted since the last flush.
    ///
    /// Public so a foreground can force it: coming back to the app should not
    /// wait out a debounce window that a suspended socket may never close.
    public func drain() async {
        let tables = pending
        pending.removeAll()
        guard !tables.isEmpty else { return }

        // The training trio collapses to one refresh. A set edit bumps its
        // session's `updated_at` through the same trigger, so pulling sessions
        // by cursor is what finds it — asking for `workout_sets` on its own
        // would be a query with no cursor to use.
        var wantsTraining = false
        for table in tables {
            if MirrorRealtime.trainingTables.contains(table) { wantsTraining = true } else {
                await refresher.refresh(table: table)
            }
        }
        if wantsTraining { await refresher.refresh(table: nil) }
    }

    /// Drop what is waiting and the timer that would flush it. Sign-out: a
    /// debounced refresh must not fire into a coordinator that is gone.
    public func stop() {
        flush?.cancel()
        flush = nil
        pending.removeAll()
    }

    /// Test seam: what is waiting.
    public var noted: Set<String> { pending }
}

/// The Supabase channel, and the lifecycle around it.
///
/// ── WHAT IS NOT PORTED, AND WHY ─────────────────────────────────────────────
/// The web provider carried a retry loop with exponential backoff, a
/// `socketHealthy` flag, a `joinedOnce` flag, a `visibilitychange` listener and
/// an `online` listener — roughly half the file — because a backgrounded PWA's
/// WebSocket is suspended by iOS and may never silently rejoin. `RealtimeClientV2`
/// reconnects itself, and a native app gets real lifecycle callbacks instead of
/// guessing from `document.visibilityState`. So what is left is: subscribe,
/// forward, and re-pull on foreground.
///
/// The `requestIdleCallback` deferral does not port either. It existed because
/// opening a socket before first paint delayed first paint; a SwiftUI app starts
/// this from a `.task`, which is already after the first frame.
public actor MirrorRealtime {

    /// The three tables `TrainingPuller` owns. Named here rather than in the
    /// generated catalogue because the catalogue deliberately excludes them.
    public static let trainingTables: Set<String> = ["workout_sessions", "workout_sets", "exercises"]

    /// Everything worth listening to: the generated catalogue plus the trio.
    ///
    /// Derived rather than curated. The web app's list was hand-maintained and
    /// `schedule_overrides` fell off it, so a day swap made on the phone never
    /// reached the laptop until someone reloaded.
    public static var tables: [String] {
        MirrorCatalogue.tables.map(\.name) + trainingTables.sorted()
    }

    private let client: SupabaseClient
    private let coalescer: MirrorCoalescer
    private var channel: RealtimeChannelV2?
    private var listeners: [Task<Void, Never>] = []

    public init(client: SupabaseClient, coalescer: MirrorCoalescer) {
        self.client = client
        self.coalescer = coalescer
    }

    /// Open the socket and start forwarding.
    public func start() async {
        guard channel == nil else { return }
        let channel = client.channel("onyx-mirror")
        self.channel = channel

        // One binding per table, each its own stream. The streams are created
        // BEFORE `subscribe()`: a binding added after the join is not part of
        // the subscription the server acknowledged, and silently receives
        // nothing — which looks exactly like "nothing has changed".
        for table in Self.tables {
            let changes = channel.postgresChange(AnyAction.self, schema: "public", table: table)
            listeners.append(Task { [coalescer] in
                for await _ in changes {
                    // The payload is deliberately ignored. It carries the row,
                    // but trusting it would make the socket a second write path
                    // with its own decoding and its own bugs; re-reading through
                    // the puller means there is exactly one way a server row
                    // becomes a local row.
                    await coalescer.note(table)
                }
            })
        }
        await channel.subscribe()
    }

    /// Close it. Cancels every listener first, so nothing is delivered into a
    /// channel that is going away.
    public func stop() async {
        for task in listeners { task.cancel() }
        listeners.removeAll()
        await coalescer.stop()
        if let channel {
            await client.removeChannel(channel)
            self.channel = nil
        }
    }

    /// Foregrounding.
    ///
    /// A suspended socket misses events without reporting anything, so returning
    /// to the app is the one moment a full catch-up is worth its cost. Cheap
    /// here in a way it was not on the web: a delta pull asks for what changed
    /// since a cursor, so "catch up on everything" is twenty-six small queries
    /// that mostly return nothing, rather than a refetch of the world.
    ///
    /// It notes every table and drains immediately — the debounce exists to
    /// coalesce a burst, and there is no burst to wait for here.
    public func foreground() async {
        for table in Self.tables { await coalescer.note(table) }
        await coalescer.drain()
    }
}

/// The two pullers behind one `MirrorRefreshing`.
///
/// This is the whole wiring: a table name from the socket becomes a pull, and
/// `nil` becomes the training trio. Everything else — cursors, strategies,
/// windows — is already decided by the catalogue.
public struct MirrorSync: MirrorRefreshing {

    private let puller: MirrorPuller
    private let training: TrainingPuller

    public init(puller: MirrorPuller, training: TrainingPuller) {
        self.puller = puller
        self.training = training
    }

    public func refresh(table: String?) async {
        guard let table else {
            _ = try? await training.refresh()
            return
        }
        guard let entry = MirrorCatalogue.byName[table] else { return }
        _ = try? await puller.refresh(entry)
    }

    /// Everything, once. The first sync after sign-in, and the manual
    /// pull-to-refresh.
    ///
    /// Failures are inside the report, not thrown: one table that a migration
    /// has not reached must not stop the other twenty-five, and a partial mirror
    /// is a working app with one stale screen rather than a blank one.
    @discardableResult
    public func refreshAll() async -> MirrorReport {
        var report = await puller.refresh()
        do {
            let training = try await self.training.refresh()
            report.tables += training.tables
            report.rows += training.rows
        } catch {
            report.failures["workout_sessions"] = String(describing: error)
        }
        return report
    }
}
