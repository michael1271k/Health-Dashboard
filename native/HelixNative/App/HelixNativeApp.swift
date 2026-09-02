import SwiftUI
import HelixData

@main
struct HelixNativeApp: App {
    @State private var environment: AppEnvironment?
    @State private var startupError: String?

    var body: some Scene {
        WindowGroup {
            Group {
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
            Label("HELIX could not start", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        }
        .textSelection(.enabled)
    }
}
