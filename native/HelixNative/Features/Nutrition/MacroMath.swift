import Foundation
import HelixCore

/// The arithmetic behind `MacroEditSheet`: change one figure, and the other
/// three stay a set of numbers that can be true at the same time.
///
/// ── WHY THIS FILE IS HERE AND NOT IN `HelixCore` ────────────────────────────
/// Phase 2 §6.3 puts `MacroMath` in `HelixCore/Nutrition/` with golden vectors
/// from a TypeScript twin, and gives it to Track E. That has not landed, and a
/// sheet whose steppers do not agree with each other is not shippable — so this
/// is the same contract, in the app target, with the rules written out. When the
/// engine version arrives, delete this file: the call sites are
/// `MacroMath.adjust(_:edited:)` and they compile unchanged.
///
/// ── THE ONE RULE ────────────────────────────────────────────────────────────
/// Calories are ALWAYS the Atwater sum of the macros on screen — 4 · protein +
/// 4 · carbohydrate + 9 · fat. Not "usually", not "unless the user typed a
/// figure": a sheet that shows 1,955 kcal beside macros that add to 1,880 is
/// asking which number is a lie, and the answer would be "both".
///
/// So editing a MACRO recomputes the calories, and editing the CALORIES moves
/// the macros until they add up. Protein is pinned through a calorie edit
/// because protein is the one figure this athlete's targets are built on;
/// carbohydrate and fat absorb the difference in proportion to the energy they
/// already carry, which keeps the shape of the day rather than dumping a
/// deficit into one macro.
enum MacroMath {

    /// The four figures a day is edited as. A `nil` macro is UNTRACKED — a day
    /// that does not grade carbohydrate has no carbohydrate figure, and it must
    /// not be handed one by arithmetic.
    struct Macros: Equatable {
        var kcal: Double
        var protein: Double?
        var carbs: Double?
        var fat: Double?

        init(kcal: Double = 0, protein: Double? = nil, carbs: Double? = nil, fat: Double? = nil) {
            self.kcal = kcal
            self.protein = protein
            self.carbs = carbs
            self.fat = fat
        }

        /// What the macros on screen actually come to.
        var atwater: Double {
            Levers.atwaterKcal(proteinG: protein ?? 0, carbsG: carbs ?? 0, fatG: fat ?? 0)
        }
    }

    /// Which stepper moved, and to what.
    enum Edit: Equatable {
        case calories(Double)
        case protein(Double)
        case carbs(Double)
        case fat(Double)
    }

    /// Grams are whole numbers here. A scale reads to the gram, HealthKit
    /// stores to the gram, and a stepper that lands on 42.3333 g is arithmetic
    /// leaking into the interface.
    private static func grams(_ value: Double) -> Double { max(0, value.rounded()) }

    static func adjust(_ current: Macros, edited: Edit) -> Macros {
        var next = current
        switch edited {
        case let .protein(value): next.protein = grams(value)
        case let .carbs(value):   next.carbs = grams(value)
        case let .fat(value):     next.fat = grams(value)
        case let .calories(value):
            let target = max(0, value.rounded())
            next = absorb(current, into: target)
            // Nothing tracked can move, so the macros cannot restate the
            // figure. Keep the figure rather than answering with a zero.
            if current.carbs == nil, current.fat == nil {
                next.kcal = target
                return next
            }
        }
        // Every other path ends here: the calories are the macros, restated.
        next.kcal = next.atwater
        return next
    }

    /// Move carbohydrate and fat until the day comes to `target` kcal.
    ///
    /// The split is by the ENERGY each macro currently carries (`c·4 : f·9`), so
    /// a 60/40 day stays roughly 60/40 rather than having 300 kcal poured into
    /// whichever macro the code happened to reach first. A macro that is
    /// untracked takes none of it; when neither is tracked there is nowhere for
    /// the difference to go and the target stands as asked.
    private static func absorb(_ current: Macros, into target: Double) -> Macros {
        var next = current
        guard current.carbs != nil || current.fat != nil else { return next }
        guard target != current.atwater else { return next }

        // ── WHY THIS IS A LOOP AND NOT TWO PASSES ───────────────────────────
        // It was two passes, on the theory that a sheet which iterates under a
        // finger stutters. It does not — this converges in at most two more
        // rounds — and the two-pass version was WRONG in a way no screenshot
        // shows: the second pass took a macro's whole share or none of it, so
        // asking for 327 kcal landed on 324 while asking for 326 landed on 328.
        // The same request had two answers depending on the path taken to it,
        // and raising the ask could lower the reading.
        for _ in 0..<4 {
            let delta = target - next.atwater
            guard abs(delta) >= 1 else { break }

            let carbEnergy = (next.carbs ?? 0) * 4
            let fatEnergy = (next.fat ?? 0) * 9
            let pool = carbEnergy + fatEnergy
            // A macro sitting at zero has no share of a ratio, so a pool built
            // from the current grams freezes it there forever. Carbohydrate is
            // this athlete's buffer — the macro a lever moves first — so it
            // takes the whole difference whenever the ratio cannot speak.
            let carbShare: Double = if pool > 0 && (next.carbs ?? 0) > 0 && (next.fat ?? 0) > 0 {
                carbEnergy / pool
            } else if next.carbs != nil {
                1
            } else {
                0
            }

            let before = next
            if next.carbs != nil {
                next.carbs = grams((next.carbs ?? 0) + delta * carbShare / 4)
            }
            if next.fat != nil {
                next.fat = grams((next.fat ?? 0) + delta * (1 - carbShare) / 9)
            }
            // Clamped at the floor with nowhere left to go: protein alone is
            // already more than the figure asked for.
            if next == before { break }
        }
        return next
    }
}
