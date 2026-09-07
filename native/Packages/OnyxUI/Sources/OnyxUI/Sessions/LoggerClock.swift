import Foundation
import Observation
import OnyxCore

/// An in-memory session clock: the previews' and the tests' `PauseControlling`.
///
/// ── IT WAS THE APP'S CLOCK FOR ONE WAVE ─────────────────────────────────────
/// U1 built the hero, the timer sheet and the Live Activity's paused face
/// against `PauseControlling` while E4 built the engine that answers it, and
/// this stood in between the two. Since E4, `LoggerModel` conforms: a pause is
/// an event in `set_events`, so it survives a relaunch and `closeSession`
/// subtracts it from `duration_min`.
///
/// It is kept because it is still the right thing for a preview and a test —
/// a correct clock with no store, no session row and no migration behind it,
/// which is exactly what `#Preview` and `LoggerClockTests` want. What it must
/// not be again is the app's: nothing here is written down.
///
/// ── AND WHY IT IS NOT CALLED `SessionClock` ─────────────────────────────────
/// `OnyxCore.SessionClock` is already taken, by the port of the web's REST
/// clock (`sessionClock.ts`) — a countdown with a duration and a mode. This one
/// is the workout's own elapsed time. Two clocks, two names; the arithmetic
/// they share (banked pauses, an open segment, `m:ss` with hours only when
/// there are hours) is `SessionElapsed` and `Clock.format`, and this type
/// borrows the second rather than writing a third copy of it.
@MainActor
@Observable
public final class LoggerClock: PauseControlling {
    public private(set) var startedAt: Date
    public private(set) var pausedAt: Date?
    public private(set) var pausedTotal: TimeInterval = 0

    public init(startedAt: Date) {
        self.startedAt = startedAt
    }

    /// Idempotent, because the button and the Lock Screen can both send it.
    public func pause() {
        guard pausedAt == nil else { return }
        pausedAt = Date()
    }

    public func resume() {
        guard let began = pausedAt else { return }
        pausedTotal += Date().timeIntervalSince(began)
        pausedAt = nil
    }

    /// A start instant that would put the clock in the future is clamped to
    /// zero elapsed rather than refused: the wheel is a coarse control and
    /// spinning one minute past `now` should read as "just started", not count
    /// backwards. `Text(_:style:.timer)` counts DOWN from a future date, which
    /// is the visible failure this prevents.
    ///
    /// The ceiling anchors on `pausedAt ?? Date()`, the SAME instant `elapsed`
    /// and `setElapsed` use. Clamping against `Date()` instead let every start
    /// inside the current pause through, and every one of them made
    /// `pausedAt − startedAt − pausedTotal` negative — which `max(0, …)` then
    /// rendered as a confident 0:00. Pause, then correct the start, is exactly
    /// the flow `TimerSheet` exists for.
    public func setStart(_ date: Date) {
        startedAt = min(date, (pausedAt ?? Date()).addingTimeInterval(-pausedTotal))
    }

    /// Move `startedAt` so that `elapsed` reads `seconds`.
    ///
    /// The pause ledger is deliberately untouched. Banking the difference there
    /// instead would make "edit elapsed" also edit how long you had rested,
    /// and `duration_min` would come out right for a reason nobody could find.
    public func setElapsed(_ seconds: TimeInterval) {
        let anchor = pausedAt ?? Date()
        startedAt = anchor.addingTimeInterval(-(max(0, seconds) + pausedTotal))
    }
}
