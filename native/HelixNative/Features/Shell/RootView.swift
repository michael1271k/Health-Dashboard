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
    enum Tab: Hashable { case today, train, fuel, body, you }

    @State private var selection: Tab = .today

    var body: some View {
        TabView(selection: $selection) {
            SwiftUI.Tab("Today", systemImage: "square.grid.2x2", value: Tab.today) {
                NavigationStack {
                    TodayTabView(onOpenTrain: { selection = .train }, onOpenReports: { selection = .you })
                }
            }
            // The plan's five: Today · Train · Fuel · Body · You. The logger is
            // NOT the Train root — see `TrainTabView` for why.
            SwiftUI.Tab("Train", systemImage: "figure.strengthtraining.traditional", value: Tab.train) {
                NavigationStack { TrainTabView() }
            }
            SwiftUI.Tab("Fuel", systemImage: "fork.knife", value: Tab.fuel) {
                NavigationStack { FuelTabView() }
            }
            SwiftUI.Tab("Body", systemImage: "figure.arms.open", value: Tab.body) {
                NavigationStack { DayTabView() }
            }
            SwiftUI.Tab("You", systemImage: "person.crop.circle", value: Tab.you) {
                NavigationStack { YouTabView() }
            }
        }
        // `helix://open?path=…` from a widget or the Lock Screen card. The
        // allow-list runs first; an unknown path is ignored, not "home".
        .onOpenURL { url in
            guard let path = DeepLink.safePath(url.absoluteString),
                  let destination = DeepLink.destination(forPath: path) else { return }
            selection = tab(for: destination)
        }
    }

    private func tab(for destination: DeepLink.Destination) -> Tab {
        switch destination {
        case .today: return .today
        case .train: return .train
        case .fuel: return .fuel
        // ponytail: the date is dropped — DayTabView has no date initialiser yet; thread it through when Body grows a date route.
        case .body: return .body
        // ponytail: Reports is a value-less NavigationLink inside YouTabView; landing on You is as deep as the shell can push today.
        case .you, .reports: return .you
        }
    }
}
