import Foundation
import OnyxCore

/// The two seams the logger's chrome is built against.
///
/// ── WHY THEY ARE HERE AND NOT ON `LoggerModel` ──────────────────────────────
/// The hero, the timer sheet and the Live Stats cards were built (wave U1) while
/// the session engine that answers them was being built beside it (wave E4), by
/// a different track, in a file this one may not touch. A protocol is the only
/// thing both waves can hold at once: U1 declares what it needs to DRAW, ships a
/// small conformance that is honest about what it can already answer, and E4
/// re-points the same views at `LoggerModel` by adding a conformance and
/// deleting the stand-in. No view changes when that happens, which is the whole
/// reason the seam is worth its two protocols.
///
/// This is the ONE abstraction the logger buys with a single implementation, and
/// it is bought for a scheduling reason rather than an architectural one. When
/// E4 has landed, `LoggerModel` is the only conformance and it stays that way —
/// a second one would mean the logger had grown a second session engine.
///
/// They live in `OnyxUI` because that is what the views can see: `OnyxUI`
/// depends on `OnyxCore` and nothing else, so neither protocol may name a
/// database type. `LivePrRecord` is therefore a plain value the engine fills in,
/// not a window onto `PrBaselines`.

// MARK: - Pause

/// A session clock that can be stopped, restarted and corrected.
///
/// ── THE ONE INVARIANT ───────────────────────────────────────────────────────
/// `elapsed` is derived from three stored facts and never itself stored:
///
///     elapsed = (pausedAt ?? now) − startedAt − pausedTotal
///
/// A decrementing or accumulating counter drifts, and worse, it is wrong after a
/// backgrounding — iOS suspends this app between sets routinely, and a counter
/// resumes where it stopped while an instant is simply late. This is the same
/// rule `restEndsAt` already follows for the rest clock.
///
/// `timerOrigin` exists so the running case costs nothing: `Text(_:style:.timer)`
/// is counted by the SYSTEM, and shifting its origin forward by the time already
/// banked in pauses is what makes a paused-and-resumed session read correctly
/// without this view tree waking once a second to say so.
@MainActor
public protocol PauseControlling: AnyObject {
    /// When the session began. Moves when the clock is corrected.
    var startedAt: Date { get }
    /// When the CURRENT pause began; `nil` while running. Not the same as a
    /// pause of zero length, and the timer draws the two differently.
    var pausedAt: Date? { get }
    /// Time banked in pauses that have already ended.
    var pausedTotal: TimeInterval { get }

    func pause()
    func resume()

    /// Move the start instant; elapsed follows it.
    func setStart(_ date: Date)
    /// Set elapsed directly. The implementation moves `startedAt` to satisfy the
    /// invariant above — it must never bank the difference in `pausedTotal`,
    /// which would make "edit elapsed" quietly also edit the pause ledger.
    func setElapsed(_ seconds: TimeInterval)
}

public extension PauseControlling {
    var isPaused: Bool { pausedAt != nil }

    /// The instant a system timer counts up from, pauses already subtracted.
    var timerOrigin: Date { startedAt.addingTimeInterval(pausedTotal) }

    /// Seconds of session, pauses removed. Frozen at the pause instant while
    /// paused, which is what makes a paused clock a reading rather than a stall.
    ///
    /// The same shape as `SessionElapsed.activeSec` — banked pauses plus the one
    /// still open, taken off the wall clock — expressed in `Date`s because a
    /// view holds instants rather than the epoch milliseconds the store does.
    func elapsed(at now: Date = Date()) -> TimeInterval {
        max(0, (pausedAt ?? now).timeIntervalSince(timerOrigin))
    }
}

// MARK: - Live records

/// A record claimed by a set that has already been ticked green.
///
/// One entry per AXIS, not per set: a single set can take the weight record and
/// the estimated-1RM record at once, and a card that collapsed them would say
/// "1 PR" where the ledger written at close says two.
public struct LivePrRecord: Identifiable, Equatable, Sendable {
    /// `"<set key>|<axis>"`. Stable across a redraw so the list does not
    /// reshuffle under the reader between two ticks.
    public var id: String
    /// The movement's display name — "Neutral-Grip Lat Pulldown".
    public var exercise: String
    /// Which set of it: "Set 2".
    public var setLabel: String
    public var axis: PrAxis
    /// The new mark.
    public var value: Double
    /// The mark it beat. A record REQUIRES a baseline, so this is never absent —
    /// and printing what was beaten is the whole difference between a trophy and
    /// a number.
    public var previous: Double

    public init(
        id: String, exercise: String, setLabel: String,
        axis: PrAxis, value: Double, previous: Double
    ) {
        self.id = id
        self.exercise = exercise
        self.setLabel = setLabel
        self.axis = axis
        self.value = value
        self.previous = previous
    }
}

/// Whatever knows which records this session has claimed so far.
@MainActor
public protocol LivePrProviding: AnyObject {
    /// Newest first. Empty is the honest answer for most of a session and the
    /// card says so in words rather than drawing a zero.
    var livePrs: [LivePrRecord] { get }
}

public extension PrAxis {
    /// What the axis is called on a card. `e1rm` is the one that has to be
    /// spelled out — "E1RM" beside "Weight" and "Reps" reads as a typo.
    var displayName: String {
        switch self {
        case .weight: "Heaviest"
        case .reps:   "Most reps"
        case .volume: "Set tonnage"
        case .e1rm:   "Est. 1RM"
        }
    }

    /// The unit the value carries, for the card's suffix. Reps have none.
    var unit: String {
        switch self {
        case .weight, .volume, .e1rm: "kg"
        case .reps: ""
        }
    }
}
