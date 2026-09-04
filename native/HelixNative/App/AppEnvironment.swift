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

    /// The push/pull half of a sync — `HelixData`'s `SyncCoordinator`, landing
    /// in Wave 2.1 (§7.1). Nil until then, and `syncNow` is honest about it:
    /// the HealthKit read below is real work and runs either way.
    var coordinator: (any SyncCoordinating)?

    private var authTask: Task<Void, Never>?
    /// The commit observer, held for the life of the app (GRDB stops observing
    /// when it is deallocated). Untyped so the app target need not import GRDB.
    private var commitObserver: AnyObject?
    private var widgetReload: Task<Void, Never>?
    /// The pull in flight, or `nil`. Non-nil is the re-entrancy guard — it is
    /// cleared when the pull finishes, so the NEXT foreground runs another one.
    private var healthTask: Task<Void, Never>?

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
                if case .signedIn(let userID) = self.auth { self.startHealthSync(userID: userID) }
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
        // Through `syncNow`, not straight to `startHealthSync`: a foreground
        // sync writes today's rows, and one that does so with no hairline and
        // no timestamp leaves the caption reading "Synced 40m ago" over data
        // that landed a second ago. Fire-and-forget is still right HERE — the
        // scene phase is not waiting on an answer.
        Task { await syncNow(reason: .foreground) }
    }

    /// One sync, awaited — the shape `.refreshable` needs.
    ///
    /// ── WHY THE UI AWAITS THIS AND NOT THE ENGINES ──────────────────────────
    /// `.refreshable` holds the spinner for exactly as long as its body runs, so
    /// something has to be awaitable end to end. `startHealthSync` is not: it is
    /// fire-and-forget with a re-entrancy guard, which is right for a foreground
    /// hook and useless for a pull. This awaits the work — including a pull
    /// already in flight, rather than starting a second one — and stamps the
    /// status only when it is genuinely done.
    ///
    /// ── AND WHY HEALTHKIT READS FIRST ──────────────────────────────────────
    /// §7.1 orders the COORDINATOR's own steps push-then-pull, so a local edit
    /// is never overwritten by a pull that has not seen it. That is internal to
    /// the coordinator. What matters out here is that `HealthSync` WRITES — to
    /// the store and to the outbox — so running it after the push means today's
    /// steps sit in the outbox unsent while the caption says "Synced just now".
    /// Read from Apple first, then let the coordinator push what that produced.
    ///
    /// Overlapping calls are fine: `SyncStatus` counts them, and `runHealthSync`
    /// joins a pull already in flight rather than starting a second one.
    func syncNow(reason: SyncReason) async {
        guard case .signedIn(let userID) = auth else { return }
        sync.begin()
        await runHealthSync(userID: userID)
        var failure: String?
        if let coordinator {
            do { try await coordinator.syncNow(reason: reason) } catch { failure = error.localizedDescription }
        }
        // A sign-out during the await cancelled the work. Stamping `lastSync`
        // for it would leave the next user's Today saying "Synced just now"
        // about a sync that was abandoned half way.
        guard case .signedIn = auth else {
            sync.finish(error: "Signed out before the sync finished.")
            return
        }
        sync.finish(error: failure)
    }

    /// Ask Apple Health for read access, then pull today and yesterday.
    ///
    /// ── WHY IT HANGS OFF AUTH ───────────────────────────────────────────────
    /// `HealthSync` writes rows keyed by `user_id`, so there is nothing to
    /// write before a user is resolved. The auth stream also re-emits on every
    /// token refresh; `healthTask` being non-nil is what absorbs that.
    ///
    /// Both failures are silent on purpose: a declined prompt and a device with
    /// no Health data are the same thing to every screen downstream — absent
    /// metrics render as "—" — and an error banner over the dashboard for a
    /// permission the user deliberately withheld is noise.
    private func startHealthSync(userID: UUID) {
        Task { await runHealthSync(userID: userID) }
    }

    /// The awaitable half. A pull already in flight is JOINED, not duplicated —
    /// `healthTask` non-nil is the re-entrancy guard, and awaiting its value is
    /// what turns the guard into "wait for the answer" rather than "there is no
    /// answer for you".
    private func runHealthSync(userID: UUID) async {
        if let healthTask {
            await healthTask.value
            return
        }
        let task = Task { [database] in
            let health = HealthSync(
                database: database, reader: HealthKitReader(), userId: userID.uuidString
            )
            guard (try? await health.requestAuthorization()) == true else { return }
            // The pull is what the permission is FOR. Requesting access and then
            // reading nothing leaves every chart and widget empty until some
            // later wave wires a pull, which reads as a broken grant.
            _ = try? await health.syncRecent()
        }
        healthTask = task
        await task.value
        // Only if it is still OURS. A sign-out between the two lines above
        // clears the slot and the next sign-in fills it with a new task; an
        // unconditional nil here would unregister THAT one, and the pull after
        // it would run a second `HealthSync` against the same day's rows.
        // `Task` is a struct, so identity is its `Hashable` conformance rather
        // than `===`.
        if healthTask == task { healthTask = nil }
    }

    public func signIn(email: String, password: String) async throws {
        try await supabase.auth.signIn(email: email, password: password)
    }

    public func signOut() async {
        // A failed sign-out must still clear local state, or the user is stuck
        // on a screen with no way forward.
        try? await supabase.auth.signOut()
        healthTask?.cancel()
        healthTask = nil
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
