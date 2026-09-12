import Foundation

/// How much of a session a muscle is still carrying.
///
/// ── WHY THIS IS NOT SORENESS, AND MUST NEVER BE CONFUSED WITH IT ────────────
/// `doms_logs` is what the user REPORTS: a number they typed about how their
/// quads feel. This is what the LEDGER IMPLIES: sets landed on a muscle, decayed
/// by how long ago they landed. They disagree constantly and both are right —
/// you can be sore in a muscle the plan barely touched, and fresh in one that
/// took twelve sets — and the disagreement is the most interesting thing either
/// of them has to say.
///
/// So the Pulse figure draws BOTH: this as the fill, the report as an outline
/// over it. A muscle filled dark with no ring is loaded and not complaining; a
/// ring with no fill is complaining about work the ledger has no record of.
///
/// ── AND WHY IT IS NOT AN INPUT TO ANY SCORE ─────────────────────────────────
/// `fatigue.ts` states the doctrine for the subjective side: a self-report that
/// moves the daily score is a number you can talk yourself into. The same
/// applies twice over to a modelled one — every historical day would be graded
/// under a rule that did not exist when it was lived. This is a picture, not a
/// term.
public enum MuscleRecovery {

    /// Hours to half-recovery, per landmark.
    ///
    /// ── WHY A TABLE AND NOT ONE CONSTANT ────────────────────────────────────
    /// A single τ is the lazy version and it is visibly wrong on the body: a
    /// heavy squat session is still in the quads on Wednesday, where the side
    /// delts that took ten sets on Monday are ready again on Tuesday. Drawing
    /// both at the same shade on the same figure teaches the reader nothing
    /// they could not get from a calendar.
    ///
    /// The ordering is mass and eccentric load, which is the axis the research
    /// on repeated-bout soreness actually varies along — big hinge-and-squat
    /// musculature slowest, small isolated heads fastest. The NUMBERS are a
    /// defensible starting point rather than a measurement, and they are in one
    /// table precisely so they can be tuned from one place when the founder's
    /// own history says otherwise.
    ///
    /// ponytail: a fixed table, not fitted per person. Learning τ from this
    /// user's own DOMS reports against their own ledger is the upgrade, and it
    /// needs a year of both before it would beat these.
    public static func halfLifeHours(_ muscle: LandmarkMuscle) -> Double {
        switch muscle {
        // The big hinge and squat musculature. Still there on day three.
        case .quads, .hamstrings, .glutes: 40
        // Large, heavily loaded, but rarely to the same eccentric depth.
        case .lats, .upperBack, .lowerBack, .chest, .adductors: 34
        // Mid-size, and the ones a push day hits indirectly all session.
        case .frontDelts, .absCore: 26
        // Small heads and high-frequency work — back before the next session.
        case .sideDelts, .rearDelts, .biceps, .triceps, .forearms, .calves: 20
        }
    }

    /// One finished session, reduced to what the decay reads.
    public struct Bout: Equatable, Sendable {
        /// Hours between the session ending and now. Negative is treated as 0 —
        /// a clock that disagrees with itself must not produce fatigue above 1.
        public var hoursAgo: Double
        /// Landmark → 0…1 share of that session, as `MuscleCredit.worked`
        /// produces: relative to the session's OWN hardest-worked muscle, so a
        /// light day and a heavy day both peak at 1.
        public var worked: [LandmarkMuscle: Double]

        public init(hoursAgo: Double, worked: [LandmarkMuscle: Double]) {
            self.hoursAgo = hoursAgo
            self.worked = worked
        }
    }

    /// Beyond this, a session contributes nothing worth drawing.
    ///
    /// Five days rather than the 48–72 hours the feature is described in: at
    /// 40-hour quads, 72 hours still leaves 29 % on the board, and truncating
    /// there would put a visible step in the figure on the third morning that
    /// nothing in the body explains.
    public static let horizonHours: Double = 120

    /// What every muscle is still carrying, 0…1.
    ///
    /// Contributions ADD across sessions and clamp at 1. Two leg days in three
    /// days is more residual fatigue than one, which is the entire reason
    /// somebody would look at this figure before choosing today's session — and
    /// a max-fold would report the two as identical.
    ///
    /// A muscle with nothing on it is ABSENT rather than zero, which is what
    /// `AtlasFigure` wants: an entry of 0 and no entry at all draw the same
    /// untrained belly, and the dictionary staying sparse keeps the difference
    /// between "recovered" and "never trained" out of the data.
    public static func fatigue(_ bouts: [Bout]) -> [LandmarkMuscle: Double] {
        var out: [LandmarkMuscle: Double] = [:]
        for bout in bouts {
            let hours = max(0, bout.hoursAgo)
            guard hours <= horizonHours else { continue }
            for (muscle, share) in bout.worked where share > 0 {
                let remaining = pow(0.5, hours / halfLifeHours(muscle))
                out[muscle, default: 0] += share * remaining
            }
        }
        return out.compactMapValues { value in
            let clamped = min(1, value)
            // Under 4 % is a muscle the figure would draw as untrained anyway,
            // and keeping it produces a dictionary that never empties — so a
            // body five days clear of any session would read as permanently
            // faintly loaded.
            return clamped >= 0.04 ? jsRound(clamped * 100) / 100 : nil
        }
    }

    /// How the app says it in words — for VoiceOver, and for the one line under
    /// the figure.
    ///
    /// Four bands and no numbers. The underlying figure is a model output with
    /// no unit anybody could check, and printing "0.62" invites a precision the
    /// estimate does not have.
    public static func label(_ fatigue: Double) -> String {
        switch fatigue {
        case ..<0.20: "Fresh"
        case ..<0.45: "Mostly recovered"
        case ..<0.75: "Still loaded"
        default: "Heavily loaded"
        }
    }

    /// The muscles most likely to limit today's session, worst first.
    public static func mostLoaded(_ fatigue: [LandmarkMuscle: Double], limit: Int = 3) -> [(LandmarkMuscle, Double)] {
        fatigue
            .filter { $0.value >= 0.45 }
            .sorted { $0.value == $1.value ? $0.key.rawValue < $1.key.rawValue : $0.value > $1.value }
            .prefix(limit)
            .map { ($0.key, $0.value) }
    }
}
