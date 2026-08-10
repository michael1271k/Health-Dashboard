import Foundation
#if os(iOS)
import ActivityKit
#endif

/// The contract between the app (which starts and updates the Live Activity)
/// and the widget extension (which draws it).
///
/// ── TARGET MEMBERSHIP ────────────────────────────────────────────────────────
/// This file must belong to BOTH the `App` target and `HelixWidgetsExtension`,
/// exactly like `HelixSnapshot.swift` beside it. ActivityKit matches the
/// activity to its UI by the `ActivityAttributes` TYPE, so if the two targets
/// compile different copies — or only one compiles it — the Activity starts and
/// renders nothing, with no error anywhere. Set membership in Xcode's File
/// Inspector; there is no way to express it from this repo.
///
/// ── NO APP GROUP IS NEEDED ───────────────────────────────────────────────────
/// Unlike the home-screen widget, which fetches `HelixSnapshot` over HTTP,
/// a Live Activity's state travels through ActivityKit itself. Nothing is
/// written to shared storage, so this adds no entitlement.
#if os(iOS)
struct HelixSessionAttributes: ActivityAttributes {
    /// Fixed for the life of the activity — set once at `start`.
    let dayLabel: String        // "Upper A"
    let startedAt: Date

    /// Everything that can change while the session runs.
    struct ContentState: Codable, Hashable {
        let exercise: String        // the lift you are on
        let setsDone: Int
        let setsPlanned: Int
        let lastSet: String?        // "80kg × 8" — what you just logged
        let prCount: Int            // records claimed so far this session

        /// When the current rest period ends, or nil if you are not resting.
        ///
        /// ── THIS IS A DATE, NOT A COUNT OF SECONDS, AND THAT IS THE WHOLE
        /// ── DESIGN ───────────────────────────────────────────────────────────
        /// The widget renders it with `Text(timerInterval:)`, which means the OS
        /// animates the countdown on its own. Sending a remaining-seconds
        /// integer instead would need one update per second, and ActivityKit
        /// budgets updates hard — a per-second cadence is throttled within
        /// moments and the timer visibly freezes. One update per rest period
        /// buys a countdown that ticks for the whole period.
        let restEndsAt: Date?
    }
}
#endif
