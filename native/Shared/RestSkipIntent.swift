import ActivityKit
import AppIntents
import Foundation

/// The Live Activity's "skip rest" button, and the one hook the running logger
/// hangs off it.
///
/// ── WHY THIS FILE SITS BESIDE THE ATTRIBUTES AND NOT IN THE APP ─────────────
/// `HelixWorkoutAttributes` next door explains the rule that puts it here: the
/// widget extension DRAWS this button and the app PERFORMS it, so the intent
/// type has to be the same type on both sides, which means one file compiled
/// into both targets. The cost is that it may import nothing the extension does
/// not have — no HelixCore, no HelixData, and above all no `LoggerModel`.

/// Where the running logger leaves its "stop the rest clock" closure.
///
/// ── WHY A CLOSURE AND NOT A REFERENCE TO THE MODEL ──────────────────────────
/// The intent cannot so much as name `LoggerModel` for the reason above, and a
/// closure is the smallest thing that crosses that line: `LiveActivityController`
/// installs one for exactly as long as it has a card on screen, and captures the
/// model weakly inside it so a finished session is not kept alive by a global.
@MainActor
enum RestSkip {
    static var handler: (() -> Void)?
}

/// Tapped on the Lock Screen card or in the expanded Dynamic Island.
///
/// ── WHY `LiveActivityIntent` AND NOT `AppIntent` ────────────────────────────
/// A plain `AppIntent` tapped from a widget is performed by the WIDGET's
/// process, which has a read-only copy of the database and no session state at
/// all — it could not stop a clock that only exists in the app's memory. A
/// `LiveActivityIntent` is documented to run in the app's own process, without
/// foregrounding it, which is the entire reason this button can be a button
/// rather than a deep link that yanks you into the app between sets.
struct RestSkipIntent: LiveActivityIntent {

    static let title: LocalizedStringResource = "Skip Rest"

    /// Never offered as a Shortcuts action: it does nothing at all without a
    /// running rest clock, and a shortcut that is a no-op twenty-three hours a
    /// day is worse than no shortcut.
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        let handled = await MainActor.run { () -> Bool in
            guard let skip = RestSkip.handler else { return false }
            skip()
            return true
        }
        if handled { return .result() }

        // ── AND WHY THERE IS A SECOND PATH ──────────────────────────────────
        // "The app's process" may be one the system cold-launched into the
        // background purely to serve this tap — after a jetsam, which this app
        // has a crash log for. That process owns the activity and has no
        // workout in memory, so the mailbox above is empty. Clearing the clock
        // on the card is then the only true thing left to do, and it is worth
        // doing: a skip button that is silently dead after the very crash that
        // makes people reach for it is the failure this whole feature exists to
        // prevent.
        for activity in Activity<HelixWorkoutAttributes>.activities {
            var state = activity.content.state
            // ActivityKit budgets updates, so never spend one on a card that
            // was not counting anything down.
            guard state.restEndsAt != nil else { continue }
            state.restEndsAt = nil
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }
        return .result()
    }
}
