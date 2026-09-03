import Foundation
import Testing
import HelixCore
@testable import HelixData

/// The slug, and the catalogue lookup it feeds.
///
/// ── THE CATALOGUE BELOW IS REAL ─────────────────────────────────────────────
/// These are the actual `exercises.name` strings from the live database
/// (2026-09-03, 60 rows). The near-duplicates are not test noise: `Seated Cable
/// Row` / `(V-Grip)` / `(Wide Grip)` are three deliberately separate rows,
/// carved apart on 2026-08-06 because sharing one cost a real record, and
/// `Crunch (Machine)` / `Crunch Machine` are two rows on two different splits.
/// A resolver that collapses either pair re-creates a bug this project has
/// already paid for once.
@Suite("Exercise identity")
struct ExerciseIndexTests {

    /// The live catalogue, verbatim.
    private static let liveNames = [
        "Behind-Back Wrist Curl", "Bicep Curl (DB)", "Bicycle Crunch",
        "Cable Overhead Extension", "Calf Press", "Calf Press (Machine)",
        "Calf Raise", "Chest Press (Machine)", "Cross-Body Cable Extension",
        "Crunch (Machine)", "Crunch Machine", "DB Hammer Curl", "DB RDL",
        "DB Shoulder Press", "Face Pull", "Hack Squat", "Hammer Curl (DB)",
        "Hanging Knee Raise", "Hip Adduction", "Hip Adduction (Machine)",
        "Hip Thrust (Machine)", "Hollow Hold", "Hollow Rock", "Incline DB Press",
        "Lat Pulldown", "Lat Pulldown (Cable)", "Leg Extension",
        "Leg Extension (Machine)", "Leg Press", "Lying Leg Raise",
        "Machine Hip Thrust", "Machine Lateral Raise", "Machine Preacher Curl",
        "Neutral-Grip Lat Pulldown", "Overhead Triceps Extension (Cable)",
        "Pec Deck", "Pec Deck (Butterfly)", "Preacher Curl (Machine)",
        "Reverse Crunch", "Reverse EZ-Bar Curl", "Romanian Deadlift (DB)",
        "Rope Triceps Pushdown", "Russian Twist", "Seated Cable Row",
        "Seated Cable Row (V-Grip)", "Seated Cable Row (Wide Grip)",
        "Seated DB Wrist Curl", "Seated Incline DB Curl",
        "Seated Lateral Raise (DB)", "Seated Leg Curl", "Seated Leg Curl (Machine)",
        "Shoulder Press (DB)", "Side Plank", "Single Arm Cable Crossover",
        "Single Arm Lateral Raise (Cable)", "Single Arm Triceps Pushdown (Cable)",
        "Single-Arm Cable Fly", "Straight Arm Pulldown (Rope)",
        "Straight-Arm Pulldown", "Triceps Rope Pushdown",
    ]

    private static let liveCatalogue = liveNames.enumerated().map {
        RemoteExercise(id: "uuid-\($0.offset)", name: $0.element)
    }

    private func index() -> ExerciseIndex { ExerciseIndex(Self.liveCatalogue) }

    // MARK: The slug

    @Test("no two HELIX-5 movements share a slug")
    func slugsAreUnique() {
        // If two ever did, one would resolve to the other's catalogue row and
        // two movements' histories would merge — with the PR baselines.
        var seen: [String: String] = [:]
        for exercise in Program.helix5.days.flatMap(\.exercises) {
            let slug = ExerciseSlug.id(exercise.name)
            if let clash = seen[slug], clash != exercise.name {
                Issue.record("\(exercise.name) and \(clash) both slug to \(slug)")
            }
            seen[slug] = exercise.name
        }
        #expect(ExerciseSlug.nameBySlug.count == seen.count)
    }

    @Test("the slug is byte-identical to LoggerModel's copy")
    func slugIsPinned() {
        // There are two implementations of this function — the other is
        // `LoggerModel.exerciseId` in the app target, which this package cannot
        // import. These pinned strings are what makes a drift in EITHER copy
        // fail a test instead of quietly failing to resolve at drain time.
        #expect(ExerciseSlug.id("Incline DB Press") == "helix5-incline-db-press")
        #expect(ExerciseSlug.id("Seated Cable Row (V-Grip)") == "helix5-seated-cable-row-v-grip")
        #expect(ExerciseSlug.id("Seated Cable Row (Wide Grip)") == "helix5-seated-cable-row-wide-grip")
        #expect(ExerciseSlug.id("Straight-Arm Pulldown") == "helix5-straight-arm-pulldown")
        #expect(ExerciseSlug.id("Romanian Deadlift (Dumbbell)") == "helix5-romanian-deadlift-dumbbell")
        #expect(ExerciseSlug.id("Reverse EZ-Bar Curl") == "helix5-reverse-ez-bar-curl")
    }

    @Test("every slug maps back to the name the program spells")
    func slugRoundTrips() {
        for exercise in Program.helix5.days.flatMap(\.exercises) {
            #expect(ExerciseSlug.nameBySlug[ExerciseSlug.id(exercise.name)] == exercise.name)
        }
    }

    // MARK: Resolution

    @Test("every movement in the program resolves to a catalogue row")
    func wholeProgramResolves() throws {
        // The real coverage check: if this fails, sync stalls on a real workout.
        for exercise in Program.helix5.days.flatMap(\.exercises) {
            let id = try index().id(forSlug: ExerciseSlug.id(exercise.name))
            #expect(!id.isEmpty, "\(exercise.name) did not resolve")
        }
    }

    @Test("an exact name wins, so a grip variant never folds into its parent")
    func exactNameWins() throws {
        // Three separate rows, three separate ladders. The V-grip is programmed
        // on Upper A and the wide bar on Upper B; sharing one row is what made
        // 2026-08-06's 42.5 × 11 lose both axes to a Sunday set.
        let vGrip = try index().id(forSlug: "helix5-seated-cable-row-v-grip")
        let wide = try index().id(forSlug: "helix5-seated-cable-row-wide-grip")
        #expect(vGrip != wide)
        #expect(vGrip == Self.liveCatalogue.first { $0.name == "Seated Cable Row (V-Grip)" }?.id)
        #expect(wide == Self.liveCatalogue.first { $0.name == "Seated Cable Row (Wide Grip)" }?.id)
    }

    @Test("an unambiguous normalised match resolves the one name that differs")
    func normalisedFallbackResolvesRDL() throws {
        // The program says `Romanian Deadlift (Dumbbell)`; the catalogue says
        // `Romanian Deadlift (DB)`. Stripping the parenthesised text is how the
        // web app has always joined these two, so matching the same way is what
        // keeps both apps writing to one row.
        let resolved = try index().id(forSlug: "helix5-romanian-deadlift-dumbbell")
        #expect(resolved == Self.liveCatalogue.first { $0.name == "Romanian Deadlift (DB)" }?.id)
    }

    @Test("an ambiguous normalised match throws instead of picking one")
    func ambiguityThrows() throws {
        // `Romanian Deadlift (Dumbbell)` is the one program name with no exact
        // row, so it is the one that reaches the normalised tier. Give that tier
        // two equally good answers and it must refuse: the web app takes
        // whichever row Postgres happened to return first, which is a coin flip,
        // and a coin flip here splits a movement's history in half.
        let catalogue = [
            RemoteExercise(id: "uuid-db", name: "Romanian Deadlift (DB)"),
            RemoteExercise(id: "uuid-bb", name: "Romanian Deadlift (Barbell)"),
        ]
        #expect(throws: SyncError.ambiguousExercise(
            name: "Romanian Deadlift (Dumbbell)",
            candidates: ["Romanian Deadlift (Barbell)", "Romanian Deadlift (DB)"]
        )) {
            _ = try ExerciseIndex(catalogue).id(forSlug: "helix5-romanian-deadlift-dumbbell")
        }

        // With only one of them present it resolves, which is the live case.
        #expect(try ExerciseIndex([catalogue[0]])
                .id(forSlug: "helix5-romanian-deadlift-dumbbell") == "uuid-db")
    }

    @Test("a slug the program does not know throws and names itself")
    func unknownSlugThrows() {
        #expect(throws: SyncError.unknownExercise(slug: "helix5-zercher-squat", name: nil)) {
            _ = try index().id(forSlug: "helix5-zercher-squat")
        }
    }

    @Test("a movement missing from the catalogue throws rather than creating a row")
    func missingCatalogueRowThrows() throws {
        // The deliberate difference from `resolveExercises.ts`, which creates.
        // Creating is right for a paste importer taking names from a foreign
        // vocabulary; here every possible name already has a row, so a miss
        // means drift — and a 61st row would split a history silently.
        let thin = ExerciseIndex([RemoteExercise(id: "uuid-0", name: "Hack Squat")])
        #expect(throws: SyncError.self) {
            _ = try thin.id(forSlug: "helix5-pec-deck")
        }
        #expect(try thin.id(forSlug: "helix5-hack-squat") == "uuid-0")
    }
}
