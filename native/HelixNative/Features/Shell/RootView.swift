import SwiftUI
import HelixCore
import HelixData

/// The app shell.
///
/// ── THE SYSTEM CONTAINERS ARE THE POINT ─────────────────────────────────────
/// A `TabView` of `NavigationStack`s, and nothing custom around them. That one
/// choice deletes, outright, four pieces of the web app that exist only to
/// imitate it:
///
///   · `lib/nav/useEdgeSwipeBack.ts` (227 loc) — a hand-rolled back gesture on
///     raw touch events, with its own projection and rubber-banding physics,
///     written because WKWebView cannot swipe a `pushState` navigation;
///   · `lib/nav/scrollMemory.ts` (171 loc) — per-route scroll restoration,
///     written because App Router remounts the subtree on every navigation;
///   · `nav/BottomNav.tsx` + `Sidebar.tsx` (404 loc) — a `layoutId` tab
///     indicator;
///   · `ui/PullToRefresh.tsx` (301 loc) — replaced below by `.refreshable`.
///
/// None of that is ported. `NavigationStack` gives the interactive back-edge
/// swipe, `TabView` gives scroll restoration and scroll-to-top on re-tap, and
/// both are Apple's, so they match every other app on the device.
struct RootView: View {
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        switch environment.auth {
        case .resolving:
            ProgressView().controlSize(.large)
        case .signedOut:
            SignInView()
        case .signedIn:
            SignedInTabs()
        }
    }
}

private struct SignedInTabs: View {
    var body: some View {
        TabView {
            Tab("Today", systemImage: "square.grid.2x2") {
                NavigationStack { PlaceholderScreen(name: "Dashboard", wave: 6) }
            }
            // The plan's five: Today · Train · Fuel · Body · You. The logger is
            // NOT the Train root — see `TrainTabView` for why.
            Tab("Train", systemImage: "figure.strengthtraining.traditional") {
                NavigationStack { TrainTabView() }
            }
            Tab("Fuel", systemImage: "fork.knife") {
                NavigationStack { FuelTabView() }
            }
            Tab("Body", systemImage: "figure.arms.open") {
                NavigationStack { DayTabView() }
            }
            Tab("You", systemImage: "person.crop.circle") {
                NavigationStack { YouTabView() }
            }
        }
    }
}

/// A screen that belongs to a later wave, saying so rather than pretending.
private struct PlaceholderScreen: View {
    let name: String
    let wave: Int

    var body: some View {
        ContentUnavailableView {
            Label(name, systemImage: "hammer")
        } description: {
            Text("Arrives in Wave \(wave). The web app is still the place for this.")
        }
        .navigationTitle(name)
    }
}
