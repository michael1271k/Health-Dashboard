import SwiftUI

/// The Watch logging client.
///
/// ── WHAT IT IS ──────────────────────────────────────────────────────────────
/// A full logging client, not a remote control. It holds its OWN GRDB store,
/// runs the same eighteen migrations the phone does, appends to the same
/// append-only event log and is simply a second `device_id` in it. A watch with
/// no phone in range logs a whole workout and hands it over later.
///
/// ── AND WHAT IT DELIBERATELY IS NOT ─────────────────────────────────────────
/// It is not a network client. There is no Supabase session on this wrist, no
/// refresh token and no Keychain item, because the alternative was moving a
/// long-lived credential onto a second device to save a case that a gym watch
/// rarely hits. Everything reaches the server through the phone, over
/// `WatchLink`, and the phone's outbox pushes it.
///
/// The cost of that, stated plainly rather than discovered: a watch that never
/// sees its phone again keeps its sets locally and nowhere else.
@main
struct OnyxWatchApp: App {

    /// One model for the whole app, created here so it outlives every view.
    /// `@State` rather than `@StateObject` — `WatchModel` is `@Observable`.
    @State private var model = WatchModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                // `.task` rather than `.onAppear`: opening the store, activating
                // WatchConnectivity and asking HealthKit for authorization are
                // all things that should be cancelled if the view goes away
                // before they finish, and `start()` is idempotent so a second
                // appearance costs nothing.
                .task { model.start() }
        }
    }
}
