#if DEBUG
import SwiftUI
import HelixCore

/// Seeded logger screens for `scripts/native-shot.sh`.
///
/// Both shots are of a session MID-FLIGHT, because that is the only state worth
/// reviewing: an empty deck shows the layout and none of the density, and a
/// finished one shows neither. The loads are the real Upper B in
/// `LoggerPreviewData` — 49.5 kg, 42.5 kg, 13.75 kg, an RPE of 9.5 — which is
/// what exposes a four-character load beside a two-character rep count.
enum LoggerPreviews {

    @MainActor @ViewBuilder
    static func view(_ screen: String) -> some View {
        switch screen {
        case "logger-finish":
            // The finish sheet is presented BY the harness rather than by a
            // debug flag inside the view: a screen that ships a way to open one
            // of its sheets for a screenshot is a screen with a state nobody
            // can reach and nobody maintains.
            let model = LoggerModel.previewUpperB(logged: true)
            NavigationStack {
                LiveLoggerView(model: model)
                    .sheet(isPresented: .constant(true)) {
                        FinishSheet(model: model, onFinish: { _ in true })
                    }
            }
            .environment(AppEnvironment.preview)
            .preferredColorScheme(.dark)
        default:
            // Resting, so the shot carries the nav-bar capsule — the one piece
            // of this screen that only exists between sets.
            NavigationStack {
                LiveLoggerView(model: .previewUpperB(logged: true, resting: true))
            }
            .environment(AppEnvironment.preview)
            .preferredColorScheme(.dark)
        }
    }
}
#endif
