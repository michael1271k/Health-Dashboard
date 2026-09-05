import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// The Settings tab — six `Section`s of a stock `Form` (§5.8).
///
/// ── WHAT THE WEB VERSION DID THAT THIS DOES NOT ─────────────────────────────
/// Four things, all of them WEB-SIM:
///
///   · a `Zone` component drawing its own bordered card per group — a `Section`
///     is that, with correct grouped-list metrics and header semantics;
///   · a units/week-start/motion trio mirrored into six `localStorage` keys and
///     a hand-rolled `window` event bus, because `activeProgram()` is read
///     synchronously during the next React render. The native app reads GRDB,
///     which is reactive, so the mirrors are simply deleted;
///   · a whole-row upsert on every toggle, so flipping Reduce Motion rewrote the
///     calorie target;
///   · a sixteen-field volume editor inline on the hub, with uncontrolled inputs
///     remounted by `key` to reset them. It is a screen of its own here.
///
/// ── AND WHAT WAVE 2.11 CHANGED ──────────────────────────────────────────────
/// Pathfinder is gone — its week-by-week table was a second, worse History, and
/// History is now a door from Today. In its place the tab grew the thing it
/// never had: a Sync section that says, per table, what this device actually
/// holds and when it last heard from the server. A sync you cannot inspect is a
/// sync you have to trust, and §2.3 is a list of the times that was misplaced.
struct SettingsTabView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied only by the screenshot harness, which needs a store it seeded
    /// rather than the signed-in user's. The app never passes one.
    var seeded: SettingsModel?

    @State private var resolved: SettingsModel?

    var body: some View {
        Group {
            if let resolved {
                SettingsForm(model: resolved)
            } else {
                // One frame at most: the model needs the signed-in user id, and
                // that is known by the time this appears.
                ProgressView().controlSize(.large)
            }
        }
        .task {
            if resolved == nil {
                resolved = seeded
                    ?? SettingsModel(database: environment.database, userId: environment.userIdString)
            }
            await resolved?.observe()
        }
    }
}

private struct SettingsForm: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.scenePhase) private var scenePhase
    let model: SettingsModel

    @State private var isSigningOut = false

    var body: some View {
        Form {
            if let failure = model.failure {
                Section {
                    Label(failure, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.helix.danger)
                        .font(.footnote)
                        .accessibilityAddTraits(.isStaticText)
                }
            }

            Section {
                NavigationLink {
                    PlanView(model: model)
                } label: {
                    LabeledContent("Training plan", value: "\(model.plan.label) · \(model.phase.label)")
                }
            } header: {
                HelixSectionHeader("Plan", .train)
            }

            Section {
                NavigationLink {
                    LeversView(model: model)
                } label: {
                    LabeledContent("Levers", value: leverSummary)
                }
                NavigationLink {
                    VolumeTargetsView(model: model)
                } label: {
                    LabeledContent("Weekly set volume", value: "\(model.volumeTotal) sets")
                }
                NavigationLink {
                    BodyTargetsView(model: model)
                } label: {
                    LabeledContent(
                        "Body targets",
                        value: model.targetWeightKg.map { "\($0.formatted(.number.precision(.fractionLength(0...1)))) kg" } ?? "—"
                    )
                }
                NavigationLink {
                    ReportsListView()
                } label: {
                    LabeledContent("Reports", value: "Weekly")
                }
            } header: {
                HelixSectionHeader("Targets", .fuel)
            }

            Section {
                Picker("Weight units", selection: unitSystem) {
                    Text("Kilograms").tag("kg")
                    Text("Pounds").tag("lb")
                }
                Picker("Week starts on", selection: weekStartDay) {
                    Text("Sunday").tag(0)
                    Text("Monday").tag(1)
                }
                Toggle("Reduce motion", isOn: reduceMotion)
            } header: {
                HelixSectionHeader("Units & display", .recover)
            } footer: {
                // Says what each DOES, not what it ought to. Week start is now
                // load-bearing — one `WeekWindow` cuts History, the Workout
                // tab's This-week panel and the weekly export, so changing it
                // re-labels every week in the app. Reduce motion is still only
                // stored: nothing in `HelixNative` reads it, and neither does
                // anything read the system setting, so claiming otherwise here
                // would be a lie in a settings footer.
                Text("A week runs \(weekSpanLabel) — History, this week's panel and the weekly export are all cut on it. Reduce motion is stored with your account and honoured by the web app; the native app does not read it yet.")
            }

            Section {
                Toggle("Track effort (RPE)", isOn: trackRpe)
            } header: {
                HelixSectionHeader("Training", .train)
            } footer: {
                Text("Adds an RPE control to every logged set. Half of the double-progression rule reads it.")
            }

            Section {
                NavigationLink {
                    SyncStatusView()
                } label: {
                    LabeledContent("Sync status", value: environment.sync.caption(at: .now) ?? "Never synced")
                }
            } header: {
                HelixSectionHeader("Sync", .body)
            } footer: {
                Text("What this device holds, table by table, and anything still waiting to reach the server.")
            }

            Section {
                LabeledContent("App", value: "Onyx")
                LabeledContent("Version", value: HelixLinks.versionString)
                Link("Privacy Policy", destination: HelixLinks.privacyPolicy)
                    .accessibilityHint("Opens in Safari")
            } header: {
                HelixSectionHeader("About", .recover)
            } footer: {
                Text("Health data stays on this device and in your own private Onyx account. It is never sold, and never shared with anyone else.")
            }

            Section {
                Button("Sign out", role: .destructive) { isSigningOut = true }
            }
        }
        .helixFormBackground(.train)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.refreshToday() }
        }
        .onChange(of: environment.today) { _, _ in model.refreshToday() }
        .confirmationDialog("Sign out of Onyx?", isPresented: $isSigningOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) {
                Task { await environment.signOut() }
            }
        } message: {
            Text("Logged sets already on this device stay until they sync.")
        }
    }

    /// `Baseline · 1,955 kcal`, or the release and the date it ends.
    private var leverSummary: String {
        let kcal = model.shownGoals.calorie.formatted(.number.precision(.fractionLength(0)))
        guard let held = model.heldBy else { return "My own numbers · \(kcal) kcal" }
        return "\(held.label) · \(kcal) kcal"
    }

    /// `Monday to Sunday` — the setting read back as the span it produces,
    /// which is the thing being chosen. "Week starts on: Monday" leaves the
    /// reader to work out which Sunday a session then belongs to.
    private var weekSpanLabel: String {
        let window = WeekWindow(containing: model.today, goals: model.goals)
        let names = Calendar.current.weekdaySymbols
        return "\(names[window.startDay]) to \(names[(window.startDay + 6) % 7])"
    }

    // ── Bindings ────────────────────────────────────────────────────────────
    // Written as computed bindings rather than `@State` mirrors of the row: a
    // mirror has to be kept in step with the stream, and the moment it drifts
    // the control shows one thing while the database holds another. The control
    // reads the store and writes the store, so it cannot disagree with it.

    private var unitSystem: Binding<String> {
        Binding(get: { model.goals?.unitSystem ?? "kg" }, set: { model.setUnitSystem($0) })
    }

    private var weekStartDay: Binding<Int> {
        Binding(
            get: { WeekWindow.startDay(from: model.goals) },
            set: { model.setWeekStartDay($0) }
        )
    }

    private var reduceMotion: Binding<Bool> {
        Binding(get: { model.goals?.reduceMotion ?? false }, set: { model.setReduceMotion($0) })
    }

    private var trackRpe: Binding<Bool> {
        Binding(get: { model.goals?.trackRpe ?? true }, set: { model.setTrackRpe($0) })
    }
}

#if DEBUG
#Preview("Settings") {
    NavigationStack { SettingsTabView() }
        .environment(AppEnvironment.preview)
}
#endif

// ── App Store surfaces ──────────────────────────────────────────────────────
// App Review requires a reachable privacy-policy URL for any app carrying the
// HealthKit entitlement, and the SAME url goes in the App Store Connect
// metadata field (docs/APP_STORE.md). It is a placeholder on the web app's
// domain until that page is written; Wave 9 moves the domain, not this key.
enum HelixLinks {
    static let privacyPolicy = URL(string: "https://helix-health-fitness.netlify.app/privacy")!

    /// `1.0 (12)` — what a review note or a bug report needs to identify a build.
    static var versionString: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? "—"
        return "\(short) (\(build))"
    }
}
