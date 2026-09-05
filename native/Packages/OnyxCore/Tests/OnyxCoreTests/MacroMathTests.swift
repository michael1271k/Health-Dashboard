import Testing
@testable import OnyxCore

/// The one rule `MacroEditSheet` cannot be allowed to break: whatever moved,
/// the calories on screen are the Atwater sum of the macros on screen.
///
/// ── WHY THE PROPERTIES AND NOT MORE EXAMPLES ────────────────────────────────
/// The first version of `absorb` passed every example below and was still
/// wrong: it took a macro's whole share of the leftover or none of it, so
/// asking for 327 kcal landed on 324 while asking for 326 landed on 328, and
/// re-applying the SAME request moved the answer. Neither fault is visible in
/// an example test, because each individual answer looks reasonable. They are
/// visible as properties — idempotence and monotonicity — so those are tested
/// over a sweep rather than at three points.
@Suite("MacroMath")
struct MacroMathTests {

    private func atwater(_ m: MacroMath.Macros) -> Double {
        (m.protein ?? 0) * 4 + (m.carbs ?? 0) * 4 + (m.fat ?? 0) * 9
    }

    /// 128 P · 140 C · 42 F is 1,450 kcal by Atwater, and the fixture says so:
    /// a starting state that breaks the invariant cannot test edits that are
    /// supposed to preserve it.
    private let day = MacroMath.Macros(kcal: 1_450, protein: 128, carbs: 140, fat: 42)

    @Test("editing a macro restates the calories")
    func macroEditRecomputes() {
        let next = MacroMath.adjust(day, edited: .protein(140))
        #expect(next.protein == 140)
        #expect(next.carbs == 140)
        #expect(next.fat == 42)
        #expect(next.kcal == atwater(next))
    }

    @Test("a calorie edit pins protein and lands on the figure asked for")
    func calorieEditAbsorbs() {
        let next = MacroMath.adjust(day, edited: .calories(1_700))
        #expect(next.protein == 128)
        #expect(next.kcal == atwater(next))
        // Within a carbohydrate gram. The loose bound this replaced (9 kcal, a
        // gram of FAT) was wide enough to hide a four-kcal miss on a figure
        // that was exactly reachable.
        #expect(abs(next.kcal - 1_700) <= 4)
        #expect((next.carbs ?? 0) > 140)
        #expect((next.fat ?? 0) > 42)
    }

    @Test("a decrease lands on its figure too")
    func calorieDecrease() {
        let next = MacroMath.adjust(day, edited: .calories(1_250))
        #expect(next.protein == 128)
        #expect(abs(next.kcal - 1_250) <= 4)
        #expect((next.carbs ?? 0) < 140)
        #expect((next.fat ?? 0) < 42)
    }

    @Test("carbohydrate and fat move in proportion to the energy they carry")
    func calorieEditKeepsShape() {
        let before = day
        let next = MacroMath.adjust(before, edited: .calories(before.kcal + 200))
        let carbGain = ((next.carbs ?? 0) - (before.carbs ?? 0)) * 4
        let fatGain = ((next.fat ?? 0) - (before.fat ?? 0)) * 9
        let carbEnergy = (before.carbs ?? 0) * 4
        let expected = carbEnergy / (carbEnergy + (before.fat ?? 0) * 9)
        #expect(abs(carbGain / (carbGain + fatGain) - expected) < 0.05)
    }

    @Test("an untracked macro is never handed a figure")
    func untrackedStaysNil() {
        let noCarbs = MacroMath.Macros(kcal: 1_158, protein: 150, carbs: nil, fat: 62)
        let next = MacroMath.adjust(noCarbs, edited: .calories(1_400))
        #expect(next.carbs == nil)
        #expect(next.protein == 150)
        #expect(next.kcal == atwater(next))
        #expect(abs(next.kcal - 1_400) <= 9)
    }

    @Test("with nothing to move, the figure asked for stands")
    func nothingTrackedKeepsTheFigure() {
        // A kcal-only day. Answering with protein's own energy — zero, here —
        // would delete a number the user typed and show one they did not.
        let bare = MacroMath.Macros(kcal: 1_800, protein: nil, carbs: nil, fat: nil)
        let next = MacroMath.adjust(bare, edited: .calories(2_000))
        #expect(next.kcal == 2_000)
        #expect(next.protein == nil)
        #expect(next.carbs == nil)
        #expect(next.fat == nil)
    }

    @Test("nothing goes negative, and the calories still tell the truth")
    func clampsAtZero() {
        let next = MacroMath.adjust(day, edited: .calories(0))
        #expect((next.carbs ?? 0) >= 0)
        #expect((next.fat ?? 0) >= 0)
        // Protein alone is 512 kcal and it is pinned, so zero is unreachable —
        // and the reading must say 512, not the 0 that was asked for.
        #expect(next.kcal == atwater(next))
        #expect(next.kcal == 512)
    }

    @Test("a day at zero puts the whole difference into carbohydrate")
    func emptyDayFillsCarbs() {
        let empty = MacroMath.Macros(kcal: 0, protein: 0, carbs: 0, fat: 0)
        let next = MacroMath.adjust(empty, edited: .calories(400))
        #expect(next.fat == 0)
        #expect(next.carbs == 100)
        #expect(next.kcal == 400)
    }

    @Test("a macro sitting at zero is not frozen there")
    func oneMacroAtZeroStillMoves() {
        // With carbohydrate at 0 g, an energy-share split gives it 0 % of every
        // future change and the whole increase lands on fat forever.
        let noCarbs = MacroMath.Macros(kcal: 760, protein: 100, carbs: 0, fat: 40)
        let next = MacroMath.adjust(noCarbs, edited: .calories(1_000))
        #expect((next.carbs ?? 0) > 0)
        #expect(abs(next.kcal - 1_000) <= 4)
    }

    // MARK: - Properties

    /// Every state the sheet can be in, coarsely: the grid is what turned two
    /// reasonable-looking examples into a reproducible fault.
    private var sweep: [MacroMath.Macros] {
        var out: [MacroMath.Macros] = []
        for protein in stride(from: 0.0, through: 200, by: 40) {
            for carbs in stride(from: 0.0, through: 240, by: 60) {
                for fat in stride(from: 0.0, through: 80, by: 20) {
                    out.append(MacroMath.Macros(
                        kcal: protein * 4 + carbs * 4 + fat * 9,
                        protein: protein, carbs: carbs, fat: fat
                    ))
                }
            }
        }
        return out
    }

    @Test("the same request always gives the same answer")
    func idempotent() {
        for start in sweep {
            for ask in stride(from: 0.0, through: 3_000, by: 137) {
                let once = MacroMath.adjust(start, edited: .calories(ask))
                let twice = MacroMath.adjust(once, edited: .calories(ask))
                #expect(once == twice, "\(start) asked \(ask): \(once.kcal) then \(twice.kcal)")
            }
        }
    }

    @Test("asking for more never gives less")
    func monotonic() {
        for start in sweep {
            var previous = -1.0
            for ask in stride(from: 0.0, through: 3_000, by: 53) {
                let kcal = MacroMath.adjust(start, edited: .calories(ask)).kcal
                #expect(kcal >= previous - 0.001, "\(start) asked \(ask): \(kcal) after \(previous)")
                previous = kcal
            }
        }
    }

    @Test("the calories are always the macros, and the macros are always whole")
    func invariantHolds() {
        for start in sweep {
            for ask in stride(from: 0.0, through: 3_000, by: 211) {
                let next = MacroMath.adjust(start, edited: .calories(ask))
                #expect(next.kcal == atwater(next))
                for gram in [next.protein, next.carbs, next.fat].compactMap({ $0 }) {
                    #expect(gram >= 0)
                    #expect(gram == gram.rounded())
                }
            }
        }
    }
}
