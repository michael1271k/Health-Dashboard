import Foundation

/// Exercise alias map — a port of `src/lib/exercises/aliases.ts`.
///
/// Historical and variant names → canonical catalogue names. Keys are
/// lower-case + trimmed. Every entry is a rename or a merge that was performed
/// deliberately; the web module's header explains why a *speculative* alias is
/// now a data-loss bug rather than a display bug (the archive that made a wrong
/// alias reversible is gone). Add a key only for a rename or merge you are
/// performing on purpose — and add it on BOTH sides, because the golden vector
/// `exercise-aliases.json` requires this table to equal the TypeScript one.
///
/// `PrSeed` keys its record book on the canonical name, so a port that does
/// not resolve `Cable Lateral Raise` to `Single Arm Lateral Raise (Cable)`
/// drops two asserted records on the floor.
public enum ExerciseAliases {
    public static let table: [String: String] = [
        // Hevy has no neutral-grip lat pulldown — close grip is the stand-in.
        "lat pulldown - close grip (cable)": "Neutral-Grip Lat Pulldown",
        "lat pulldown close grip (cable)": "Neutral-Grip Lat Pulldown",
        "close grip lat pulldown (cable)": "Neutral-Grip Lat Pulldown",
        // Renamed 2026-08-01.
        "hack/smith squat": "Hack Squat",
        "smith squat": "Hack Squat",
        // One machine, one row (merged 2026-08-01).
        "chest press machine": "Chest Press (Machine)",
        "machine chest press": "Chest Press (Machine)",
        "leg press horizontal": "Leg Press",
        "leg press horizontal (machine)": "Leg Press",
        // Seated Cable Row is the one exception — the grips are different
        // lifts on different days, so the aliases RESOLVE the variant rather
        // than erase it (2026-08-06).
        "seated cable row (v grip)": "Seated Cable Row (V-Grip)",
        "seated cable row v-grip": "Seated Cable Row (V-Grip)",
        "seated cable row - v-bar": "Seated Cable Row (V-Grip)",
        "seated cable row - bar wide grip": "Seated Cable Row (Wide Grip)",
        "seated cable row (wide bar)": "Seated Cable Row (Wide Grip)",
        "wide-grip cable row": "Seated Cable Row (Wide Grip)",
        // Same station, two names (merged 2026-08-02).
        "cable lateral raise": "Single Arm Lateral Raise (Cable)",
        "single arm cable lateral raise": "Single Arm Lateral Raise (Cable)",
        "sa lateral raise (cable)": "Single Arm Lateral Raise (Cable)",
        "sa lateral raise": "Single Arm Lateral Raise (Cable)",
        // Empty duplicate, deleted 2026-08-03.
        "incline db bench press": "Incline DB Press",
        "incline dumbbell bench press": "Incline DB Press",
        "incline dumbbell press": "Incline DB Press",
    ]

    /// Lower-case + trim, look up, else hand the RAW name back unchanged —
    /// case and padding included. `canonicalExerciseName` in the TypeScript.
    public static func canonicalName(_ raw: String) -> String {
        table[raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)] ?? raw
    }
}
