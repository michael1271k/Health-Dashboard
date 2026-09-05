import Foundation

/// HELIX-5, the active training program, ported from `src/lib/programs.ts`.
///
/// ── WHY THE DECK IS DOMAIN AND NOT A FIXTURE ────────────────────────────────
/// It decides what the logger shows, what the muscle sheet counts and what the
/// phase toggle changes. All three have to agree, and the way they agree is by
/// reading one value — the same argument `programs.ts` makes for living beside
/// `setsForPhase` rather than inside a component.
///
/// ── AND WHY THE MOVERS ARE NO LONGER SPELLED OUT HERE ───────────────────────
/// Every lift used to carry its own resolved `primary:` / `secondary:` answer,
/// hand-copied out of `src/lib/exercises/muscleMap.ts` because that dictionary
/// had not been ported yet. Two hand-maintained copies of the same anatomy both
/// look right, so the copies are gone: `ProgramExercise.init` now asks
/// `MuscleMap` for the movers, keyed on the lift's own name, and there is one
/// answer to the question "what does a face pull train".
///
/// All 37 movements were checked against their copied literals before the
/// literals were deleted, and all 37 agreed — see the parity test in
/// `TrainingTests`, which now asserts the weaker but permanent version of that
/// claim: every lift in this deck RESOLVES in the map. A lift that does not is
/// a lift with no anatomy, and it would otherwise vanish from the muscle sheet
/// in silence.
///
/// `movers:` stays as an override for a lift the map genuinely cannot answer —
/// and if one ever disagrees with the map, spell it out here with the conflict
/// named rather than quietly adopting either side.
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
    /// Resolved from `MuscleMap` by name at construction — see the type header.
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
        movers: MoverTokens? = nil,
        compound: Bool = false,
        note: String? = nil
    ) {
        self.name = name
        self.sets = sets
        self.cutSets = cutSets
        self.wk1Kg = wk1Kg
        self.reps = reps
        self.restSec = restSec
        // The map answers for every lift in this deck, and the parity test
        // holds it to that. The empty fallback exists so a typo in a NEW lift's
        // name is a failing test rather than a compile error nobody can fix
        // without inventing anatomy.
        self.movers = movers ?? MuscleMap.movers(name) ?? MoverTokens(primary: [])
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
        // One parser — `Ceilings.parseRepWindow` is the port of the web's, and
        // the golden vectors hold it to every string in the deck.
        guard let w = Ceilings.parseRepWindow(reps) else { return nil }
        return (Int(w.floor), Int(w.ceiling))
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
        label: "Onyx-5",
        blurb: "5-day antagonist hybrid — Sun/Mon/Tue/Thu/Fri, Wed & Sat Zone-2 rest.",
        days: [
            ProgramDay(
                key: "cb_a", label: "Upper A", sub: "Chest + Back",
                accent: 0xE0703C, weekday: 0,
                exercises: [
                    ProgramExercise("Incline DB Press", sets: 3, cutSets: 3, wk1Kg: 32, reps: "8–12", restSec: 120, compound: true),
                    ProgramExercise("Lat Pulldown", sets: 3, cutSets: 3, wk1Kg: 45, reps: "8–12", restSec: 135, compound: true),
                    ProgramExercise("Chest Press (Machine)", sets: 3, cutSets: 2, wk1Kg: 34, reps: "10–12", restSec: 135, compound: true),
                    ProgramExercise("Seated Cable Row (V-Grip)", sets: 3, cutSets: 2, wk1Kg: 38.5, reps: "10–12", restSec: 120, compound: true, note: "V-grip"),
                    ProgramExercise("Pec Deck", sets: 2, cutSets: 2, wk1Kg: 47.5, reps: "12–15", restSec: 120),
                    ProgramExercise("Straight-Arm Pulldown", sets: 2, cutSets: 2, wk1Kg: 15, reps: "12–15", restSec: 105),
                    ProgramExercise("Face Pull", sets: 3, cutSets: 2, wk1Kg: 13.75, reps: "12–15", restSec: 105),
                ]
            ),
            ProgramDay(
                key: "legs_a", label: "Legs & Core A", sub: "Quad Focus",
                accent: 0x3D7AB8, weekday: 1,
                exercises: [
                    ProgramExercise("Leg Press", sets: 4, cutSets: 3, wk1Kg: 70, reps: "8–12", restSec: 135, compound: true, note: "1 warm-up @40kg"),
                    ProgramExercise("Hack Squat", sets: 3, cutSets: 2, wk1Kg: nil, reps: "10–12", restSec: 135, compound: true),
                    ProgramExercise("Leg Extension", sets: 3, cutSets: 3, wk1Kg: 37.5, reps: "12–15", restSec: 120),
                    ProgramExercise("Seated Leg Curl", sets: 3, cutSets: 3, wk1Kg: 40, reps: "10–15", restSec: 105),
                    ProgramExercise("Calf Press", sets: 4, cutSets: 3, wk1Kg: 65, reps: "10–15", restSec: 90),
                    ProgramExercise("Crunch Machine", sets: 3, cutSets: 3, wk1Kg: 52.5, reps: "10–12", restSec: 90),
                    ProgramExercise("Reverse Crunch", sets: 3, cutSets: 2, wk1Kg: nil, reps: "12–15", restSec: 75),
                ]
            ),
            ProgramDay(
                key: "arms", label: "Delts & Arms", sub: nil,
                accent: 0x8A6FA8, weekday: 2,
                exercises: [
                    ProgramExercise("DB Shoulder Press", sets: 3, cutSets: 3, wk1Kg: 28, reps: "8–10", restSec: 105, compound: true),
                    ProgramExercise("Single Arm Lateral Raise (Cable)", sets: 5, cutSets: 4, wk1Kg: 5, reps: "12–20", restSec: 105, note: "per side"),
                    ProgramExercise("Seated Incline DB Curl", sets: 3, cutSets: 3, wk1Kg: 14, reps: "8–12", restSec: 105),
                    ProgramExercise("Cable Overhead Extension", sets: 3, cutSets: 2, wk1Kg: 9, reps: "10–15", restSec: 90),
                    ProgramExercise("DB Hammer Curl", sets: 3, cutSets: 2, wk1Kg: 16, reps: "10–12", restSec: 105),
                    ProgramExercise("Rope Triceps Pushdown", sets: 2, cutSets: 2, wk1Kg: 13.5, reps: "12–15", restSec: 90),
                    ProgramExercise("Reverse EZ-Bar Curl", sets: 2, cutSets: 2, wk1Kg: 15, reps: "12–15", restSec: 90),
                    ProgramExercise("Seated DB Wrist Curl", sets: 2, cutSets: 0, wk1Kg: 16, reps: "15–20", restSec: 90),
                ]
            ),
            ProgramDay(
                key: "cb_b", label: "Upper B", sub: "Chest + Back",
                accent: 0xB4522A, weekday: 4,
                exercises: [
                    ProgramExercise("Chest Press (Machine)", sets: 3, cutSets: 3, wk1Kg: 35, reps: "10–12", restSec: 120, compound: true),
                    ProgramExercise("Neutral-Grip Lat Pulldown", sets: 3, cutSets: 2, wk1Kg: 45, reps: "10–12", restSec: 120, compound: true),
                    ProgramExercise("Single Arm Cable Crossover", sets: 2, cutSets: 2, wk1Kg: 7.5, reps: "12–15", restSec: 105, note: "per arm"),
                    ProgramExercise("Seated Cable Row (Wide Grip)", sets: 3, cutSets: 2, wk1Kg: 35, reps: "10–12", restSec: 120, compound: true, note: "wide bar"),
                    ProgramExercise("Single Arm Lateral Raise (Cable)", sets: 4, cutSets: 3, wk1Kg: 3.75, reps: "15–20", restSec: 90, note: "per side"),
                    ProgramExercise("Preacher Curl (Machine)", sets: 3, cutSets: 3, wk1Kg: 15, reps: "8–12", restSec: 105),
                    ProgramExercise("Single Arm Triceps Pushdown (Cable)", sets: 2, cutSets: 2, wk1Kg: 5, reps: "12–15", restSec: 90, note: "per arm"),
                ]
            ),
            ProgramDay(
                key: "legs_b", label: "Legs & Core B", sub: "Posterior Focus",
                accent: 0x2E5C8A, weekday: 5,
                exercises: [
                    ProgramExercise("Romanian Deadlift (Dumbbell)", sets: 4, cutSets: 3, wk1Kg: 30, reps: "8–12", restSec: 120, compound: true),
                    ProgramExercise("Hip Thrust (Machine)", sets: 3, cutSets: 3, wk1Kg: 25, reps: "8–15", restSec: 135, compound: true),
                    ProgramExercise("Leg Press", sets: 2, cutSets: 2, wk1Kg: 70, reps: "12–15", restSec: 135, compound: true, note: "horizontal sled"),
                    ProgramExercise("Hip Adduction", sets: 2, cutSets: 0, wk1Kg: 50, reps: "12–15", restSec: 90),
                    ProgramExercise("Seated Leg Curl", sets: 2, cutSets: 2, wk1Kg: 45, reps: "10–15", restSec: 105),
                    ProgramExercise("Calf Press", sets: 4, cutSets: 3, wk1Kg: 67.5, reps: "10–15", restSec: 105),
                    ProgramExercise("Hanging Knee Raise", sets: 3, cutSets: 3, wk1Kg: nil, reps: "10–15", restSec: 90),
                    ProgramExercise("Side Plank", sets: 2, cutSets: 2, wk1Kg: nil, reps: "55s", restSec: 90, note: "per side"),
                ]
            ),
        ]
    )
}
