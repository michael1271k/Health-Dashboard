import SwiftUI
import HelixData

@main
struct HelixNativeApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var environment: AppEnvironment?
    @State private var startupError: String?

    var body: some Scene {
        WindowGroup {
            Group {
                #if DEBUG
                // The screenshot loop's door. Checked before anything else so a
                // shot never waits on a database or a Keychain read.
                if let screen = PreviewHarness.requestedScreen {
                    PreviewHarness.view(screen)
                } else if let environment {
                    RootView()
                        .environment(environment)
                        .task { environment.start() }
                } else if let startupError {
                    StartupErrorView(message: startupError)
                } else {
                    ProgressView().controlSize(.large)
                }
                #else
                if let environment {
                    RootView()
                        .environment(environment)
                        .task { environment.start() }
                } else if let startupError {
                    StartupErrorView(message: startupError)
                } else {
                    // The database opens and the Keychain is read in single-digit
                    // milliseconds, so this is almost never seen — but it is a
                    // real state, and a `ProgressView` here is what stops a
                    // frame of the wrong screen from being drawn.
                    ProgressView().controlSize(.large)
                }
                #endif
            }
            .preferredColorScheme(.dark)
            .task {
                guard environment == nil, startupError == nil else { return }
                do {
                    environment = try AppEnvironment.live()
                } catch {
                    startupError = String(describing: error)
                }
            }
            // Apple Health is read on every foreground, not once at launch —
            // see `AppEnvironment.refreshHealth`. Signed out, or with a pull
            // already running, this is a no-op.
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                environment?.refreshHealth()
            }
        }
    }
}

/// A launch that could not proceed, with the reason on screen.
///
/// A `fatalError` here would be a crash on first run for the one mistake
/// everyone makes — forgetting to copy `Secrets.xcconfig` — and a crash tells
/// you nothing. `SupabaseConfig.ConfigError` already carries the fix; this just
/// shows it.
private struct StartupErrorView: View {
    let message: String

    var body: some View {
        ContentUnavailableView {
            Label("Onyx could not start", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        }
        .textSelection(.enabled)
    }
}
