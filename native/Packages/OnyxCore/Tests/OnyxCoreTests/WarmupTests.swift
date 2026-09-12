import Foundation
import Testing
@testable import OnyxCore

@Suite("Warm-up rungs — plate maths nobody should do in a gym")
struct WarmupTests {

    // MARK: - Reading the increment off the target

    @Test("the granularity comes from the weight in front of you")
    func stepIsReadOffTheTarget() {
        // A stack in fives, a bar in 2.5s, a small dumbbell in 1.25s, a fixed
        // dumbbell rack in 2s. No equipment table, no name matching, and right
        // on all four.
        #expect(Warmup.step(forTarget: 70) == 5)
        #expect(Warmup.step(forTarget: 42.5) == 2.5)
        #expect(Warmup.step(forTarget: 3.75) == 1.25)
        #expect(Warmup.step(forTarget: 24) == 2)
    }

    @Test("a weight that divides by nothing falls back rather than inventing precision")
    func unknownGranularityFallsBack() {
        // 61.4 kg is an imperial stack read in kilos. Rounding a warm-up to
        // 0.1 kg there would print a number no pin in the gym can produce.
        #expect(Warmup.step(forTarget: 61.4) == 2.5)
        #expect(Warmup.step(forTarget: 0) == 2.5)
    }

    // MARK: - The rungs

    @Test("a rung rounds DOWN to the target's own increment")
    func roundsDown() {
        // 50% of 42.5 is 21.25, which is not a load on a 2.5 kg bar. Down to
        // 20, never up to 22.5: a warm-up heavier than the fraction asked for
        // defeats the purpose of the rung.
        #expect(Warmup.load(percent: 50, of: 42.5) == 20)
        #expect(Warmup.load(percent: 75, of: 42.5) == 30)
        #expect(Warmup.load(percent: 40, of: 70) == 25)
        #expect(Warmup.load(percent: 90, of: 70) == 60)
    }

    @Test("a rung never lands on zero, and never exceeds the working weight")
    func staysInsideTheRack() {
        // 40% of 5 kg is 2 kg, which is below the 1.25 granularity 5 implies…
        // no: 5 divides by 5, so the step is 5 and the rung floors to 0. The
        // floor is one increment — the smallest thing in the rack — because a
        // warm-up set of 0 kg is not a set.
        #expect(Warmup.load(percent: 40, of: 5) == 5)
        #expect(Warmup.load(percent: 90, of: 2.5) == 2.5)
        for percent in Warmup.percentages {
            let kg = Warmup.load(percent: percent, of: 42.5)
            #expect(kg > 0, "\(percent)% of 42.5 was zero")
            #expect(kg <= 42.5, "\(percent)% of 42.5 exceeded the working set")
        }
    }

    @Test("the ladder is monotonic — a heavier rung is never a lighter load")
    func rungsAscend() {
        for target in [2.5, 5.0, 24.0, 42.5, 70.0, 61.4] {
            let loads = Warmup.percentages.map { Warmup.load(percent: $0, of: target) }
            #expect(loads == loads.sorted(), "rungs went backwards at \(target) kg: \(loads)")
        }
    }

    @Test("reps come off the percentage, not off the working set")
    func repsAreAboutTheFraction() {
        // Scaling with the working reps produced a 22-rep warm-up on a 15-rep
        // leg press, which is not a warm-up, it is a set.
        #expect(Warmup.reps(percent: 40) == 8)
        #expect(Warmup.reps(percent: 50) == 5)
        #expect(Warmup.reps(percent: 60) == 5)
        #expect(Warmup.reps(percent: 75) == 3)
        #expect(Warmup.reps(percent: 90) == 2)
    }

    // MARK: - What the ladder is built from

    @Test("the target is the HEAVIEST working set, not the first")
    func targetIsTheTopSet() {
        // The leg press seeds 57.5, 70, 70 — a ramp whose top set is not the
        // opener. Warming to 75% of 57.5 leaves the set the ladder exists for
        // unwarmed.
        #expect(Warmup.target(workingKg: [57.5, 70, 70]) == 70)
        #expect(Warmup.target(workingKg: []) == nil)
        // A bodyweight card has nothing to ramp to and offers no ladder.
        #expect(Warmup.target(workingKg: [0, 0]) == nil)
    }

    @Test("the chip says the whole sum")
    func labelIsSelfExplanatory() {
        #expect(Warmup.label(percent: 50, of: 70) == "50% · 35 kg × 5")
        #expect(Warmup.label(percent: 75, of: 42.5) == "75% · 30 kg × 3")
    }
}

@Suite("Warm-up rungs — the row the card draws")
struct WarmupRungTests {

    @Test("percentages that resolve to the same load collapse to one chip")
    func dedupesByLoad() {
        // 40 kg moves in fives, so 50% and 60% both round down to 20. Two
        // buttons that add the identical set read as a bug in the arithmetic,
        // which is the one thing a plate-maths feature cannot look like.
        let rungs = Warmup.rungs(of: 40)
        #expect(rungs.map(\.kg) == [15, 20, 30, 35])
        // The LOWER percentage survives: 20 kg genuinely is 50% of 40, and
        // labelling it 60% would be the chip rounding its own label.
        #expect(rungs.map(\.percent) == [40, 50, 75, 90])
    }

    @Test("a fine-grained target keeps all five rungs")
    func keepsDistinctRungs() {
        #expect(Warmup.rungs(of: 42.5).count == 5)
        // 40% of 42.5 is 17.0, which floors to 15 on a 2.5 kg bar — not 17.5.
        // Rounding to NEAREST would have given 17.5 and put the opening rung
        // above the fraction asked for.
        #expect(Warmup.rungs(of: 42.5).map(\.kg) == [15, 20, 25, 30, 37.5])
    }

    @Test("every rung carries its own reps and is strictly ascending")
    func rungsAscend() {
        for target in [2.5, 5.0, 24.0, 40.0, 42.5, 70.0, 61.4] {
            let rungs = Warmup.rungs(of: target)
            #expect(rungs.map(\.kg) == rungs.map(\.kg).sorted(), "backwards at \(target)")
            #expect(Set(rungs.map(\.kg)).count == rungs.count, "duplicate load at \(target)")
            for rung in rungs { #expect(rung.reps == Warmup.reps(percent: rung.percent)) }
        }
    }

    @Test("a target with nothing to ramp to offers no ladder")
    func noTargetNoRungs() {
        #expect(Warmup.rungs(of: 0).isEmpty)
    }
}
