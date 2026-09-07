import Foundation
import OnyxCore

// ─────────────────────────────────────────────────────────────────────────────
// The two values that cross between the phone and the watch.
//
// ── WHY THEY ARE NOT IN `WatchLink.swift` ────────────────────────────────────
// That file is fenced `#if canImport(WatchConnectivity)`, because the framework
// exists only on iOS and watchOS. These are not transport — they are the wire
// FORMAT, and the wire format is the most version-sensitive thing in the wave:
// a watch routinely runs an older build than the phone paired to it, so a key
// that moves is a context that silently stops decoding on one wrist.
//
// Out here they compile and round-trip on macOS, which means `swift test` covers
// them on the command line with no simulator and no signing — the only
// continuously trustworthy signal this project has.
// ─────────────────────────────────────────────────────────────────────────────

/// What the watch needs to render a session before it has ever seen the network.
///
/// ── IT IS `ScheduleContext` PLUS TWO FIELDS, AND DELIBERATELY SO ────────────
/// `ScheduleContext` already resolves a date to a split — the plan, the phase,
/// the weekday layout and the dated overrides — and it is already `Codable` and
/// `Sendable` because the phone stores it. `Program.onyx5` is compiled into
/// `OnyxCore`, so with these three values the watch can name today's workout,
/// list its movements and their prescribed loads and rests, with no request to
/// anything.
///
/// The two extra fields are the ones a schedule cannot answer: whose data this
/// is, and what the phone believes today is. `today` travels rather than being
/// read from the watch's own clock because the two devices can disagree across
/// midnight, and a watch that decides it is already Tuesday would open the wrong
/// split.
public struct WatchContext: Codable, Sendable, Equatable {
    public var userId: String
    /// ISO `yyyy-MM-dd`, as the phone resolved it — `LogicalDay`, not midnight.
    public var today: String
    public var schedule: ScheduleContext

    public init(userId: String, today: String, schedule: ScheduleContext) {
        self.userId = userId
        self.today = today
        self.schedule = schedule
    }
}

/// A rest clock, as the other device sees it.
///
/// An END INSTANT rather than a remaining duration, for the same reason
/// `LoggerModel.restEndsAt` is: a duration decays in transit and again while the
/// receiving app is suspended, and both devices' `Date()` are close enough for a
/// three-minute countdown even when their clocks disagree by a second. A
/// remaining-seconds payload would arrive already wrong and would drift further
/// every time the watch slept.
public struct RestPulse: Codable, Sendable, Equatable, Identifiable {
    /// `Identifiable` so the watch can present it with `.fullScreenCover(item:)`
    /// — and keyed on the END INSTANT rather than on the session, so adding 15
    /// seconds re-presents the cover with a fresh countdown task instead of
    /// leaving the old one running against a moved target.
    public var id: Date { endsAt }

    public var sessionId: String
    /// When the countdown reaches zero.
    public var endsAt: Date
    /// The full length it started from, so the receiver can draw the arc.
    public var duration: TimeInterval
    /// The movement it follows — the watch prints "Next: …" under the clock.
    public var exercise: String?

    public init(sessionId: String, endsAt: Date, duration: TimeInterval, exercise: String? = nil) {
        self.sessionId = sessionId
        self.endsAt = endsAt
        self.duration = duration
        self.exercise = exercise
    }
}
