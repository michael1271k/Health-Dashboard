import Foundation

/// Movements trained ONE SIDE AT A TIME, so a set is two rows — an L and an R
/// sharing a `pairId`. A port of `src/lib/exercises/unilateral.ts`.
///
/// Sibling of `TimedExercise` and `Bodyweight`, and matched the same way: by
/// NAME, because the exercise catalogue has no laterality column.
///
/// ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
/// The logger's "Split L / R" button. In the web it used to be gated by a regex
/// spelled inline in a component —
///
///     /single[- ]?arm|one[- ]?arm|single[- ]?leg|per (side|arm)/i
///
/// — four alternations covering three catalogue entries, with no test, no home
/// and no way to add the movements it misses (a Bulgarian split squat, a lunge
/// and a step-up are all unilateral and none of them say "single arm").
///
/// Splitting a BILATERAL set is not a harmless mistake either: the pair is
/// scored at its WEAKER side for tonnage and counts as ONE set of work, so a
/// press split in half is logged as half a session.
///
/// ── WHY "ALTERNATING" IS NOT HERE ───────────────────────────────────────────
/// An alternating curl is performed one arm at a time but logged as one set of
/// N total reps, which is the opposite of what a pair records. The rule is not
/// "does one limb move at a time" — it is "does this set produce two
/// independent loads worth tracking apart".
public enum Unilateral {

    /// The tell-tales. Anchored loosely — these words are qualifiers and can
    /// sit anywhere in a name — but specifically enough that no bilateral
    /// movement in the catalogue contains one.
    static let unilateralPatterns: [String] = [
        // "Single Arm", "Single-Leg", "One Arm", "1-Arm"
        #"\b(single|one|1)[-\s]?(arm|armed|leg|legged|side)\b"#,
        #"\bunilateral\b"#,
        // Rep strings and free-typed names carry the qualifier as a suffix.
        #"\bper\s+(side|arm|leg)\b"#,
        #"\b(each|ea)\s+(side|arm|leg)\b"#,
        // Movements that are unilateral by definition and never say so.
        #"\bbulgarian\b"#,
        #"\bsplit\s+squats?\b"#,
        #"\blunges?\b"#,
        #"\bstep[-\s]?ups?\b"#,
        #"\bpistol\s+squats?\b"#,
        #"\bskater\s+squats?\b"#,
        #"\bcopenhagen\b"#,
        #"\bsuitcase\s+(carry|carries|deadlift)\b"#,
        #"\bside\s+planks?\b"#,
    ]

    /// Names that contain a tell-tale but are performed with both limbs
    /// together. Checked FIRST, so an explicit "double" always wins over a
    /// pattern match.
    static let bilateralOverride = #"\b(double|two|both|2)[-\s]?(arm|armed|leg|legged|side|sided)\b"#

    /// True when a set of this movement is one side at a time.
    public static func isUnilateral(_ exerciseName: String?) -> Bool {
        guard let name = exerciseName, !name.isEmpty else { return false }
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return false }
        if n.matchesAnyPattern([bilateralOverride]) { return false }
        return n.matchesAnyPattern(unilateralPatterns)
    }
}

/// How a PAIR is drawn — one set box, whatever the two sides say.
///
/// ── WHY THIS IS A RULE AND NOT A VIEW DECISION ──────────────────────────────
/// A pair is ONE set everywhere it is counted (`SessionVolume` scores it at the
/// weaker side, `set_count` folds it on `pair_id`, the card's progress counts
/// it once) and it was TWO rows everywhere it was drawn. So a three-set lunge
/// rendered six boxes, six checkmarks and — because the badge prints the side
/// in place of the ordinal — a set list that ran `1, L, R, 4`. The deck was the
/// only place in the app that disagreed with the rest of it about what a set is.
///
/// The layout is the decision, and it is arithmetic on four optionals, so it
/// belongs here with a vector rather than inline in a `body` where the only
/// test available is a screenshot.
///
/// ── AND WHY THREE CASES AND NOT TWO ─────────────────────────────────────────
/// Two sides usually differ in ONE thing. Both arms press 12 kg × 10 and the
/// left one was harder — that is the ordinary case, and drawing it as two value
/// lines repeats `12 kg × 10` to say `9` instead of `8`. So the effort splits
/// on its own, in the effort column, and the value lines only split when the
/// numbers they hold actually differ.
public enum SetPairLayout: String, Sendable, Equatable {
    /// The sides agree on everything. Drawn as an ordinary set: no L, no R.
    case unified
    /// Same load and reps, different effort. One value line, and the two
    /// ratings printed compactly beside each other.
    case effortSplit
    /// The load or the rep count differs. Two sub-lines inside ONE set box.
    case valueSplit

    /// The layout for one group of rows, in deck order.
    ///
    /// A group of one is `unified` by definition — there is nothing to compare
    /// it against, and an unpaired row is not a pair.
    public static func resolve(
        weights: [Double?], reps: [Int?], rpes: [Double?]
    ) -> SetPairLayout {
        guard allEqual(weights), allEqual(reps) else { return .valueSplit }
        return allEqual(rpes) ? .unified : .effortSplit
    }

    /// Every element equal to the first — `nil` included, because "unrated" is
    /// a value the two sides can agree on and `nil != 8` is a disagreement
    /// worth drawing.
    private static func allEqual<T: Equatable>(_ values: [T?]) -> Bool {
        guard let first = values.first else { return true }
        return values.allSatisfy { $0 == first }
    }
}
