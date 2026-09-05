import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// The record book — ASSERTED, not derived. A port of `src/lib/training/prSeed.ts`.
//
// The engine can only call something a record by comparing it to an earlier
// set it can see, and for the July 2026 era it could see neither the Hevy
// history nor the intent behind a session. Rather than tune the rules until the
// output happens to match, that era is declared: this list IS the record book
// for every session on or before `cutoff`, and detection is suppressed there
// entirely. From the day after, the list is inert and detection runs normally
// against baselines built from the FULL set history.
//
// Individual post-cutoff sessions can also be asserted (`assertedDates`). The
// match is deliberately strict — date, canonical exercise, set number, load AND
// reps must all agree — so an edited set drops out of the seed rather than
// carrying a record it no longer earned.
// ─────────────────────────────────────────────────────────────────────────────

public struct SeededPr: Codable, Equatable, Sendable {
    /// Session date, ISO `YYYY-MM-DD`.
    public var date: String
    /// Exercise name as logged; compared canonicalised.
    public var exercise: String
    /// 1-based set number within the exercise.
    public var setNumber: Int
    public var weightKg: Double
    /// Reps, or SECONDS for a timed hold.
    public var reps: Double
    public var axes: [PrAxis]

    public init(date: String, exercise: String, setNumber: Int, weightKg: Double, reps: Double, axes: [PrAxis]) {
        self.date = date; self.exercise = exercise; self.setNumber = setNumber
        self.weightKg = weightKg; self.reps = reps; self.axes = axes
    }
}

public enum PrSeed {
    /// Last session date governed by the seed ERA. After this, detection is live.
    public static let cutoff = "2026-07-31"

    /// Post-cutoff sessions whose record set is asserted rather than derived.
    public static let assertedDates: [String] = ["2026-08-02"]

    /// 23 records across 12 sessions. `pr-seed-book.json` pins this list against the TypeScript.
    public static let records: [SeededPr] = [
        // Jul 16 · Upper B
        SeededPr(date: "2026-07-16", exercise: "Preacher Curl (Machine)", setNumber: 2, weightKg: 17.5, reps: 12, axes: [.volume, .e1rm]),
        // Jul 17 · Legs & Core B
        SeededPr(date: "2026-07-17", exercise: "Hip Thrust (Machine)", setNumber: 1, weightKg: 25, reps: 14, axes: [.volume]),
        // Jul 19 · Upper A
        SeededPr(date: "2026-07-19", exercise: "Face Pull", setNumber: 1, weightKg: 16.25, reps: 15, axes: [.volume, .e1rm]),
        // Jul 20 · Legs & Core A
        SeededPr(date: "2026-07-20", exercise: "Calf Press", setNumber: 1, weightKg: 67.5, reps: 15, axes: [.volume, .e1rm]),
        // Jul 21 · Delts & Arms
        SeededPr(date: "2026-07-21", exercise: "DB Shoulder Press", setNumber: 2, weightKg: 30, reps: 11, axes: [.volume, .e1rm]),
        SeededPr(date: "2026-07-21", exercise: "Single Arm Lateral Raise (Cable)", setNumber: 3, weightKg: 5, reps: 10, axes: [.weight, .e1rm]),
        SeededPr(date: "2026-07-21", exercise: "Cable Overhead Extension", setNumber: 1, weightKg: 10, reps: 15, axes: [.volume]),
        SeededPr(date: "2026-07-21", exercise: "Cable Overhead Extension", setNumber: 2, weightKg: 11.25, reps: 13, axes: [.e1rm]),
        SeededPr(date: "2026-07-21", exercise: "DB Hammer Curl", setNumber: 1, weightKg: 20, reps: 12, axes: [.weight, .volume, .e1rm]),
        // Jul 23 · Upper B
        SeededPr(date: "2026-07-23", exercise: "Neutral-Grip Lat Pulldown", setNumber: 2, weightKg: 47, reps: 9, axes: [.weight]),
        SeededPr(date: "2026-07-23", exercise: "Single Arm Cable Crossover", setNumber: 2, weightKg: 8.75, reps: 12, axes: [.weight, .e1rm]),
        SeededPr(date: "2026-07-23", exercise: "Single Arm Lateral Raise (Cable)", setNumber: 2, weightKg: 5, reps: 13, axes: [.volume, .e1rm]),
        // Jul 24 · Legs & Core B
        SeededPr(date: "2026-07-24", exercise: "Romanian Deadlift (DB)", setNumber: 1, weightKg: 35, reps: 12, axes: [.weight, .volume, .e1rm]),
        SeededPr(date: "2026-07-24", exercise: "Hip Thrust (Machine)", setNumber: 2, weightKg: 27.5, reps: 12, axes: [.e1rm]),
        SeededPr(date: "2026-07-24", exercise: "Side Plank", setNumber: 1, weightKg: 0, reps: 57, axes: [.reps]),
        // Jul 27 · Legs & Core A
        SeededPr(date: "2026-07-27", exercise: "Hack Squat", setNumber: 2, weightKg: 55, reps: 11, axes: [.volume, .e1rm]),
        // Jul 28 · Delts & Arms
        SeededPr(date: "2026-07-28", exercise: "Single Arm Lateral Raise (Cable)", setNumber: 1, weightKg: 5, reps: 15, axes: [.volume, .e1rm]),
        SeededPr(date: "2026-07-28", exercise: "Cable Overhead Extension", setNumber: 1, weightKg: 11.25, reps: 15, axes: [.volume, .e1rm]),
        // Jul 30 · Upper B — the WIDE-BAR row, renamed with the 2026-08-06 split.
        SeededPr(date: "2026-07-30", exercise: "Seated Cable Row (Wide Grip)", setNumber: 2, weightKg: 42.5, reps: 10, axes: [.weight, .volume, .e1rm]),
        // Jul 31 · Legs & Core B
        SeededPr(date: "2026-07-31", exercise: "Hip Thrust (Machine)", setNumber: 2, weightKg: 27.5, reps: 13, axes: [.volume, .e1rm]),
        SeededPr(date: "2026-07-31", exercise: "Side Plank", setNumber: 1, weightKg: 0, reps: 58, axes: [.reps]),
        // Aug 2 · Upper A — asserted, not derived (see `assertedDates`).
        SeededPr(date: "2026-08-02", exercise: "Incline DB Press", setNumber: 2, weightKg: 40, reps: 10, axes: [.weight, .e1rm]),
        SeededPr(date: "2026-08-02", exercise: "Chest Press (Machine)", setNumber: 2, weightKg: 40, reps: 8, axes: [.weight]),
    ]

    /// `${date}|${canonical name, lower-cased}|${setNumber}` — a later duplicate wins, as `new Map` does.
    private static let index: [String: SeededPr] = Dictionary(
        records.map { (key($0.date, $0.exercise, $0.setNumber), $0) },
        uniquingKeysWith: { _, last in last }
    )

    private static func key(_ date: String, _ exercise: String, _ setNumber: Int) -> String {
        "\(date)|\(ExerciseAliases.canonicalName(exercise).lowercased())|\(setNumber)"
    }

    /// Is this session's record set asserted rather than derived? True for the
    /// whole seeded era (≤ `cutoff`, compared as ISO strings) and for any date
    /// in `assertedDates`. A dateless session is LIVE, never asserted.
    public static func isAssertedSession(_ date: String?) -> Bool {
        guard let date else { return false }
        return date <= cutoff || assertedDates.contains(date)
    }

    /// The asserted axes for one logged set, or `[]`. Load is matched within
    /// 0.001, reps exactly; an edited set drops out instead of carrying a record
    /// it no longer earned.
    public static func seededAxes(date: String?, exercise: String?, setNumber: Int?, weightKg: Double, reps: Double) -> [PrAxis] {
        guard let date, !date.isEmpty, let exercise, !exercise.isEmpty, let setNumber else { return [] }
        guard let hit = index[key(date, exercise, setNumber)] else { return [] }
        guard abs(hit.weightKg - weightKg) < 0.001, hit.reps == reps else { return [] }
        return hit.axes
    }
}
