import Foundation

/// The six muscle families — the fold in `src/lib/theme/muscleHue.ts`
/// (`familyOf`). Colours are NOT ported; they are OnyxUI tokens.
public enum MuscleFamily: String, CaseIterable, Codable, Sendable {
    case chest = "Chest", back = "Back", shoulders = "Shoulders", arms = "Arms", legs = "Legs", core = "Core"

    public static func of(_ muscle: LandmarkMuscle) -> MuscleFamily {
        switch muscle {
        case .chest: return .chest
        case .lats, .upperBack, .lowerBack: return .back
        case .frontDelts, .sideDelts, .rearDelts: return .shoulders
        case .biceps, .triceps, .forearms: return .arms
        case .quads, .hamstrings, .glutes, .adductors, .calves: return .legs
        case .absCore: return .core
        }
    }
}
