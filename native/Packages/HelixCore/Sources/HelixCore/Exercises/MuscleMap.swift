import Foundation

/// The authoritative primary+secondary movers per exercise — a port of
/// `src/lib/exercises/muscleMap.ts`. Matched by order-independent keyword
/// tokens; ALL tokens must appear and the longest matching phrase wins (first
/// on a tie). Parentheses are separators, not deletions.
public struct MuscleDictEntry: Codable, Sendable, Equatable {
    public var tokens: [String]
    public var muscles: MoverTokens
}

public enum MuscleMap {
    static func e(_ tokens: [String], _ primary: [String], _ secondary: [String] = []) -> MuscleDictEntry {
        MuscleDictEntry(tokens: tokens, muscles: MoverTokens(primary: primary, secondary: secondary))
    }

    public static let dict: [MuscleDictEntry] = [
        // Quads
        e(["leg", "press", "horizontal"], ["quadriceps"], ["glutes", "hamstrings"]),
        e(["leg", "press"], ["quadriceps"], ["glutes", "hamstrings"]),
        e(["hack", "squat"], ["quadriceps"], ["glutes", "hamstrings"]),
        e(["leg", "extension"], ["quadriceps"]),
        // Posterior chain
        e(["seated", "leg", "curl"], ["hamstrings"], ["calves"]),
        e(["leg", "curl"], ["hamstrings"], ["calves"]),
        e(["romanian", "deadlift"], ["hamstrings"], ["glutes", "lower back", "upper back", "lats", "forearms"]),
        e(["rdl"], ["hamstrings"], ["glutes", "lower back", "upper back", "lats", "forearms"]),
        e(["hip", "thrust"], ["glutes"], ["hamstrings", "quadriceps", "adductors"]),
        e(["hip", "adduction"], ["adductors"]),
        e(["adductor"], ["adductors"]),
        // Calves
        e(["calf", "press"], ["calves"]),
        e(["calf", "raise"], ["calves"]),
        // Abs / core
        e(["crunch"], ["abdominals"]),
        e(["reverse", "crunch"], ["abdominals"]),
        e(["bicycle", "crunch"], ["abdominals"], ["obliques"]),
        e(["hanging", "knee", "raise"], ["abdominals"]),
        e(["leg", "raise"], ["abdominals"]),
        e(["hollow", "rock"], ["abdominals"]),
        e(["russian", "twist"], ["obliques"], ["abdominals"]),
        e(["side", "plank"], ["obliques"], ["abdominals"]),
        // Chest
        e(["incline", "bench", "press", "dumbbell"], ["chest"], ["triceps", "front_delts"]),
        e(["incline", "db", "press"], ["chest"], ["triceps", "front_delts"]),
        e(["chest", "press"], ["chest"], ["triceps", "front_delts"]),
        e(["pec", "deck"], ["chest"]),
        e(["butterfly"], ["chest"]),
        e(["cable", "crossover"], ["chest"]),
        e(["cable", "fly"], ["chest"]),
        // Back
        e(["lat", "pulldown"], ["lats"], ["upper back", "biceps", "forearms"]),
        e(["lat", "pulldown", "neutral"], ["lats"], ["upper back", "biceps", "forearms"]),
        e(["lat", "pulldown", "close"], ["lats"], ["upper back", "biceps", "forearms"]),
        e(["cable", "row"], ["upper back"], ["lats", "traps", "biceps", "forearms"]),
        e(["seated", "cable", "row", "wide"], ["upper back"], ["lats", "traps", "biceps", "forearms"]),
        e(["seated", "cable", "row", "v"], ["upper back"], ["lats", "biceps", "forearms"]),
        e(["straight", "arm", "pulldown"], ["lats"], ["triceps"]),
        // Delts
        e(["face", "pull"], ["rear_delts"], ["biceps"]),
        e(["shoulder", "press"], ["front_delts"], ["triceps"]),
        e(["lateral", "raise"], ["side_delts"]),
        // Triceps
        e(["triceps", "pushdown"], ["triceps"]),
        e(["triceps", "extension"], ["triceps"]),
        e(["overhead", "extension"], ["triceps"]),
        e(["overhead", "triceps"], ["triceps"]),
        e(["cable", "extension"], ["triceps"]),
        // Biceps / forearms
        e(["hammer", "curl"], ["biceps"], ["forearms"]),
        e(["neutral", "grip", "curl"], ["biceps"], ["forearms"]),
        e(["reverse", "curl"], ["biceps"], ["forearms"]),
        e(["wrist", "curl"], ["forearms"]),
        e(["preacher", "curl"], ["biceps"]),
        e(["incline", "curl"], ["biceps"]),
        e(["bicep", "curl"], ["biceps"]),
        e(["biceps", "curl"], ["biceps"]),
    ]

    /// Lower-case, every non-[a-z0-9] run becomes a space, split on whitespace.
    static func tokenize(_ name: String) -> Set<String> {
        let lowered = name.lowercased()
        var out = ""
        var pendingSpace = false
        for ch in lowered.unicodeScalars {
            let isWord = (ch.value >= 0x61 && ch.value <= 0x7A) || (ch.value >= 0x30 && ch.value <= 0x39)
            if isWord {
                if pendingSpace { out.append(" "); pendingSpace = false }
                out.unicodeScalars.append(ch)
            } else {
                pendingSpace = true
            }
        }
        // Leading separators produce nothing (JS trims); an empty name yields {""} in JS,
        // which matches no entry — an empty set behaves identically here.
        return Set(out.split(separator: " ").map(String.init))
    }

    /// The most specific entry whose tokens are all present, or nil.
    public static func lookup(_ name: String) -> MoverTokens? {
        let nameTokens = tokenize(name)
        var best: (MoverTokens, Int)? = nil
        for entry in dict where entry.tokens.allSatisfy({ nameTokens.contains($0) }) {
            if best == nil || entry.tokens.count > best!.1 { best = (entry.muscles, entry.tokens.count) }
        }
        return best?.0
    }

    /// Flat tags, primary first, or nil.
    public static func muscleGroups(for name: String) -> [String]? {
        lookup(name).map { $0.primary + $0.secondary }
    }

    /// Resolved by NAME first, falling back to the stored `muscle_groups` column
    /// ([0] = primary, rest = secondary).
    public static func resolveMovers(_ name: String, stored: [String]? = nil) -> MoverTokens {
        if let entry = lookup(name) { return entry }
        let tags = stored ?? []
        return MoverTokens(primary: Array(tags.prefix(1)), secondary: Array(tags.dropFirst()))
    }
}
