import Foundation
import OnyxCore

/// Real numbers, so the design is reviewed against real density.
///
/// ── WHY THIS IS THE ACTUAL SESSION AND NOT LOREM IPSUM ──────────────────────
/// A logger previewed on `3 × 10 @ 50 kg` looks fine and tells you nothing. The
/// loads below are from a real Upper B on a cut — 49.5 kg, 42.5 kg, 13.75 kg —
/// and they are what expose the layout problems that matter: a four-character
/// load beside a two-character rep count, an RPE of 9.5 rather than 9, and
/// "Single Arm Triceps Pushdown (Cable)" as a title on a 390 pt screen.
///
/// It also runs the SAME model as the device. A preview built from a parallel
/// mock is a preview that can be right about code the device does not run.
#if DEBUG
extension LoggerModel {

    /// Upper B, cut phase. `logged: true` reproduces a real mid-session state;
    /// `resting: true` leaves the rest clock running, which is the only state
    /// the nav-bar capsule exists in and therefore the only one that can be
    /// photographed.
    static func previewUpperB(logged: Bool = false, resting: Bool = false) -> LoggerModel {
        let model = LoggerModel(
            day: Program.onyx5.day(key: "cb_b")!,
            phase: .cut,
            startedAt: Date().addingTimeInterval(-22 * 60)
        )
        guard logged else { return model }

        // Chest Press (Machine) — three at 40, the last one graded 9.5.
        model.fill("Chest Press (Machine)", [(40, 12, 9), (40, 10, 9), (40, 10, 9.5)])
        // Neutral-Grip Lat Pulldown — a load increase inside the rep window,
        // which is exactly what double progression looks like on a good day.
        model.fill("Neutral-Grip Lat Pulldown", [(47, 12, 8.5), (49.5, 11, 9.5)])
        model.fill("Seated Cable Row (Wide Grip)", [(42.5, 12, 9), (42.5, 10, 9)])
        model.fill("Single Arm Cable Crossover", [(7.5, 15, 8)])
        if resting, let next = model.currentSet?.exercise { model.startRest(for: next) }
        return model
    }

    /// Tick a run of sets on one movement, exactly as the UI would.
    ///
    /// It calls `toggleDone` rather than setting `isDone`, so a preview
    /// exercises the record rule, the rest timer and the store write-through —
    /// the parts most likely to be wrong.
    private func fill(_ exerciseName: String, _ sets: [(Double, Int, Double?)]) {
        guard let exercise = exercises.first(where: { $0.name == exerciseName }) else { return }
        for (index, entry) in sets.enumerated() {
            while exercise.rows.count <= index { addSet(to: exercise) }
            let row = exercise.rows[index]
            row.weightKg = entry.0
            row.reps = entry.1
            row.rpe = entry.2
            toggleDone(row, in: exercise)
        }
        // The rest clock is a state the design has to be reviewed IN, but a
        // preview that seeded it from the last tick would show a bar counting
        // down from whichever movement happened to be filled last.
        stopRest()
    }
}
#endif
