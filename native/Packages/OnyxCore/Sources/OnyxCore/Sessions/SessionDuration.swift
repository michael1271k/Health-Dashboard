import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// How long the workout actually took — the ONE rule, for both clients. A port
// of `src/lib/sessions/sessionDuration.ts`; vector `session-duration.json`.
//
// WHY THIS EXISTS: THE 385-MINUTE SESSION. 2026-09-06's Upper A is stored as
// `duration_min = 385` for about an hour of work. Nobody typed that. It is what
// happens when a wall-clock span is used as a duration: the web's
// `buildCommitPayload` derives `endedAt` as `startedAt + duration + PAUSE` (and
// it is right to — `ended_at` answers "when did you walk out"), then `save.ts`
// derives `duration_min` as `endedAt − startedAt` whenever the finish sheet
// supplied none. The pause is added and then counted. The sheet supplies none
// once the deck has been open longer than six hours, because `sessionElapsedSec`
// correctly refuses to answer for a span that long — so the exact case the
// fallback exists for is the case where it is most wrong.
//
// THE RULE: `ended − started − paused`, then the LONG-IDLE guard. A last set
// logged more than `longIdleMin` before the finish means the tail was not
// training; what is counted instead is the work plus one rest.
//
// `duration_min` feeds `ReadinessHistoryBuilder`'s 49-day window, so one number
// like 385 moves the battery for the next 48 days.
// ─────────────────────────────────────────────────────────────────────────────

public struct SessionDurationResult: Codable, Equatable, Sendable {
    /// Whole minutes, for `workout_sessions.duration_min`. Nil when the span is
    /// not a real answer — an unparseable instant, or a finish before the start.
    public var minutes: Double?
    /// Whole minutes spent paused.
    public var pausedMin: Double
    /// Dead minutes between the last set and the finish, when the guard fired.
    public var idleMin: Double?
    /// True when the long-idle guard shortened the answer.
    public var capped: Bool
}

public enum SessionDuration {
    /// A gap this long between the last set and the finish is not training.
    public static let longIdleMin: Double = 20

    /// The rest credited after the last set when the guard fires.
    /// `ProgramExercise.restSec` is per movement and the caller passes it when
    /// it has one; this is the fallback for a movement that prescribes none.
    public static let defaultRestTargetSec: Double = 180

    private static let minute: Double = 60

    /// Instants, not ISO strings: the phone has `Date`s in hand and parsing
    /// them back out of text would be a second format to keep in step. The
    /// vector feeds ISO strings, which the test decodes.
    public static func compute(
        startedAt: Date?,
        endedAt: Date?,
        pausedSec: Double = 0,
        lastSetAt: Date? = nil,
        restTargetSec: Double? = nil
    ) -> SessionDurationResult {
        let paused = pausedSec.isFinite ? Swift.max(0, pausedSec) : 0
        let pausedMin = jsRound(paused / minute)

        guard let startedAt, let endedAt, endedAt >= startedAt else {
            return SessionDurationResult(minutes: nil, pausedMin: pausedMin, idleMin: nil, capped: false)
        }

        // The clock, less the pause. Never negative: a clock that stepped
        // backwards mid-pause must not produce a session of minus twenty
        // minutes.
        let active = Swift.max(0, (endedAt.timeIntervalSince(startedAt) - paused) / minute)

        guard let lastSetAt, lastSetAt >= startedAt, lastSetAt <= endedAt else {
            return SessionDurationResult(minutes: jsRound(active), pausedMin: pausedMin, idleMin: nil, capped: false)
        }

        let idle = endedAt.timeIntervalSince(lastSetAt) / minute
        guard idle > longIdleMin else {
            return SessionDurationResult(minutes: jsRound(active), pausedMin: pausedMin, idleMin: nil, capped: false)
        }

        // The work, plus one rest. Pauses BEFORE the last set are real gaps in
        // the work and come off; pauses after it are inside the tail being
        // discarded, so subtracting them again would take the same minutes
        // twice.
        let restMin = Swift.max(0, restTargetSec ?? defaultRestTargetSec) / 60
        let worked = Swift.max(0, lastSetAt.timeIntervalSince(startedAt) / minute - pausedMin)
        return SessionDurationResult(
            // Never longer than the uncapped answer: the guard may only shorten.
            minutes: jsRound(Swift.min(active, worked + restMin)),
            pausedMin: pausedMin,
            idleMin: jsRound(idle),
            capped: true
        )
    }
}
