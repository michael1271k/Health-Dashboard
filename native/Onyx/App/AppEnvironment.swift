import Foundation
import Observation
import Supabase
import WidgetKit
import OnyxCore
import OnyxData

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

    /// The whole sync — `OnyxData`'s `SyncCoordinator`, one per signed-in
    /// user. It owns the HealthKit read, the outbox drain, the pulls, the
    /// score and the realtime socket, in that order. Nil while signed out.
    var coordinator: SyncCoordinator?
    /// Non-nil while the first-launch backfill sheet is up (§7.2). The sheet
    /// binds to this; `runBackfill` clears it when the history has landed.
    var backfill: BackfillModel?
    /// What every gauge, widget snapshot and score input is graded against
    /// (§6.2): one observation over `user_goals`, `daily_targets`,
    /// `target_profiles` and `schedule_overrides`. A lever pulled in Settings
    /// is one outbox row and one tick here; no view keeps a copy. Nil while
    /// signed out.
    private(set) var targets: TargetResolver?

    /// The logical day, republished at local midnight (§6.4). A model that
    /// holds its own `today` re-reads it on change; nothing is written for a
    /// rollover, and a `WeekWindow` cut from this re-cuts itself on the first
    /// weekday without a second timer.
    private(set) var today: String = LogicalDay.today()
    /// Bumped with `today`, for a view that only needs to know a day passed.
    private(set) var dayTick = 0

    /// Health has today's weight, and the InBody numbers it cannot know are
    /// still blank.
    ///
    /// ── WHY THE ROW AND NOT THE INGEST REPORT ───────────────────────────────
    /// `HealthSync` reports `body_composition` in its `IngestReport` when a
    /// weigh-in lands, and that was the obvious hook. It is the wrong one: a
    /// report exists only for the length of one sync, so a banner keyed to it
    /// appears once and is gone the next time the app launches — while the two
    /// blank columns are still blank. The ROW is the fact. HealthKit has no
    /// muscle-mass or body-water type at all (`DailyLogIngest` says so where it
    /// deliberately leaves `muscle_mass_kg` alone), so a row with a weight and
    /// no muscle is exactly "the scale synced, the reading is half here".
    private(set) var weighInPending = false

    /// Bumped by a banner that wants the InBody sheet. Pulse owns that sheet;
    /// Today only knows it wants it open, and switching tab is the shell's job.
    private(set) var scaleEntryRequests = 0

    /// Lifts that have earned a load bump, and the day they were graded for.
    ///
    /// ── PUBLISHED, NOT COMPUTED, HERE ───────────────────────────────────────
    /// The answer depends on the schedule (which day key is today, after
    /// overrides and the permanent layout), and that resolution already exists
    /// in exactly one place — `WorkoutWeek.build`. Re-deriving it here would be
    /// a second copy of the rule that decides what day it is, which is the one
    /// thing this app has already been bitten by (a swapped session read off
    /// the weekday). So whoever has the day key in hand publishes, and every
    /// surface that shows an alert reads the same array.
    ///
    /// In-app only (decision 10): nothing here schedules a notification.
    ///
    /// STAGED: the session-open banner and the exercise chip are Track U's
    /// (waves U1, U2). The Workout tab's own card still computes its own list
    /// in `WorkoutWeek.build`; it moves onto this array when U1 lands.
    private(set) var progressionAlerts: [ProgressionQueue.Alert] = []
    private(set) var progressionDayKey: String?

    /// Bumped when a rescore cascade COMPLETES — never per day, never per
    /// commit.
    ///
    /// ── WHAT IT IS FOR ──────────────────────────────────────────────────────
    /// Four screens load their data once and never look again: Trends
    /// (`guard sessions == nil`), History, the week grid and Body Trends. That
    /// was correct while the only thing that could change under them was a
    /// sync — which they were about to be replaced by anyway. It stopped being
    /// correct the moment a session became editable from inside the app: lower
    /// a set on the summary card, come back to Trends, and the chart is still
    /// drawing the old tonnage with no way to ask it not to.
    ///
    /// So they key a `.task(id:)` on this. It moves once per cascade, which is
    /// the only moment at which every score the edit touched agrees — publish
    /// per day and History would re-read the whole ledger forty-nine times for
    /// one correction.
    private(set) var rescoreGeneration = 0
    /// A run is going. A thin hint (a hairline, a caption) and nothing more —
    /// no screen blocks on it, because the numbers on display are the OLD
    /// consistent ones until the generation moves.
    private(set) var isRescoring = false

    /// The cascade, off the main actor and coalesced. Nil while signed out.
    private var rescoreQueue: RescoreQueue?

    /// Rewrite every stored score an edit on `date` can move.
    ///
    /// The ONE entry point. Every editing surface calls this rather than
    /// touching `AppDatabase.rescore` directly, so there is exactly one place
    /// that decides how a cascade is scheduled and one place that publishes the
    /// generation when it lands.
    func rescore(from date: String, reason: Rescore.Reason) {
        guard let rescoreQueue else { return }
        isRescoring = true
        Task { await rescoreQueue.request(from: date, reason: reason) }
    }

    /// Publish the queue for a day. Passing a different `dayKey` replaces the
    /// list rather than merging: an alert is about a lift ON a routine day, and
    /// two days' alerts in one array is how the banner starts naming a lift
    /// today's session does not contain.
    func publishProgression(_ alerts: [ProgressionQueue.Alert], for dayKey: String?) {
        progressionAlerts = alerts
        progressionDayKey = dayKey
    }

    #if DEBUG
    /// The shot loop: the banner's state is a row in a store the harness never
    /// signs in to, so the flag is set directly rather than seeded.
    func seedWeighInPendingForPreview() { weighInPending = true }
    #endif

    /// Ask Pulse to open the InBody form. The caller switches to the tab.
    public func requestScaleEntry() { scaleEntryRequests += 1 }

    private var weighInTask: Task<Void, Never>?
    #if ONYX_ADP
    private var observers: HealthObservers?
    #endif

    private var authTask: Task<Void, Never>?
    private var midnight: Task<Void, Never>?
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
            supabase: OnyxSupabase.makeClient(config: config)
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
        startMidnightClock()
        // Every local write — a set, a day edit, a mirror pull — reloads the
        // widgets, debounced: a pull commits per table and a session logs a
        // set every minute, and each reload is a full snapshot build.
        commitObserver = database.onCommit { [weak self] in
            Task { @MainActor in self?.scheduleWidgetReload() }
        }
        authTask = Task { [weak self] in
            guard let self else { return }
            #if DEBUG
            // `ONYX_SESSION_FILE=<path>` in the launch environment
            // (`SIMCTL_CHILD_ONYX_SESSION_FILE` through simctl): a JSON file
            // holding a `refresh_token`, so the backfill gate can sign a fresh
            // simulator in without a password and without a token in argv. The
            // token is single-use and rotates, so the file is dead once read.
            if let path = ProcessInfo.processInfo.environment["ONYX_SESSION_FILE"] {
                // After the stream below is subscribed, so the sign-in arrives
                // as a live event rather than being missed by `initialSession`.
                Task { [supabase] in
                    try? await Task.sleep(for: .milliseconds(300))
                    guard let data = FileManager.default.contents(atPath: path),
                          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let access = json["access_token"] as? String,
                          let refresh = json["refresh_token"] as? String
                    else { NSLog("onyx-session: could not read %@", path); return }
                    do {
                        _ = try await supabase.auth.setSession(accessToken: access, refreshToken: refresh)
                        // `stored` is the tell: an UNSIGNED simulator build cannot
                        // write the Keychain, the session never persists, and
                        // every pull comes back `[]` under RLS with a 200.
                        NSLog("onyx-session: signed in from file; stored=%@", supabase.auth.currentSession == nil ? "nil" : "yes")
                    } catch {
                        NSLog("onyx-session: refresh failed: %@", String(describing: error))
                    }
                }
            }
            #endif
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
        let userId = OnyxJSON.canonicalUserID(userID)
        let coordinator = SyncCoordinator(
            database: database, client: supabase, userId: userId,
            health: HealthSync(database: database, reader: Self.healthReader, userId: userId)
        )
        self.coordinator = coordinator
        // ── WHY IT HANGS OFF AUTH, LIKE THE COORDINATOR ─────────────────────
        // Every score it writes is keyed by `user_id`, and a queue that
        // outlived a sign-out would rewrite the previous user's days into the
        // next one's store.
        rescoreQueue = RescoreQueue(database: database, userId: userId) { [weak self] run in
            await MainActor.run {
                guard let self else { return }
                self.rescoreGeneration &+= 1
                // `hasMore` is the queue's own answer, not a second read: two
                // passes of one logical cascade must not flicker the hint off
                // between them.
                self.isRescoring = run.hasMore
                NSLog(
                    "onyx-rescore: %@ %@…%@ wrote %d, failed %d",
                    run.reason.rawValue, run.from, run.through, run.written, run.failed
                )
            }
        }
        startWeighInWatch()
        let targets = TargetResolver(database: database, userId: userId)
        targets.start()
        self.targets = targets
        Task {
            // A user this device has never synced gets the whole history
            // behind the sheet; everyone else gets the ordinary launch sync.
            if (try? await coordinator.needsBackfill()) == true {
                await self.runBackfill(coordinator, model: BackfillModel())
            } else {
                await self.syncNow(reason: .launch)
            }
            // A no-op if sign-out stopped this coordinator meanwhile.
            await coordinator.startRealtime(client: supabase)
            #if ONYX_ADP
            self.startObservers()
            #endif
        }
    }

    /// `ONYX_NO_HEALTH=1` (DEBUG launch environment) reads no HealthKit at
    /// all, so the permission sheet — which nothing on a simulator can tap —
    /// never covers the screen a gate is photographing.
    private static var healthReader: any HealthReading {
        #if DEBUG
        if ProcessInfo.processInfo.environment["ONYX_NO_HEALTH"] != nil { return NoHealth() }
        #endif
        return HealthKitReader()
    }

    /// Settings' "Re-run backfill": the same run, the same sheet.
    func rerunBackfill() {
        guard let coordinator, backfill == nil else { return }
        Task { await runBackfill(coordinator, model: BackfillModel()) }
    }

    /// The sheet's Retry, on the sheet's own model so the rows stay put.
    func retryBackfill(_ model: BackfillModel) {
        guard let coordinator else { return }
        model.error = nil
        Task { await runBackfill(coordinator, model: model) }
    }

    /// One backfill behind the sheet. Success shows the finished state for a
    /// beat, then drops the sheet; failure keeps it up with Retry.
    private func runBackfill(_ coordinator: SyncCoordinator, model: BackfillModel) async {
        backfill = model
        sync.begin()
        var failure: String?
        do {
            try await coordinator.backfill { progress in
                Task { @MainActor in model.progress = progress }
            }
        } catch {
            failure = String(describing: error)
        }
        guard case .signedIn = auth, self.coordinator === coordinator else {
            sync.finish(error: "Signed out before the sync finished.")
            backfill = nil
            return
        }
        sync.finish(error: failure)
        if let failure {
            model.error = failure
            return
        }
        try? await Task.sleep(for: .milliseconds(800))
        if backfill === model { backfill = nil }
    }

    #if ONYX_ADP
    /// Background delivery (Gate 0). A note from HealthKit is a `.healthKit`
    /// sync through the coordinator's queue, like every other trigger.
    private func startObservers() {
        guard observers == nil else { return }
        let observers = HealthObservers { [weak self] _ in
            Task { @MainActor in await self?.syncNow(reason: .healthKit) }
        }
        observers.start()
        self.observers = observers
    }
    #endif

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
        #if ONYX_ADP
        observers?.stop()
        observers = nil
        #endif
        backfill = nil
        // AWAITED, like the coordinator above. Dropping the reference does not
        // stop the drain: it runs in an unstructured task that retains the
        // actor, so it would go on writing the PREVIOUS user's days into the
        // store the next one is signing in to, queueing upserts their RLS will
        // reject and bumping a generation that belongs to somebody else.
        if let rescoreQueue {
            self.rescoreQueue = nil
            await rescoreQueue.stop()
        }
        isRescoring = false
        targets?.stop()
        targets = nil
        weighInTask?.cancel()
        weighInTask = nil
        weighInPending = false
        auth = .signedOut
    }

    // MARK: - The weigh-in

    /// One observation over today's `body_composition` row. Restarted by
    /// `rollDay`, because the row it watches is the DAY's.
    private func startWeighInWatch() {
        weighInTask?.cancel()
        guard case .signedIn(let userID) = auth else {
            weighInPending = false
            return
        }
        let userId = OnyxJSON.canonicalUserID(userID)
        let date = today
        weighInTask = Task { [database] in
            do {
                for try await row in database.bodyCompositionStream(userId: userId, date: date) {
                    if Task.isCancelled { return }
                    // A weight with no muscle AND no water is a scale that
                    // synced through Health; either one present means the
                    // InBody numbers were entered and there is nothing to ask.
                    self.weighInPending = row != nil && row?.muscleMassKg == nil && row?.waterPct == nil
                }
            } catch {
                // A dropped observation is not worth a banner of its own — the
                // next day tick restarts it.
                self.weighInPending = false
            }
        }
    }

    // MARK: - Midnight

    /// Republish `today` at every local 00:00, and whenever the system says
    /// the day changed under us — a timezone crossing, a clock correction, or
    /// a wake from a suspension that slept through the deadline.
    ///
    /// ── WHY BOTH A SLEEP AND A NOTIFICATION ─────────────────────────────────
    /// `NSCalendarDayChanged` is the platform's own midnight, but it is only
    /// delivered while the process is running and not always promptly on a
    /// return from suspension. The sleep is exact when the app is awake; the
    /// notification catches the cases the sleep cannot see. `rollDay` is
    /// idempotent — it compares before publishing — so the two racing is a
    /// no-op, not a double tick.
    private func startMidnightClock() {
        guard midnight == nil else { return }
        midnight = Task { [weak self] in
            let center = NotificationCenter.default
            let days = Task { [weak self] in
                for await _ in center.notifications(named: .NSCalendarDayChanged) {
                    self?.rollDay()
                }
            }
            defer { days.cancel() }
            while !Task.isCancelled {
                let now = Date()
                let calendar = Calendar.current
                // The next 00:00 in the device's own calendar — DST-aware, so
                // the 23- and 25-hour nights land on the right instant.
                let next = calendar.nextDate(
                    after: now, matching: DateComponents(hour: 0, minute: 0, second: 0), matchingPolicy: .nextTime
                ) ?? calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now.addingTimeInterval(3600)
                // Continuous clock: keeps counting through a suspension, so a
                // deadline that passed while asleep fires on the way back in.
                try? await Task.sleep(until: .now + .seconds(next.timeIntervalSince(now) + 0.5), clock: .continuous)
                self?.rollDay()
            }
        }
    }

    private func rollDay() {
        let day = LogicalDay.today()
        guard day != today else { return }
        today = day
        dayTick += 1
        // Yesterday's queue is about yesterday's routine day.
        publishProgression([], for: nil)
        startWeighInWatch()
    }

    /// The signed-in user's id as the store spells it.
    ///
    /// `workout_sessions.user_id` is NOT NULL in Postgres, so a session row has
    /// to carry one from the moment it is created — before any sync exists to
    /// supply it. Signed out, there is no session to open and nothing calls
    /// this; the empty string is the honest answer rather than a placeholder
    /// uuid that would later have to be found and corrected.
    ///
    /// "As the store spells it" was a lie until W1: this returned
    /// `userID.uuidString`, which is uppercase, while every pulled row carried
    /// Postgres's lowercase. See `OnyxJSON.canonicalUserID`.
    public var userIdString: String {
        if case .signedIn(let userID) = auth { return OnyxJSON.canonicalUserID(userID) }
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

#if DEBUG
/// A device with no Health store. Every read answers "nothing here".
private struct NoHealth: HealthReading {
    var isAvailable: Bool { false }
    func requestAuthorization(read: [String]) async throws -> Bool { false }
    func quantity(_ identifier: String, reduce: HealthReduce, start: Date, end: Date) async throws -> Double? { nil }
    func sleepSamples(start: Date, end: Date) async throws -> [SleepSample] { [] }
}
#endif
