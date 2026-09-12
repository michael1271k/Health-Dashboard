import Foundation

/// Plate maths, so nobody does it holding a phone in a gym.
///
/// ── WHY A LADDER OF CHIPS AND NOT A GENERATED SET ───────────────────────────
/// The obvious build is one button that produces "2–3 warm-up sets" from the
/// working weight. It is also the build that is wrong about half the time: how
/// many ramp-up sets a lift wants depends on the lift, the day, the temperature
/// of the room and whether the previous exercise already warmed the same joint.
/// A fixed ladder gets deleted by hand on the days it is wrong, which is worse
/// than no ladder at all — you now do plate maths AND tidying.
///
/// So the app offers the RUNGS and the person builds the ladder: tap 50%, tap
/// 75%, stop. One tap per set, each one a number you would otherwise work out
/// in your head from a weight you can see.
///
/// ── AND WHY THE INCREMENT IS READ OFF THE TARGET, NOT AN EQUIPMENT TABLE ────
/// The first design keyed the rounding to equipment: barbell 2.5, dumbbell 2,
/// machine 5. That needs an equipment answer for every movement, and this
/// package does not have one — `exercises.equipment` lives in the web and the
/// Swift side has only name heuristics (`Flags.swift`), which are guesses that
/// would be wrong on exactly the movements a person cares most about loading
/// correctly.
///
/// The target weight is not a guess. Someone working at 42.5 kg is on 2.5 kg
/// jumps; someone at 3.75 kg is on 1.25s; someone at 65 kg on a stack is on 5s.
/// Reading the granularity off the number in front of you needs no table, no
/// name matching, and adapts to the actual machine — including the one whose
/// stack is in pounds and lands on 2.27 kg steps, where every table would lie.
public enum Warmup {

    /// The rungs offered, as percentages of the top working set.
    ///
    /// Five, not three: the point of a chip row is that the ladder is yours. 40
    /// is the "empty bar and a plate" opener, 90 is the single you take before a
    /// heavy top set, and the three between them are the ordinary ramp.
    public static let percentages = [40, 50, 60, 75, 90]

    /// The load increments this app will round to, coarsest first.
    static let steps: [Double] = [5, 2.5, 2, 1.25, 1]

    /// The granularity the target weight is itself expressed in.
    ///
    /// The coarsest step that divides the target exactly, so 70 kg → 5, 42.5 →
    /// 2.5, 3.75 → 1.25, 24 → 2. A target that divides by nothing in the table
    /// (a 2.27 kg-per-plate imperial stack, a 61.4 kg reading) falls back to
    /// 2.5 rather than inventing a precision the gym does not have.
    public static func step(forTarget kg: Double) -> Double {
        guard kg > 0 else { return 2.5 }
        for step in steps where divides(step, kg) { return step }
        return 2.5
    }

    /// `kg` is a whole number of `step`s, within a tolerance that survives the
    /// binary representation of 42.5 and 3.75.
    private static func divides(_ step: Double, _ kg: Double) -> Bool {
        let quotient = kg / step
        return abs(quotient - quotient.rounded()) < 1e-6
    }

    /// The load for a rung, rounded DOWN to the target's own increment.
    ///
    /// Down, not nearest: a warm-up that rounds up is heavier than the fraction
    /// asked for, and the whole point of the rung is to arrive under the working
    /// weight. Never below one increment — a 40% rung on a 5 kg dumbbell is the
    /// smallest thing in the rack, not zero.
    public static func load(percent: Int, of targetKg: Double) -> Double {
        guard targetKg > 0 else { return 0 }
        let step = step(forTarget: targetKg)
        let raw = targetKg * Double(percent) / 100
        let rounded = (raw / step).rounded(.down) * step
        return max(step, min(targetKg, jsRound1(rounded)))
    }

    /// Reps for a rung.
    ///
    /// Off the PERCENTAGE, not off the working set's rep count. A warm-up is
    /// about moving the joint through the range under a fraction of the load,
    /// and eight reps at 40% is eight reps whether the working set is a triple
    /// or a set of fifteen. Scaling with the working reps produced a 22-rep
    /// warm-up on a 15-rep leg press, which is not a warm-up, it is a set.
    public static func reps(percent: Int) -> Int {
        switch percent {
        case ..<50: 8
        case ..<65: 5
        case ..<80: 3
        default: 2
        }
    }

    /// One rung, as the chip row draws it.
    public struct Rung: Equatable, Sendable, Identifiable {
        public var percent: Int
        public var kg: Double
        public var reps: Int
        public var id: Int { percent }
    }

    /// The rungs that are actually DISTINCT at this target's granularity.
    ///
    /// ── WHY THE ROW IS NOT ALWAYS FIVE CHIPS ────────────────────────────────
    /// On a 40 kg stack that moves in fives, 50% and 60% both round down to
    /// 20 kg. Drawing both gives two buttons that add the identical set, which
    /// reads as a bug in the arithmetic — the one thing a plate-maths feature
    /// cannot afford to look like.
    ///
    /// The lower percentage survives, because it is the one the resolved weight
    /// is honestly nearer to: 20 kg IS 50% of 40, and calling it 60% would be
    /// the chip rounding its own label to make itself look distinct.
    ///
    /// Deduping here rather than in the view so the rule is testable and so
    /// every surface that ever draws a ladder draws the same one.
    public static func rungs(of targetKg: Double) -> [Rung] {
        var seen = Set<Double>()
        return percentages.compactMap { percent in
            let kg = load(percent: percent, of: targetKg)
            guard kg > 0, seen.insert(kg).inserted else { return nil }
            return Rung(percent: percent, kg: kg, reps: reps(percent: percent))
        }
    }

    /// "50% · 35 kg × 5" — the chip's whole label.
    public static func label(percent: Int, of targetKg: Double) -> String {
        let kg = load(percent: percent, of: targetKg)
        return "\(percent)% · \(jsIntegerString(kg)) kg × \(reps(percent: percent))"
    }

    /// The weight a ladder is built from: the HEAVIEST working set on the card.
    ///
    /// Heaviest and not first, because a ramping prescription (57.5 then 70 then
    /// 70, as the leg press seeds) has its top set in the middle. Warming up to
    /// 75% of the opener would leave the actual top set unwarmed, which is the
    /// set the ladder exists for.
    ///
    /// Warm-ups are excluded, or a ladder built on a ladder ratchets downward
    /// every time a rung is added.
    public static func target(workingKg: [Double]) -> Double? {
        workingKg.filter { $0 > 0 }.max()
    }
}
