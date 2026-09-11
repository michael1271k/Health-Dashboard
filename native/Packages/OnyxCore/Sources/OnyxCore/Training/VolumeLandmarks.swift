import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// The MEV table — where a NEW account's weekly set targets come from.
//
// ── WHY A TABLE AND NOT THE CHOSEN PLAN'S NUMBERS ───────────────────────────
// `plan-templates.json` carries `volumeTargets` for each of the three bundled
// plans, and reusing them here would have been one line. They are the FOUNDER'S
// numbers: the volume his plan actually delivers, tuned against his own recovery
// over a year. Handing them to a stranger as "your targets" is the whole class
// of thing W2 spent a wave deleting — a second athlete inheriting the first
// one's constants and never being told.
//
// So onboarding seeds from published volume landmarks instead, and the
// difference is honest: the plan describes what you will DO, the target
// describes what you are AIMING at, and a beginner running ONYX-5 should not be
// told his chest target is thirteen sets because someone else's is.
//
// The numbers are Renaissance Periodization's landmark ranges (Israetel et al.),
// rounded to whole sets. MEV is the minimum that still grows; MAV is the middle
// of the productive range. Onboarding shows them, and every one is editable on
// the next screen — this is a STARTING POINT, not a prescription, and the screen
// says so.
//
// ── THE TWO COLUMNS ARE THE TWO PHASES, NOT TWO OPINIONS ────────────────────
// A cut holds muscle on less volume than a bulk builds it on, which is why
// `plan_phase_volume` is keyed by phase at all. Cut and maintain both seed from
// MEV — on a deficit the job is to keep what you have, and the extra sets buy
// fatigue you cannot recover from. Bulk seeds from MAV.
//
// Front delts and adductors sit at the bottom on purpose. Pressing already
// feeds the front delt, and most lower-body work already feeds the adductor, so
// their DIRECT requirement is near zero; a table that pretended otherwise would
// have a new user adding isolation work to hit a number that the rest of the
// session already met.
// ─────────────────────────────────────────────────────────────────────────────

/// Weekly working-set landmarks for one muscle.
public struct VolumeLandmark: Equatable, Sendable {
    /// Minimum effective volume — the fewest hard sets a week that still
    /// produces growth.
    public var mev: Int
    /// Maximum adaptive volume, mid-range — where most people grow fastest
    /// before recovery becomes the limit.
    public var mav: Int

    public init(mev: Int, mav: Int) {
        self.mev = mev
        self.mav = mav
    }

    /// The target for a phase. A cut and a maintenance block both hold at MEV;
    /// only a bulk reaches for MAV.
    public func target(for phase: ProgramPhase) -> Int {
        phase == .bulk ? mav : mev
    }
}

public enum VolumeLandmarks {

    /// The sixteen, keyed by the landmark the rest of the app counts in.
    ///
    /// Every `LandmarkMuscle` has an entry, because a muscle missing from this
    /// table would seed a target of zero and then read as "you have met it" for
    /// the life of the account.
    public static let table: [LandmarkMuscle: VolumeLandmark] = [
        .chest:       VolumeLandmark(mev: 8,  mav: 12),
        .lats:        VolumeLandmark(mev: 10, mav: 14),
        .upperBack:   VolumeLandmark(mev: 8,  mav: 12),
        // Trained hard by every hinge and row already; the direct requirement
        // is a couple of sets, not a session.
        .lowerBack:   VolumeLandmark(mev: 2,  mav: 4),
        .frontDelts:  VolumeLandmark(mev: 4,  mav: 6),
        .sideDelts:   VolumeLandmark(mev: 8,  mav: 16),
        .rearDelts:   VolumeLandmark(mev: 6,  mav: 12),
        .biceps:      VolumeLandmark(mev: 8,  mav: 14),
        .triceps:     VolumeLandmark(mev: 6,  mav: 10),
        .forearms:    VolumeLandmark(mev: 2,  mav: 8),
        .quads:       VolumeLandmark(mev: 8,  mav: 12),
        .hamstrings:  VolumeLandmark(mev: 6,  mav: 10),
        .glutes:      VolumeLandmark(mev: 4,  mav: 8),
        .adductors:   VolumeLandmark(mev: 2,  mav: 4),
        .calves:      VolumeLandmark(mev: 8,  mav: 12),
        .absCore:     VolumeLandmark(mev: 6,  mav: 12),
    ]

    /// The starting target for every landmark, in declaration order.
    ///
    /// Declaration order rather than dictionary order so the onboarding list
    /// and the Weekly-set-volume screen read down the body in the same
    /// sequence — `LandmarkMuscle.allCases` is that order and is load-bearing
    /// (see `Landmarks.swift`).
    public static func starting(for phase: ProgramPhase) -> [(muscle: LandmarkMuscle, sets: Int)] {
        LandmarkMuscle.allCases.map { muscle in
            (muscle, table[muscle]?.target(for: phase) ?? 0)
        }
    }

    /// Total weekly hard sets the starting table asks for. Shown in onboarding
    /// so the number is a decision rather than a surprise on week one.
    public static func weeklyTotal(for phase: ProgramPhase) -> Int {
        starting(for: phase).reduce(0) { $0 + $1.sets }
    }
}
