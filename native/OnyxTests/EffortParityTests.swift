import OnyxCore
import Testing
@testable import Onyx

/// The RPE ladder exists twice, and this is what stops the two copies drifting.
///
/// ── WHY THERE ARE TWO, AND WHY NEITHER WAS DELETED IN WAVE 10 ───────────────
/// `Onyx.RpeLadder` (the app target) and `OnyxCore.Effort.ladder` were built in
/// different waves and are byte-identical today. The Watch client needs the
/// ladder and cannot see the app target, so it reads the `OnyxCore` one — which
/// makes the duplication load-bearing for the first time: a rung that moved in
/// one copy and not the other would mean the phone and the watch writing
/// different numbers into the same `workout_sets.rpe` column, and rendering the
/// same set with words from two different scales.
///
/// Deleting the app's copy is the right end state and it is not this wave's
/// work: it touches six shipping logger files to remove a duplication that is
/// currently exact, and Wave 10 already changed the merge rules underneath them.
///
/// ponytail: two ladders held in step by a test rather than one ladder. Collapse
/// `Onyx.RpeLadder` into `OnyxCore.Effort` when the logger next needs an edit
/// there; this test is the safety net until then, and its failure IS the signal.
@Suite("Effort ladder parity")
struct EffortParityTests {

    @Test("the app's ladder and OnyxCore's are the same eight rungs")
    func laddersAgree() {
        #expect(RpeLadder.stops.count == Effort.ladder.count)
        #expect(RpeLadder.stops.map(\.value) == Effort.ladder.map(\.value))
        #expect(RpeLadder.stops.map(\.label) == Effort.ladder.map(\.label))
        #expect(RpeLadder.stops.map(\.hint) == Effort.ladder.map(\.hint))
    }

    /// The values that actually reach Postgres. `workout_sets.rpe` is
    /// `numeric(3,1)` and holds 2,190 rows on this ladder; a rung off the 0.5
    /// grid would be stored, read back, and match no rung on either device.
    @Test("every rung is on the half-point grid the column stores")
    func rungsAreOnTheGrid() {
        for stop in Effort.ladder {
            #expect((stop.value * 2).truncatingRemainder(dividingBy: 1) == 0, "\(stop.value) is off the grid")
        }
        #expect(Effort.ladder.map(\.value) == Effort.ladder.map(\.value).sorted())
    }

    /// The watch scrubs `Effort.ladder` BY INDEX and writes `stop.value`. Both
    /// clients then have to name that value the same way — which they do only
    /// because `rpeStopIndex` finds it rather than falling through to the CR-10
    /// anchor, the failure a uniform "6 to 10 in half steps" scrubber would have
    /// caused on every rung it invented.
    @Test("a value the watch writes is a rung the phone can name")
    func watchValuesResolveOnThePhone() {
        for stop in Effort.ladder {
            #expect(Effort.rpeStopIndex(stop.value) >= 0)
            #expect(RpeLadder.stop(for: stop.value)?.label == stop.label)
        }
    }
}
