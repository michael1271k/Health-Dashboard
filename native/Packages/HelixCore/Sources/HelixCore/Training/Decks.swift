import Foundation

/// The other two decks, the catalogue that holds all three, and the era
/// boundary — the rest of `src/lib/programs.ts` that the schedule core needs.
///
/// ── WHY THESE ARE HERE AND NOT IN `Program.swift` ────────────────────────────
/// `Program.helix5` is the ACTIVE deck and the file it lives in is written as
/// its specification. Helix-4 and PPL are here because `scheduleDayIn` resolves
/// a date against whichever plan owns it: the plan the user SELECTED in the
/// Helix era, and — for every date before the cut opened — the PPL block,
/// whatever is selected today. A schedule that only knew Helix-5 would call a
/// June Friday a rest day, and June Fridays carried fourteen logged sessions.
///
/// The colours are `DAY_COLOR` from `palette.ts`, as `0xRRGGBB`: Helix-4
/// mirrors its Helix-5 counterpart, and a PPL day takes its split's colour
/// because the day IS the split.
public extension Program {

    /// Helix-4 — the 4-day upper/lower backup (Mon/Tue/Thu/Fri). One plan; the
    /// former Builder/Defender pair is a PHASE now, via `sets` vs `cutSets`.
    static let helix4 = Program(
        id: "axis4",
        label: "Helix-4",
        blurb: "4-day upper/lower backup — Mon/Tue/Thu/Fri. Bulk adds volume; cut trims it.",
        days: [
            ProgramDay(
                key: "upper_a", label: "Upper A", sub: nil, accent: 0xE0703C, weekday: 1,
                exercises: [
                    ProgramExercise("Incline DB Press", sets: 3, cutSets: 3, wk1Kg: 32, reps: "8–12", restSec: 120, compound: true),
                    ProgramExercise("Lat Pulldown", sets: 3, cutSets: 3, wk1Kg: 45, reps: "8–12", restSec: 135, compound: true),
                    ProgramExercise("Chest Press (Machine)", sets: 2, cutSets: 0, wk1Kg: 34, reps: "10–12", restSec: 120, compound: true),
                    ProgramExercise("Seated Cable Row (V-Grip)", sets: 3, cutSets: 2, wk1Kg: 38.5, reps: "10–12", restSec: 120, compound: true, note: "V-grip"),
                    ProgramExercise("Seated Incline DB Curl", sets: 3, cutSets: 3, wk1Kg: 14, reps: "8–12", restSec: 105),
                    ProgramExercise("Rope Triceps Pushdown", sets: 3, cutSets: 2, wk1Kg: 13.5, reps: "12–15", restSec: 90),
                    ProgramExercise("Face Pull", sets: 2, cutSets: 2, wk1Kg: 13.75, reps: "12–15", restSec: 105),
                ]
            ),
            ProgramDay(
                key: "lower_a", label: "Lower A", sub: nil, accent: 0x3D7AB8, weekday: 2,
                exercises: [
                    ProgramExercise("Leg Press", sets: 3, cutSets: 3, wk1Kg: 70, reps: "8–12", restSec: 135, compound: true),
                    ProgramExercise("Hack Squat", sets: 2, cutSets: 0, wk1Kg: nil, reps: "10–12", restSec: 135, compound: true),
                    ProgramExercise("Leg Extension", sets: 2, cutSets: 3, wk1Kg: 37.5, reps: "12–15", restSec: 120),
                    ProgramExercise("Seated Leg Curl", sets: 3, cutSets: 3, wk1Kg: 40, reps: "10–15", restSec: 105),
                    ProgramExercise("Calf Press", sets: 4, cutSets: 3, wk1Kg: 65, reps: "10–15", restSec: 90),
                    ProgramExercise("Crunch Machine", sets: 3, cutSets: 3, wk1Kg: 52.5, reps: "10–12", restSec: 90),
                    ProgramExercise("Reverse Crunch", sets: 2, cutSets: 2, wk1Kg: nil, reps: "12–15", restSec: 75),
                ]
            ),
            ProgramDay(
                key: "upper_b", label: "Upper B", sub: nil, accent: 0xB4522A, weekday: 4,
                exercises: [
                    ProgramExercise("DB Shoulder Press", sets: 3, cutSets: 3, wk1Kg: 28, reps: "8–10", restSec: 105, compound: true),
                    ProgramExercise("Single Arm Lateral Raise (Cable)", sets: 4, cutSets: 4, wk1Kg: 5, reps: "12–20", restSec: 105, note: "per side"),
                    ProgramExercise("Pec Deck", sets: 2, cutSets: 1, wk1Kg: 47.5, reps: "12–15", restSec: 120, note: "cut: rotates with Chest Press (Machine)"),
                    ProgramExercise("Seated Cable Row (Wide Grip)", sets: 3, cutSets: 2, wk1Kg: 35, reps: "10–12", restSec: 120, compound: true, note: "wide bar"),
                    ProgramExercise("DB Hammer Curl", sets: 3, cutSets: 2, wk1Kg: 16, reps: "10–12", restSec: 105),
                    ProgramExercise("Single Arm Triceps Pushdown (Cable)", sets: 2, cutSets: 2, wk1Kg: 5, reps: "12–15", restSec: 90, note: "per arm"),
                    ProgramExercise("Reverse EZ-Bar Curl", sets: 2, cutSets: 2, wk1Kg: 15, reps: "12–15", restSec: 90),
                    ProgramExercise("Seated DB Wrist Curl", sets: 2, cutSets: 0, wk1Kg: 16, reps: "15–20", restSec: 90),
                ]
            ),
            ProgramDay(
                key: "lower_b", label: "Lower B", sub: nil, accent: 0x2E5C8A, weekday: 5,
                exercises: [
                    ProgramExercise("DB RDL", sets: 3, cutSets: 3, wk1Kg: 26, reps: "8–12", restSec: 120, compound: true),
                    ProgramExercise("Machine Hip Thrust", sets: 3, cutSets: 3, wk1Kg: 23.5, reps: "8–15", restSec: 135, compound: true),
                    ProgramExercise("Leg Press", sets: 2, cutSets: 2, wk1Kg: 70, reps: "12–15", restSec: 135, compound: true, note: "horizontal sled"),
                    ProgramExercise("Hip Adduction", sets: 2, cutSets: 0, wk1Kg: 50, reps: "12–15", restSec: 90),
                    ProgramExercise("Calf Press", sets: 3, cutSets: 3, wk1Kg: 65, reps: "10–15", restSec: 105),
                    ProgramExercise("Hanging Knee Raise", sets: 3, cutSets: 3, wk1Kg: nil, reps: "10–15", restSec: 90),
                    ProgramExercise("Side Plank", sets: 2, cutSets: 2, wk1Kg: nil, reps: "55s", restSec: 90, note: "per side"),
                ]
            ),
        ]
    )

    /// PPL Legacy — the pre-Helix Push/Pull/Legs block. Sun/Thu Push · Mon/Fri
    /// Pull · Tue Legs · Wed & Sat rest. Selectable so its era can be reviewed;
    /// the loads are the last ones logged under it. No `cutSets`, no `restSec`:
    /// the block predates both prescriptions.
    static let pplLegacy = Program(
        id: "ppl",
        label: "Push/Pull/Legs",
        blurb: "Historical Push/Pull/Legs — Sun/Thu Push · Mon/Fri Pull · Tue Legs · Wed & Sat rest.",
        days: [
            ProgramDay(key: "ppl_push_sun", label: "Push", sub: nil, accent: 0xE0703C, weekday: 0, exercises: pplPush),
            ProgramDay(key: "ppl_pull_mon", label: "Pull", sub: nil, accent: 0x3E9E7A, weekday: 1, exercises: pplPull),
            ProgramDay(key: "ppl_legs_tue", label: "Legs", sub: nil, accent: 0x3D7AB8, weekday: 2, exercises: pplLegs),
            ProgramDay(key: "ppl_push_thu", label: "Push", sub: nil, accent: 0xE0703C, weekday: 4, exercises: pplPush),
            ProgramDay(key: "ppl_pull_fri", label: "Pull", sub: nil, accent: 0x3E9E7A, weekday: 5, exercises: pplPull),
        ]
    )

    private static let pplPush: [ProgramExercise] = [
        ProgramExercise("Incline DB Press", sets: 2, wk1Kg: 35, reps: "10–12", compound: true),
        ProgramExercise("Chest Press Machine", sets: 2, wk1Kg: 37.5, reps: "10–12", compound: true),
        ProgramExercise("Butterfly Pec Deck", sets: 2, wk1Kg: 52.5, reps: "10–12"),
        ProgramExercise("DB Shoulder Press", sets: 3, wk1Kg: 30, reps: "8–12", compound: true, note: "ramp: 25kg×12 → 30kg×9,8"),
        ProgramExercise("Lateral Raise DB", sets: 4, wk1Kg: 10, reps: "12–20"),
        ProgramExercise("Triceps Rope Pushdown", sets: 3, wk1Kg: 15, reps: "12–15"),
        ProgramExercise("Overhead Triceps Extension", sets: 3, wk1Kg: 10, reps: "10–15"),
        ProgramExercise("Side Plank", sets: 3, wk1Kg: nil, reps: "55s", note: "per side"),
        ProgramExercise("Russian Twist", sets: 3, wk1Kg: 10, reps: "15–20"),
        ProgramExercise("Lying Leg Raises", sets: 3, wk1Kg: nil, reps: "12–15"),
    ]

    private static let pplPull: [ProgramExercise] = [
        ProgramExercise("Lat Pulldown", sets: 2, wk1Kg: 49.5, reps: "10–12", compound: true),
        ProgramExercise("Seated Cable Row", sets: 2, wk1Kg: 42.5, reps: "10–12", compound: true),
        ProgramExercise("Face Pull", sets: 4, wk1Kg: 16.25, reps: "12–15"),
        ProgramExercise("Straight Arm Pulldown", sets: 3, wk1Kg: 17.5, reps: "10–15"),
        ProgramExercise("Bicep Curl DB", sets: 3, wk1Kg: 18, reps: "10–12"),
        ProgramExercise("Hammer Curl DB", sets: 3, wk1Kg: 18, reps: "10–12"),
        ProgramExercise("Preacher Curl", sets: 3, wk1Kg: 16.25, reps: "8–12"),
        ProgramExercise("Crunch Machine", sets: 3, wk1Kg: 57.5, reps: "12–15"),
    ]

    private static let pplLegs: [ProgramExercise] = [
        ProgramExercise("Leg Press", sets: 2, wk1Kg: 80, reps: "8–12", compound: true, note: "1 warm-up @72.5kg"),
        ProgramExercise("RDL DB", sets: 3, wk1Kg: 30, reps: "10–15", compound: true),
        ProgramExercise("Hip Thrust", sets: 3, wk1Kg: 27.5, reps: "10–15", compound: true),
        ProgramExercise("Hip Adduction", sets: 3, wk1Kg: 55, reps: "12–15"),
        ProgramExercise("Leg Extension", sets: 3, wk1Kg: 42.5, reps: "10–15"),
        ProgramExercise("Seated Leg Curl", sets: 2, wk1Kg: 45, reps: "10–15"),
        ProgramExercise("Calf Press", sets: 3, wk1Kg: 72.5, reps: "10–15"),
        ProgramExercise("Reverse Crunch", sets: 3, wk1Kg: nil, reps: "15–20"),
        ProgramExercise("Hollow Rock", sets: 3, wk1Kg: nil, reps: "38s", note: "seconds"),
    ]

    /// `PROGRAMS`, in declaration order. `Programs.all` is the same three plans
    /// WITHOUT their decks — the picker's list; this is the decks themselves.
    static let all: [Program] = [helix5, helix4, pplLegacy]

    /// `PROGRAMS[id]` — nil for an id nothing claims. The fallback is the
    /// caller's, as it is everywhere in `programs.ts` (`?? APEX51`).
    static func byId(_ id: String) -> Program? {
        all.first { $0.id == id }
    }
}

// MARK: - Eras

/// Which block a date belongs to. Sessions are classified purely by date —
/// there is no era column anywhere.
public enum Era: String, Codable, Sendable {
    case ppl, axis

    /// The Week-1 schedule anchor: the recomposition era's first Sunday.
    public static let axisEraStart = "2026-07-19"

    /// The Helix Cut block opens here, absorbing the former Week-0 transition
    /// days (15–17 Jul) — so this, not `axisEraStart`, is the era boundary.
    /// Jul 15 is a Wednesday and correctly reads as a rest day under Helix-5.
    public static let helixCutStart = "2026-07-15"

    /// `eraForDate`. A plain string comparison, as the web does it: an
    /// unparseable date sorts wherever its first byte puts it.
    public static func forDate(_ dateISO: String) -> Era {
        dateISO >= helixCutStart ? .axis : .ppl
    }
}
