import Foundation

/// HELIX-5, the active training program, ported from `src/lib/programs.ts`.
///
/// ── WHY THE DECK IS DOMAIN AND NOT A FIXTURE ────────────────────────────────
/// It decides what the logger shows, what the muscle sheet counts and what the
/// phase toggle changes. All three have to agree, and the way they agree is by
/// reading one value — the same argument `programs.ts` makes for living beside
/// `setsForPhase` rather than inside a component.
///
/// ── AND WHY THE MOVERS ARE SPELLED OUT HERE ─────────────────────────────────
/// The web resolves movers by NAME through `src/lib/exercises/muscleMap.ts`, a
/// dictionary whose every line was bought by reconciling a real week against
/// Hevy — the fly that is not a triceps movement, the row that is not rear-delt
/// work, the press that pays the triceps and not the side delt. Porting that
/// dictionary is a Wave 4 item (it has to serve the exercise library too).
/// Until then each lift carries its own resolved answer, copied from that file
/// rather than re-derived, so the two cannot quietly disagree about anatomy.
///
/// See `exercise-catalog-merges`: `Seated Cable Row` is TWO exercises split by
/// grip, and they must never be re-merged.

// MARK: - Phase

/// A variation INSIDE a plan. Two values, and `maintenance` was never a third:
/// it resolved to the bulk deck, changing no exercise, no set count and no rep
/// window. A maintenance week is a NUTRITION lever, applied on top of whichever
/// direction the block is running — so offering it here would be offering a
/// training decision that does not train anything.
public enum ProgramPhase: String, CaseIterable, Codable, Sendable {
    case cut
    case bulk

    public var label: String {
        switch self {
        case .cut:  "Cut"
        case .bulk: "Bulk"
        }
    }

    public var blurb: String {
        switch self {
        case .cut:  "MEV+ — defend muscle in the deficit. Fewer sets on the assistance work."
        case .bulk: "MAV — the productive ceiling. Full volume on every lift."
        }
    }
}

// MARK: - Exercise

public struct ProgramExercise: Identifiable, Sendable, Equatable {
    public var name: String
    /// BULK (base) working-set count.
    public var sets: Int
    /// CUT working-set count. `nil` → same as `sets`; `0` → dropped entirely on
    /// a cut. It may legitimately EXCEED `sets` when a lift is prioritised
    /// while cutting.
    public var cutSets: Int?
    /// Starting load, in kilograms. `nil` is not `0`: a hack squat with no
    /// seed load is a lift nobody has recorded yet, and a bodyweight movement
    /// is a lift performed at zero. Both exist in this deck and they are not
    /// the same fact.
    public var wk1Kg: Double?
    /// The double-progression window, as written: `"8–12"`, `"55s"`.
    public var reps: String
    /// TARGET rest between working sets, in seconds — PRESCRIBED, never
    /// measured. HELIX used to answer "how long should I rest" by timing the
    /// gap between two set ticks, which is a different question with a
    /// different answer.
    public var restSec: Int?
    public var movers: MoverTokens
    public var isCompound: Bool
    public var note: String?

    /// Stable within a day, which is all the logger needs — the same movement
    /// appears in two different days (Chest Press is in both Upper A and Upper
    /// B) and those are two different rows with two different set counts.
    public var id: String { name }

    public init(
        _ name: String,
        sets: Int,
        cutSets: Int? = nil,
        wk1Kg: Double?,
        reps: String,
        restSec: Int? = nil,
        primary: [String],
        secondary: [String] = [],
        compound: Bool = false,
        note: String? = nil
    ) {
        self.name = name
        self.sets = sets
        self.cutSets = cutSets
        self.wk1Kg = wk1Kg
        self.reps = reps
        self.restSec = restSec
        self.movers = MoverTokens(primary: primary, secondary: secondary)
        self.isCompound = compound
        self.note = note
    }

    /// The working-set count for a phase. A lift with `cutSets == 0` is dropped
    /// entirely on a cut.
    public func sets(for phase: ProgramPhase) -> Int {
        phase == .cut ? (cutSets ?? sets) : sets
    }

    /// The rep window's floor and ceiling, or `nil` when the prescription is
    /// not a rep count at all (`"55s"` is a duration).
    ///
    /// The separator is an EN DASH in the source data, not a hyphen. Splitting
    /// on `"-"` returns the whole string and the ceiling silently becomes the
    /// floor, which is how a double-progression ceiling stops being reachable.
    public var repWindow: (floor: Int, ceiling: Int)? {
        let parts = reps.split(whereSeparator: { $0 == "\u{2013}" || $0 == "-" })
        guard parts.count == 2,
              let low = Int(parts[0].trimmingCharacters(in: .whitespaces)),
              let high = Int(parts[1].trimmingCharacters(in: .whitespaces))
        else { return nil }
        return (low, high)
    }
}

// MARK: - Day

public struct ProgramDay: Identifiable, Sendable, Equatable {
    public var key: String
    public var label: String
    /// The split sub-type shown under the name, e.g. "Quad Focus".
    public var sub: String?
    /// The day's own colour as `0xRRGGBB` — `DAY_COLOR[key]` in
    /// `src/lib/theme/palette.ts`. Carried as a number rather than as a
    /// `Color` because `HelixCore` imports Foundation and nothing else; the
    /// view turns it into a colour, and there is still only one source for what
    /// "Upper B" looks like.
    public var accent: UInt32
    /// 0 = Sunday … 6 = Saturday. **Never infer the split from the weekday when
    /// reading a logged session** — a swap moves a workout to another date and
    /// a Wednesday "Delts & Arms" landed in the Upper A curve exactly that way.
    /// This field is for laying out the PLAN, not for classifying history.
    public var weekday: Int
    public var exercises: [ProgramExercise]

    public var id: String { key }

    /// The deck as this phase actually trains it: dropped lifts removed, set
    /// counts resolved.
    public func exercises(for phase: ProgramPhase) -> [ProgramExercise] {
        exercises.filter { $0.sets(for: phase) > 0 }
    }

    /// Total prescribed working sets for a phase — the number the header's
    /// "sets" tile counts up to.
    public func plannedSets(for phase: ProgramPhase) -> Int {
        exercises.reduce(0) { $0 + $1.sets(for: phase) }
    }
}

// MARK: - Program

public struct Program: Sendable, Equatable {
    public var id: String
    public var label: String
    public var blurb: String
    public var days: [ProgramDay]

    public func day(key: String) -> ProgramDay? {
        days.first { $0.key == key }
    }

    public func day(weekday: Int) -> ProgramDay? {
        days.first { $0.weekday == weekday }
    }
}

public extension Program {

    /// HELIX-5 — Sun/Mon/Tue/Thu/Fri, with Wed & Sat as Zone-2 rest.
    ///
    /// `id` is `apex51` and stays that way: it is the key 24 `localStorage`
    /// entries and a season of Supabase rows were written under.
    static let helix5 = Program(
        id: "apex51",
        label: "Helix-5",
        blurb: "5-day antagonist hybrid — Sun/Mon/Tue/Thu/Fri, Wed & Sat Zone-2 rest.",
        days: [
            ProgramDay(
                key: "cb_a", label: "Upper A", sub: "Chest + Back",
                accent: 0xE0703C, weekday: 0,
                exercises: [
                    ProgramExercise("Incline DB Press", sets: 3, cutSets: 3, wk1Kg: 32, reps: "8–12", restSec: 120,
                                    primary: ["chest"], secondary: ["triceps", "front_delts"], compound: true),
                    ProgramExercise("Lat Pulldown", sets: 3, cutSets: 3, wk1Kg: 45, reps: "8–12", restSec: 135,
                                    primary: ["lats"], secondary: ["upper back", "biceps", "forearms"], compound: true),
                    ProgramExercise("Chest Press (Machine)", sets: 3, cutSets: 2, wk1Kg: 34, reps: "10–12", restSec: 135,
                                    primary: ["chest"], secondary: ["triceps", "front_delts"], compound: true),
                    ProgramExercise("Seated Cable Row (V-Grip)", sets: 3, cutSets: 2, wk1Kg: 38.5, reps: "10–12", restSec: 120,
                                    primary: ["upper back"], secondary: ["lats", "biceps", "forearms"], compound: true, note: "V-grip"),
                    ProgramExercise("Pec Deck", sets: 2, cutSets: 2, wk1Kg: 47.5, reps: "12–15", restSec: 120,
                                    primary: ["chest"]),
                    ProgramExercise("Straight-Arm Pulldown", sets: 2, cutSets: 2, wk1Kg: 15, reps: "12–15", restSec: 105,
                                    primary: ["lats"], secondary: ["triceps"]),
                    ProgramExercise("Face Pull", sets: 3, cutSets: 2, wk1Kg: 13.75, reps: "12–15", restSec: 105,
                                    primary: ["rear_delts"], secondary: ["biceps"]),
                ]
            ),
            ProgramDay(
                key: "legs_a", label: "Legs & Core A", sub: "Quad Focus",
                accent: 0x3D7AB8, weekday: 1,
                exercises: [
                    ProgramExercise("Leg Press", sets: 4, cutSets: 3, wk1Kg: 70, reps: "8–12", restSec: 135,
                                    primary: ["quadriceps"], secondary: ["glutes", "hamstrings"], compound: true, note: "1 warm-up @40kg"),
                    ProgramExercise("Hack Squat", sets: 3, cutSets: 2, wk1Kg: nil, reps: "10–12", restSec: 135,
                                    primary: ["quadriceps"], secondary: ["glutes", "hamstrings"], compound: true),
                    ProgramExercise("Leg Extension", sets: 3, cutSets: 3, wk1Kg: 37.5, reps: "12–15", restSec: 120,
                                    primary: ["quadriceps"]),
                    ProgramExercise("Seated Leg Curl", sets: 3, cutSets: 3, wk1Kg: 40, reps: "10–15", restSec: 105,
                                    primary: ["hamstrings"], secondary: ["calves"]),
                    ProgramExercise("Calf Press", sets: 4, cutSets: 3, wk1Kg: 65, reps: "10–15", restSec: 90,
                                    primary: ["calves"]),
                    ProgramExercise("Crunch Machine", sets: 3, cutSets: 3, wk1Kg: 52.5, reps: "10–12", restSec: 90,
                                    primary: ["abdominals"]),
                    ProgramExercise("Reverse Crunch", sets: 3, cutSets: 2, wk1Kg: nil, reps: "12–15", restSec: 75,
                                    primary: ["abdominals"]),
                ]
            ),
            ProgramDay(
                key: "arms", label: "Delts & Arms", sub: nil,
                accent: 0x8A6FA8, weekday: 2,
                exercises: [
                    ProgramExercise("DB Shoulder Press", sets: 3, cutSets: 3, wk1Kg: 28, reps: "8–10", restSec: 105,
                                    primary: ["front_delts"], secondary: ["triceps"], compound: true),
                    ProgramExercise("Single Arm Lateral Raise (Cable)", sets: 5, cutSets: 4, wk1Kg: 5, reps: "12–20", restSec: 105,
                                    primary: ["side_delts"], note: "per side"),
                    ProgramExercise("Seated Incline DB Curl", sets: 3, cutSets: 3, wk1Kg: 14, reps: "8–12", restSec: 105,
                                    primary: ["biceps"]),
                    ProgramExercise("Cable Overhead Extension", sets: 3, cutSets: 2, wk1Kg: 9, reps: "10–15", restSec: 90,
                                    primary: ["triceps"]),
                    ProgramExercise("DB Hammer Curl", sets: 3, cutSets: 2, wk1Kg: 16, reps: "10–12", restSec: 105,
                                    primary: ["biceps"], secondary: ["forearms"]),
                    ProgramExercise("Rope Triceps Pushdown", sets: 2, cutSets: 2, wk1Kg: 13.5, reps: "12–15", restSec: 90,
                                    primary: ["triceps"]),
                    ProgramExercise("Reverse EZ-Bar Curl", sets: 2, cutSets: 2, wk1Kg: 15, reps: "12–15", restSec: 90,
                                    primary: ["biceps"], secondary: ["forearms"]),
                    ProgramExercise("Seated DB Wrist Curl", sets: 2, cutSets: 0, wk1Kg: 16, reps: "15–20", restSec: 90,
                                    primary: ["forearms"]),
                ]
            ),
            ProgramDay(
                key: "cb_b", label: "Upper B", sub: "Chest + Back",
                accent: 0xB4522A, weekday: 4,
                exercises: [
                    ProgramExercise("Chest Press (Machine)", sets: 3, cutSets: 3, wk1Kg: 35, reps: "10–12", restSec: 120,
                                    primary: ["chest"], secondary: ["triceps", "front_delts"], compound: true),
                    ProgramExercise("Neutral-Grip Lat Pulldown", sets: 3, cutSets: 2, wk1Kg: 45, reps: "10–12", restSec: 120,
                                    primary: ["lats"], secondary: ["upper back", "biceps", "forearms"], compound: true),
                    ProgramExercise("Single Arm Cable Crossover", sets: 2, cutSets: 2, wk1Kg: 7.5, reps: "12–15", restSec: 105,
                                    primary: ["chest"], note: "per arm"),
                    ProgramExercise("Seated Cable Row (Wide Grip)", sets: 3, cutSets: 2, wk1Kg: 35, reps: "10–12", restSec: 120,
                                    primary: ["upper back"], secondary: ["lats", "traps", "biceps", "forearms"], compound: true, note: "wide bar"),
                    ProgramExercise("Single Arm Lateral Raise (Cable)", sets: 4, cutSets: 3, wk1Kg: 3.75, reps: "15–20", restSec: 90,
                                    primary: ["side_delts"], note: "per side"),
                    ProgramExercise("Preacher Curl (Machine)", sets: 3, cutSets: 3, wk1Kg: 15, reps: "8–12", restSec: 105,
                                    primary: ["biceps"]),
                    ProgramExercise("Single Arm Triceps Pushdown (Cable)", sets: 2, cutSets: 2, wk1Kg: 5, reps: "12–15", restSec: 90,
                                    primary: ["triceps"], note: "per arm"),
                ]
            ),
            ProgramDay(
                key: "legs_b", label: "Legs & Core B", sub: "Posterior Focus",
                accent: 0x2E5C8A, weekday: 5,
                exercises: [
                    ProgramExercise("Romanian Deadlift (Dumbbell)", sets: 4, cutSets: 3, wk1Kg: 30, reps: "8–12", restSec: 120,
                                    primary: ["hamstrings"], secondary: ["glutes", "lower back", "upper back", "lats", "forearms"], compound: true),
                    ProgramExercise("Hip Thrust (Machine)", sets: 3, cutSets: 3, wk1Kg: 25, reps: "8–15", restSec: 135,
                                    primary: ["glutes"], secondary: ["hamstrings", "quadriceps", "adductors"], compound: true),
                    ProgramExercise("Leg Press", sets: 2, cutSets: 2, wk1Kg: 70, reps: "12–15", restSec: 135,
                                    primary: ["quadriceps"], secondary: ["glutes", "hamstrings"], compound: true, note: "horizontal sled"),
                    ProgramExercise("Hip Adduction", sets: 2, cutSets: 0, wk1Kg: 50, reps: "12–15", restSec: 90,
                                    primary: ["adductors"]),
                    ProgramExercise("Seated Leg Curl", sets: 2, cutSets: 2, wk1Kg: 45, reps: "10–15", restSec: 105,
                                    primary: ["hamstrings"], secondary: ["calves"]),
                    ProgramExercise("Calf Press", sets: 4, cutSets: 3, wk1Kg: 67.5, reps: "10–15", restSec: 105,
                                    primary: ["calves"]),
                    ProgramExercise("Hanging Knee Raise", sets: 3, cutSets: 3, wk1Kg: nil, reps: "10–15", restSec: 90,
                                    primary: ["abdominals"]),
                    ProgramExercise("Side Plank", sets: 2, cutSets: 2, wk1Kg: nil, reps: "55s", restSec: 90,
                                    primary: ["obliques"], secondary: ["abdominals"], note: "per side"),
                ]
            ),
        ]
    )
}
