import Foundation
import OnyxUI
import OnyxCore

/// The six headings a library is browsed by.
///
/// ── WHY SIX AND NOT SIXTEEN ─────────────────────────────────────────────────
/// `LandmarkMuscle` is the unit the app SCORES in — sixteen of them, because
/// that is the resolution a weekly set target needs. It is the wrong unit to
/// browse by: sixteen sections for thirty exercises is a list where most
/// headings have one row under them, and "Front delts" is not how anybody looks
/// for the overhead press.
///
/// ── AND WHY IT IS DERIVED, NOT DECLARED ─────────────────────────────────────
/// The mapping is a fold of the enum, so a landmark added to `LandmarkMuscle`
/// is a compile error here rather than a muscle that silently lands in "Other".
/// The web app keeps the same six in `charts/muscleAggregate.ts`; that module is
/// a Wave 7 port, and when it lands this collapses into it rather than becoming
/// a second opinion.
enum MuscleGroup: String, CaseIterable, Identifiable, Sendable {
    case chest = "Chest"
    case back = "Back"
    case shoulders = "Shoulders"
    case arms = "Arms"
    case legs = "Legs"
    case core = "Core"
    /// A movement the map has no answer for. Named honestly rather than
    /// guessed into a group — a wrong heading is worse than an unsorted one.
    case other = "Other"

    var id: String { rawValue }

    init(_ muscle: LandmarkMuscle) {
        switch muscle {
        case .chest:
            self = .chest
        case .lats, .upperBack, .lowerBack:
            self = .back
        case .frontDelts, .sideDelts, .rearDelts:
            self = .shoulders
        case .biceps, .triceps, .forearms:
            self = .arms
        case .quads, .hamstrings, .glutes, .adductors, .calves:
            self = .legs
        case .absCore:
            self = .core
        }
    }

    /// Which group an exercise belongs to, by NAME.
    ///
    /// The name, not the `exercises` row: the local catalogue carries only an id
    /// and a name — the server's `muscle_groups` column is a cache that has gone
    /// stale, and stale rows are exactly why half that table is junk. The map is
    /// the answer, and it was bought by reconciling a real training week against
    /// Hevy, line by line.
    static func forExercise(_ name: String) -> MuscleGroup {
        guard let first = MuscleMap.primaryLandmarks(name).first else { return .other }
        return MuscleGroup(first)
    }

    /// The accent this group draws in, so the library and the atlas agree.
    var domain: OnyxDomain {
        switch self {
        case .chest, .shoulders, .arms: .train
        case .back, .legs:              .body
        case .core:                     .recover
        case .other:                    .recover
        }
    }
}
