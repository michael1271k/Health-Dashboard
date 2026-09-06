#if DEBUG
import SwiftUI
import OnyxCore
import OnyxUI

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
        case "logger-options":
            // The set options sheet, over the card it belongs to. Presented by
            // the harness for the same reason the finish sheet is: a screen
            // that ships a way to open one of its own sheets for a screenshot
            // is a screen with a state nobody can reach and nobody maintains.
            //
            // Over the SECOND set of the second movement, and that set is a
            // warm-up carrying a quality — the sheet's whole job is to show two
            // axes at once, and a shot of it with both unset would photograph
            // the empty state and call it the control.
            let model = LoggerModel.previewUpperB(logged: true)
            let exercise = model.exercises[1]
            let row = exercise.rows[min(1, exercise.rows.count - 1)]
            // Seeded HERE and not in a `.task`. This builder runs again on
            // every re-render and makes a fresh model each time, so a task that
            // mutates the model it captured is describing an object the next
            // frame has already replaced — which photographed as the empty
            // state, twice.
            let _ = { row.kind = .warmup; row.quality = .formBreakdown }()
            NavigationStack {
                LiveLoggerView(model: model)
                    .sheet(isPresented: .constant(true)) {
                        SetOptionsSheet(
                            ordinal: 2, row: row,
                            onKind: { model.setKind($0, on: row, in: exercise) },
                            onQuality: { model.setQuality($0, on: row, in: exercise) },
                            onNote: {}, onDuplicate: {}, onDelete: {}
                        )
                    }
            }
            .environment(AppEnvironment.preview)
            .preferredColorScheme(.dark)
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
        case "logger-stats":
            // The second face. Shot with a session mid-flight for the same
            // reason the first is: an empty Live Stats page is five cards of
            // empty states, which photographs the fallbacks and calls it the
            // design.
            NavigationStack {
                LiveLoggerView(model: .previewUpperB(logged: true), face: .stats)
            }
            .environment(AppEnvironment.preview)
            .preferredColorScheme(.dark)
        case "logger-paused":
            // A stopped clock — the one state on this screen where the hero's
            // timer is a string rather than a system timer, and the state the
            // Lock Screen has to agree with. Built here rather than reached by a
            // debug flag inside the view, for the same reason the finish sheet
            // is presented by the harness.
            let clock = LoggerClock(startedAt: Date().addingTimeInterval(-22 * 60))
            let _ = clock.pause()
            NavigationStack {
                LiveLoggerView(model: .previewUpperB(logged: true, resting: true), clock: clock)
            }
            .environment(AppEnvironment.preview)
            .preferredColorScheme(.dark)
        default:
            // Resting, so the shot carries the rest capsule and the contextual
            // "Skip rest" chip — the two pieces of this screen that only exist
            // between sets.
            NavigationStack {
                LiveLoggerView(model: .previewUpperB(logged: true, resting: true))
            }
            .environment(AppEnvironment.preview)
            .preferredColorScheme(.dark)
        }
    }
}
#endif
