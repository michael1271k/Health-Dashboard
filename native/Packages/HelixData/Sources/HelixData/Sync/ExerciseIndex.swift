import Foundation
import HelixCore

/// A row of the server's `exercises` catalogue, reduced to what matching needs.
public struct RemoteExercise: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

/// Turns the local slug on a set into the uuid `workout_sets.exercise_id` needs.
///
/// ── WHY THIS IS THE MOST DANGEROUS FILE IN THE SYNC ─────────────────────────
/// `workout_sets.exercise_id` is a uuid with a live foreign key into a
/// 60-row `exercises` table. The local id is `LoggerModel.exerciseId` — a slug
/// of the movement's name — because the v4 migration deliberately removed the
/// local foreign key so a set logged against an unsynced exercise could not be
/// rejected by its own projection. Something has to bridge the two, and getting
/// it wrong has two failure modes with very different costs:
///
///   · A **merge** — two movements resolving to one row — is loud. Loads from a
///     wide-grip row start appearing in the V-grip ladder and it is obvious.
///   · A **split** — one movement resolving to a new row — is silent. The
///     history simply starts again from zero, the PR baselines with it, and the
///     first return to an old load reads as a new record.
///
/// The catalogue is full of near-duplicates that are deliberately distinct:
/// `Seated Cable Row` / `(V-Grip)` / `(Wide Grip)` were carved apart on
/// 2026-08-06 because sharing one row cost a real record; `Crunch (Machine)`
/// and `Crunch Machine` are two rows on two different splits. So:
///
/// 1. **Exact name wins.** Case-insensitive and trimmed, nothing else. This is
///    what resolves 31 of HELIX-5's 32 movements, and it cannot merge a variant
///    into its parent because both names are in the catalogue verbatim.
/// 2. **Then an UNAMBIGUOUS normalised match.** The same normalisation
///    `resolveExercises.ts` uses — strip parenthesised text, then punctuation —
///    which is what maps the program's `Romanian Deadlift (Dumbbell)` onto the
///    catalogue's `Romanian Deadlift (DB)`. It is accepted **only** when
///    exactly one catalogue row normalises to that key; the web app takes
///    whichever row Postgres happened to return first, which is a coin flip
///    among the three cable rows.
/// 3. **Otherwise it throws.** It does not create the row.
///
/// Point 3 is the deliberate difference from the web app, which creates on a
/// miss. Creating is right for a paste importer taking names from a foreign
/// vocabulary; it is wrong here, where the only names that can arrive are the
/// 32 in `Program.helix5` and every one of them already has a catalogue row. A
/// miss therefore means the program was edited or the slug function drifted —
/// and in both cases a failed upload that names the movement is worth far more
/// than a 61st row nobody asked for. The exercise library lands in Wave 3 and
/// owns creation from then on.
public struct ExerciseIndex: Sendable {

    private let byExactName: [String: String]
    /// Normalised key → every catalogue row that normalises to it. The VALUES
    /// are what makes ambiguity detectable; a plain `[String: String]` would
    /// silently keep one and discard the rest.
    private let byNormalised: [String: [RemoteExercise]]

    public init(_ catalogue: [RemoteExercise]) {
        byExactName = Dictionary(
            catalogue.map { (Self.exactKey($0.name), $0.id) },
            // Two rows with the same name are impossible: `exercises` has a
            // UNIQUE (user_id, name). Keeping the first is arbitrary and
            // unreachable rather than a decision.
            uniquingKeysWith: { first, _ in first }
        )
        byNormalised = Dictionary(grouping: catalogue, by: { Self.normalisedKey($0.name) })
    }

    /// Resolve one local slug to a catalogue uuid.
    public func id(forSlug slug: String) throws -> String {
        guard let name = ExerciseSlug.nameBySlug[slug] else {
            throw SyncError.unknownExercise(slug: slug, name: nil)
        }
        if let exact = byExactName[Self.exactKey(name)] { return exact }

        let candidates = byNormalised[Self.normalisedKey(name)] ?? []
        switch candidates.count {
        case 1: return candidates[0].id
        case 0: throw SyncError.unknownExercise(slug: slug, name: name)
        default:
            throw SyncError.ambiguousExercise(
                name: name,
                candidates: candidates.map(\.name).sorted()
            )
        }
    }

    static func exactKey(_ name: String) -> String {
        name.lowercased().trimmingCharacters(in: .whitespaces)
    }

    /// `resolveExercises.ts`'s `normalize`, verbatim: drop parenthesised text,
    /// then collapse everything that is not a letter or a digit into single
    /// spaces. Ported rather than improved — a different normalisation here
    /// would resolve a name onto a different row than the web app does, and the
    /// two writing to different rows for one movement IS the split.
    static func normalisedKey(_ name: String) -> String {
        let withoutParens = name.replacingOccurrences(
            of: "\\([^)]*\\)", with: " ", options: .regularExpression
        )
        return withoutParens
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }
}

// MARK: - The slug

/// The slug the logger stamps on a set, and the way back from it.
///
/// ── THERE ARE TWO COPIES OF THIS FUNCTION AND THAT IS A KNOWN DEBT ──────────
/// `LoggerModel.exerciseId` in the app target has the other one. This package
/// cannot import the app target, and the app target is Track U's to edit, so
/// the copies stay for now — but they are pinned: `ExerciseSlugTests` asserts
/// the exact slug string for all 32 HELIX-5 movements, so a drift in either
/// copy fails a test rather than quietly failing to resolve. When Track U next
/// touches `LoggerModel`, that function should become a call to this one.
///
/// The reverse map is built from `Program.helix5` rather than by un-slugging,
/// because un-slugging is lossy: `helix5-seated-cable-row-v-grip` cannot be
/// turned back into `Seated Cable Row (V-Grip)` — the parentheses and the
/// capitals are gone — and guessing at it is how a variant gets filed under its
/// parent.
public enum ExerciseSlug {

    /// Must stay byte-identical to `LoggerModel.exerciseId`.
    public static func id(_ name: String) -> String {
        "helix5-" + name.lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    /// Slug → the movement's name, as `Program.helix5` spells it.
    ///
    /// Built once. `uniquingKeysWith` keeps the first, and `ExerciseSlugTests`
    /// asserts that no two program movements share a slug — because if two ever
    /// did, one of them would resolve to the other's catalogue row, which is
    /// the merge this whole file exists to prevent. (They do not today:
    /// `Crunch Machine` and the catalogue's `Crunch (Machine)` collide under
    /// this slug, but only one of the pair is in the program.)
    public static let nameBySlug: [String: String] = Dictionary(
        Program.helix5.days
            .flatMap(\.exercises)
            .map { (id($0.name), $0.name) },
        uniquingKeysWith: { first, _ in first }
    )
}
