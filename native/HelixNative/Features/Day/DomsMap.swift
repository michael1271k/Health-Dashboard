import HelixCore

/// The nine DOMS muscle groups, their four severity words, and how each group
/// spreads across the atlas.
///
/// Data, ported from `DOMS_MUSCLES` / `DOMS_LEVELS` in
/// `src/lib/hooks/useRecovery.ts` and `DOMS_TO_LANDMARK` / `domsToWorked` in
/// `src/lib/body/atlas.ts`. The group is what the user rates (a sore arm is a
/// sore arm); the landmarks are what the figure draws. Severity 0…3 becomes
/// intensity 0…1 because the atlas draws AMOUNT and passes no verdicts.
enum DomsMap {

    /// Display order: upper, trunk, lower — as the web lists them.
    static let muscles = ["Chest", "Back", "Arms", "Shoulders", "Abs", "Glutes", "Quads", "Hamstrings", "Calves"]

    /// Index IS the stored severity.
    static let levels = ["None", "Mild", "Moderate", "Severe"]

    static let maxSeverity = 3

    static let landmarks: [String: [LandmarkMuscle]] = [
        "Chest": [.chest],
        "Back": [.lats, .upperBack, .lowerBack],
        "Arms": [.biceps, .triceps, .forearms],
        "Shoulders": [.frontDelts, .sideDelts, .rearDelts],
        "Abs": [.absCore],
        "Glutes": [.glutes],
        "Quads": [.quads],
        "Hamstrings": [.hamstrings],
        "Calves": [.calves],
    ]

    /// `domsToWorked` — group → severity becomes landmark → 0…1, max-merged.
    static func worked(_ severity: [String: Int]) -> [LandmarkMuscle: Double] {
        var out: [LandmarkMuscle: Double] = [:]
        for (muscle, s) in severity where s > 0 {
            let intensity = min(1, max(0, Double(s) / Double(maxSeverity)))
            for landmark in landmarks[muscle] ?? [] {
                out[landmark] = max(out[landmark] ?? 0, intensity)
            }
        }
        return out
    }

    /// "Quads moderate · Chest mild", in display order; nil when nothing is sore.
    static func summary(_ severity: [String: Int]) -> String? {
        let sore = muscles.compactMap { m -> String? in
            guard let s = severity[m], s > 0, s < levels.count else { return nil }
            return "\(m) \(levels[s].lowercased())"
        }
        return sore.isEmpty ? nil : sore.joined(separator: " · ")
    }
}
