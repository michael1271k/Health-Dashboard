import Foundation
import Testing
@testable import OnyxCore

/// The ring's geometry, which is the one part of that chart that can be wrong
/// without looking wrong.
///
/// A screenshot proves the eight hues are distinguishable and that the gaps are
/// there. It cannot prove the arcs still close the circle once a half-set
/// family has been floored up to a readable width, because a ring two degrees
/// short looks exactly like a ring that is not.
@Suite("Muscle ring arcs")
struct MuscleRingArcsTests {

    private let gap = MuscleRingArcs.gap
    private let floor = MuscleRingArcs.minSweep

    /// Degrees of arc, plus one gap per arc, is a full circle. Every time.
    private func closes(_ sweeps: [Double], gaps: Int) -> Bool {
        abs(sweeps.reduce(0, +) + Double(gaps) * gap - 360) < 0.001
    }

    @Test("an even week splits evenly and still leaves room for the gaps")
    func evenWeek() {
        let out = MuscleRingArcs.sweeps([5, 5, 5, 5], gaps: 4)
        #expect(out.allSatisfy { abs($0 - (360 - 4 * gap) / 4) < 0.001 })
        #expect(closes(out, gaps: 4))
    }

    @Test("a half-set family is floored to a readable width, not dropped")
    func floorsTheTiny() {
        // 0.5 of 41 sweeps about 4° — narrower than the gap beside it, which
        // reads as a rendering fault rather than as data.
        let out = MuscleRingArcs.sweeps([13, 8, 7.5, 5, 4, 3, 0.5], gaps: 7)
        #expect(out.last == floor)
        #expect(closes(out, gaps: 7))
        // The degrees came off the arcs that had room, in proportion — never
        // off another floored one, and never off the gaps.
        #expect(out[0] > out[1] && out[1] > out[2])
    }

    @Test("the floor cannot push the ring past a full circle")
    func worstCaseStillCloses() {
        // Seven families at a tenth of a set and one that did everything: the
        // floor claims degrees it did not earn, and all of it has to come out
        // of the one arc with room to give.
        let out = MuscleRingArcs.sweeps([100, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1], gaps: 8)
        #expect(out.dropFirst().allSatisfy { $0 == floor })
        #expect(out[0] > 300)
        #expect(closes(out, gaps: 8))
    }

    @Test("a true zero draws no arc at all")
    func zeroIsNotAnArc() {
        // The caller filters zeros before it gets here, so this is the
        // function's own guard rather than a live path — and it is the rule
        // that makes the ring differ from the widget's bar row, which floors
        // its zeros at 2 pt because a bar HAS a baseline to sit on.
        let out = MuscleRingArcs.sweeps([10, 0, 5], gaps: 2)
        #expect(out[1] == 0)
        #expect(closes(out, gaps: 2))
    }

    @Test("a week with nothing in it draws nothing")
    func emptyWeek() {
        #expect(MuscleRingArcs.sweeps([0, 0, 0], gaps: 0) == [0, 0, 0])
        #expect(MuscleRingArcs.sweeps([], gaps: 0).isEmpty)
    }
}
