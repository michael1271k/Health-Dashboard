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
                NavigationStack { LoggerScreen() }
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

/// Wave 1's seed: proof the whole stack is wired, end to end.
///
/// It reads from GRDB — never from the network — so it renders instantly and
/// works in aeroplane mode, which is the property the entire data layer exists
/// to provide. The set list is a `ValueObservation`, so a write appears here
/// with no refresh call and no cache key to get wrong.
private struct LoggerScreen: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var sessions: [WorkoutSession] = []
    @State private var loadError: String?

    private var today: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        // The logical calendar day is the DEVICE's, never the server's — the
        // web app learned this on `/api/today`, which takes the date as a
        // parameter for exactly this reason.
        formatter.timeZone = .current
        return formatter.string(from: Date())
    }

    var body: some View {
        List {
            Section {
                if sessions.isEmpty {
                    Text("No session logged today.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sessions) { session in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.dayKey ?? "Session")
                                .font(.headline)
                            if session.isPendingSync {
                                Label("Queued", systemImage: "arrow.up.circle")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    }
                }
            } header: {
                Text(today)
            } footer: {
                Text("Read from the local store. This list is correct offline.")
            }

            if let loadError {
                Section {
                    Text(loadError).font(.footnote).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Workout")
        // One modifier, replacing 301 lines of `PullToRefresh.tsx`.
        .refreshable { load() }
        .onAppear { load() }
    }

    private func load() {
        do {
            sessions = try environment.database.sessions(on: today)
            loadError = nil
        } catch {
            loadError = String(describing: error)
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
