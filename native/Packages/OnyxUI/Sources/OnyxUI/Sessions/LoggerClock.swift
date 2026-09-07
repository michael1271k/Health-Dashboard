import Foundation
import OnyxCore

/// The logger's session clock, until `LoggerModel` owns one.
///
/// ── WHY THIS EXISTS AND WHAT ENDS IT ────────────────────────────────────────
/// Wave U1 built the hero, the timer sheet and the Live Activity's paused face
/// against `PauseControlling` (`OnyxUI/Sessions/LoggerSeams.swift`) while wave
/// E4 was building the engine that will answer it — in `LoggerModel.swift`,
/// which U1 may not touch. This is the honest stand-in: it implements the
/// protocol's whole contract correctly, in memory, for the life of the screen.
///
/// What it CANNOT do is the reason it is temporary: nothing here is written to
/// `set_events`, so a pause does not survive a relaunch and `duration_min` at
/// close is still `ended − started` with the pause inside it. E4 item 5 is what
/// makes the number true; when `LoggerModel` conforms, this file is deleted and
/// `LiveLoggerView` changes one line — the `@State` it builds.
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
