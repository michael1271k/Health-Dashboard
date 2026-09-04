import Foundation
import Observation
import Supabase
import WidgetKit
import HelixCore
import HelixData

/// Everything the app needs, resolved once at launch.
///
/// ── WHY THIS IS ONE OBJECT AND NOT A PILE OF SINGLETONS ─────────────────────
/// The web app's equivalent state is spread across a react-query client, a
/// Supabase client module, 24 `localStorage` keys and four provider components,
/// and the recurring bug class there is two of them disagreeing — a cache that
/// says signed-in while the session is gone, a schedule store read during render
/// that React cannot see. One owned object with one source of truth for each
/// fact removes that class rather than managing it.
@MainActor
@Observable
public final class AppEnvironment {

    public enum AuthState: Equatable {
        /// Reading the Keychain. Sub-millisecond, but it is a real state and
        /// pretending otherwise is what produces a flash of the wrong screen.
        case resolving
        case signedIn(userID: UUID)
        case signedOut
    }

    public private(set) var auth: AuthState = .resolving
    /// A launch failure worth showing rather than crashing on — a missing
    /// `Secrets.xcconfig` is the overwhelmingly likely cause and the message
    /// says so.
    public private(set) var startupError: String?

    public let database: AppDatabase
    public let supabase: SupabaseClient

    /// What Today's hairline and "Synced 2s ago" caption read. Owned here
    /// because every tab will report the same sync, and two of them holding
    /// their own idea of when it last ran is the disagreement this class exists
    /// to prevent.
    let sync = SyncStatus()

    /// The whole sync — `HelixData`'s `SyncCoordinator`, one per signed-in
    /// user. It owns the HealthKit read, the outbox drain, the pulls, the
    /// score and the realtime socket, in that order. Nil while signed out.
    var coordinator: SyncCoordinator?

    private var authTask: Task<Void, Never>?
    /// The commit observer, held for the life of the app (GRDB stops observing
    /// when it is deallocated). Untyped so the app target need not import GRDB.
    private var commitObserver: AnyObject?
    private var widgetReload: Task<Void, Never>?

    public init(database: AppDatabase, supabase: SupabaseClient) {
        self.database = database
        self.supabase = supabase
    }

    /// Build the real environment. Throws only for a configuration problem the
    /// user can fix.
    public static func live() throws -> AppEnvironment {
        let config = try SupabaseConfig.fromBundle()
        return AppEnvironment(
            database: try AppDatabase.onDisk(folderURL: AppDatabase.sharedFolder()),
            supabase: HelixSupabase.makeClient(config: config)
        )
    }

    /// Resolve the persisted session, then follow auth changes for the life of
    /// the app.
    ///
    /// The stream is the only writer of `auth`. Sign-in and sign-out below do
    /// not set it themselves — they perform the action and let the stream report
    /// what actually happened, so the UI can never show a state the auth client
    /// disagrees with.
    public func start() {
        guard authTask == nil else { return }
        // Every local write — a set, a day edit, a mirror pull — reloads the
        // widgets, debounced: a pull commits per table and a session logs a
        // set every minute, and each reload is a full snapshot build.
        commitObserver = database.onCommit { [weak self] in
            Task { @MainActor in self?.scheduleWidgetReload() }
        }
        authTask = Task { [weak self] in
            guard let self else { return }
            for await (event, session) in self.supabase.auth.authStateChanges {
                guard event != .initialSession || session != nil else {
                    self.auth = .signedOut
                    continue
                }
                self.auth = session.map { .signedIn(userID: $0.user.id) } ?? .signedOut
                if case .signedIn(let userID) = self.auth { self.startSync(userID: userID) }
            }
        }
    }

    /// Every foreground, and the first resolved sign-in. Cheap when there is
    /// nothing new: HealthKit answers an already-granted authorization without
    /// showing anything, and `ingest` rewrites the same two days' rows.
    ///
    /// ── WHY FOREGROUND AND NOT ONCE AT LAUNCH ───────────────────────────────
    /// A phone does not relaunch this app for days. Steps and active energy
    /// accrue all day, and `HealthSync` computes the day key when it is CALLED,
    /// so a process alive past midnight that only ever synced once would never
    /// create the new day's row at all — the tabs would keep re-reading a GRDB
    /// nothing had written to, and pull-to-refresh would refresh nothing.
    public func refreshHealth() {
        // Through `syncNow`, not straight to the coordinator: a foreground
        // sync writes today's rows, and one that does so with no hairline and
        // no timestamp leaves the caption reading "Synced 40m ago" over data
        // that landed a second ago. Fire-and-forget is still right HERE — the
        // scene phase is not waiting on an answer.
        Task { await syncNow(reason: .foreground) }
    }

    /// One sync, awaited — the shape `.refreshable` needs.
    ///
    /// `.refreshable` holds the spinner for exactly as long as its body runs,
    /// so something has to be awaitable end to end. The coordinator is: a call
    /// while one is running joins the run that will include it, and the status
    /// is stamped only when that run is genuinely done. Overlapping calls are
    /// fine — `SyncStatus` counts them.
    func syncNow(reason: SyncReason) async {
        guard case .signedIn = auth, let coordinator else { return }
        sync.begin()
        var failure: String?
        do { try await coordinator.syncNow(reason: reason) } catch { failure = String(describing: error) }
        // A sign-out during the await dropped the coordinator — and a sign-in
        // after it built a new one, so identity, not presence. Stamping
        // `lastSync` for the abandoned run would leave the next user's Today
        // saying "Synced just now" about a sync that was theirs to begin with.
        guard case .signedIn = auth, self.coordinator === coordinator else {
            sync.finish(error: "Signed out before the sync finished.")
            return
        }
        sync.finish(error: failure)
    }

    /// Build the coordinator for this user and run the first sync.
    ///
    /// ── WHY IT HANGS OFF AUTH ───────────────────────────────────────────────
    /// Every row the sync writes is keyed by `user_id`, so there is nothing to
    /// sync before a user is resolved. The auth stream also re-emits on every
    /// token refresh; an existing coordinator is what absorbs that.
    ///
    /// The HealthKit read is inside the coordinator now (§7.4): it runs first,
    /// before the push, so today's steps are never left in the outbox under a
    /// "Synced just now" caption. A declined permission is silent — absent
    /// metrics render as "—" downstream.
    private func startSync(userID: UUID) {
        guard coordinator == nil else { return }
        let coordinator = SyncCoordinator(
            database: database, client: supabase, userId: userID.uuidString,
            health: HealthSync(database: database, reader: HealthKitReader(), userId: userID.uuidString)
        )
        self.coordinator = coordinator
        Task {
            await self.syncNow(reason: .launch)
            // A no-op if sign-out stopped this coordinator meanwhile.
            await coordinator.startRealtime(client: supabase)
        }
    }

    public func signIn(email: String, password: String) async throws {
        try await supabase.auth.signIn(email: email, password: password)
    }

    public func signOut() async {
        // A failed sign-out must still clear local state, or the user is stuck
        // on a screen with no way forward.
        try? await supabase.auth.signOut()
        if let coordinator {
            self.coordinator = nil
            await coordinator.stop()
        }
        auth = .signedOut
    }

    /// The signed-in user's id as the store spells it.
    ///
    /// `workout_sessions.user_id` is NOT NULL in Postgres, so a session row has
    /// to carry one from the moment it is created — before any sync exists to
    /// supply it. Signed out, there is no session to open and nothing calls
    /// this; the empty string is the honest answer rather than a placeholder
    /// uuid that would later have to be found and corrected.
    public var userIdString: String {
        if case .signedIn(let userID) = auth { return userID.uuidString }
        return ""
    }

    private func scheduleWidgetReload() {
        widgetReload?.cancel()
        widgetReload = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    public func reportStartupError(_ message: String) {
        startupError = message
    }
}
