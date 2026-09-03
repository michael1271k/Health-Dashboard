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
                NavigationStack { PlaceholderScreen(name: "Dashboard", wave: 2) }
            }
            Tab("Workout", systemImage: "figure.strengthtraining.traditional") {
                NavigationStack { WorkoutTab() }
            }
            Tab("Fuel", systemImage: "fork.knife") {
                NavigationStack { PlaceholderScreen(name: "Nutrition", wave: 3) }
            }
            Tab("Progress", systemImage: "chart.xyaxis.line") {
                NavigationStack { PlaceholderScreen(name: "Pathfinder", wave: 4) }
            }
            Tab("Settings", systemImage: "gearshape") {
                NavigationStack { SettingsScreen() }
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

/// Today's deck, or the reason there isn't one.
///
/// ── WHY THE DAY IS RESOLVED HERE AND NOT INSIDE THE LOGGER ──────────────────
/// `LiveLoggerView` takes a `LoggerModel`, which takes a `ProgramDay`. That is
/// deliberate: the logger can then be previewed on any day of the week, and
/// the swap/override logic — which is real, dated, and a Wave 6 port — has
/// exactly one place to land when it arrives.
///
/// The weekday lookup below is the PLAN's layout, and it is the only correct
/// use of a weekday here. Never infer a LOGGED session's split from its
/// weekday: a swap moves a workout to another date and a Wednesday
/// "Delts & Arms" landed in the Upper A curve exactly that way.
private struct WorkoutTab: View {
    @Environment(AppEnvironment.self) private var environment

    /// Cut is the live block (`Helix Cut 5.1`, open since 2026-07-15). It is
    /// `@AppStorage` rather than a constant because the phase toggle has to
    /// survive a relaunch — and `@AppStorage` rather than a GRDB table because
    /// it is a single scalar preference, not a fact about a workout.
    @AppStorage("helix.phase") private var storedPhase = ProgramPhase.cut.rawValue

    private var today: ProgramDay? {
        // `Calendar.component(.weekday:)` is 1-based from Sunday; the program's
        // own `weekday` is 0-based from Sunday, like `Date.getDay()` in the
        // TypeScript it was ported from.
        let weekday = Calendar.current.component(.weekday, from: Date()) - 1
        return Program.helix5.day(weekday: weekday)
    }

    var body: some View {
        if let day = today {
            LiveLoggerView(model: LoggerModel(
                day: day,
                phase: ProgramPhase(rawValue: storedPhase) ?? .cut,
                store: environment.database,
                userId: environment.userIdString
            ))
            // The identity is the day. Without it SwiftUI reuses the view — and
            // therefore the `@State` model — across a date change at midnight,
            // and tomorrow's deck would render yesterday's logged sets.
            .id(day.key)
        } else {
            ContentUnavailableView {
                Label("Zone-2 rest", systemImage: "figure.walk")
            } description: {
                Text("HELIX-5 trains Sun, Mon, Tue, Thu and Fri. Today is a walk.")
            }
            .navigationTitle("Workout")
        }
    }
}

private struct SettingsScreen: View {
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        List {
            Section("Domain") {
                // The port, visible. `HelixCore` is pure and has no idea a
                // database or a view exists, so it can be called from anywhere —
                // including here, to show the arithmetic is live.
                LabeledContent("Battery drain budget") {
                    Text(Battery.maxTotalDrain, format: .number)
                }
                LabeledContent("TEF factor") {
                    Text(Energy.tefFactor, format: .percent.precision(.fractionLength(1)))
                }
            }
            Section {
                Button("Sign out", role: .destructive) {
                    Task { await environment.signOut() }
                }
            }
        }
        .navigationTitle("Settings")
    }
}
