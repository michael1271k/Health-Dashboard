import Testing
import OnyxCore
@testable import Onyx

/// The logger's own state machine.
///
/// ── WHY THIS TARGET EXISTS AT ALL ───────────────────────────────────────────
/// `OnyxCore` and `OnyxData` test on the command line in seconds, which is
/// why almost everything provable lives there. `LoggerModel` cannot: it is
/// `@MainActor`, it holds `@Observable` view state, and the rule it enforces —
/// what happens to sets you have ALREADY LOGGED when the prescription changes
/// under them — is not domain arithmetic and has nowhere else to go.
///
/// It is also the code in this wave that was wrong twice. Both faults below had
/// the same shape: a rebuild that honoured the new prescription by quietly
/// discarding work the old one had produced.
@MainActor
@Suite("Logger model")
struct LoggerModelTests {

    private func armsBulk() -> LoggerModel {
        LoggerModel(day: Program.onyx5.day(key: "arms")!, phase: .bulk)
    }

    private func log(_ model: LoggerModel, _ name: String, sets: Int) {
        guard let exercise = model.exercises.first(where: { $0.name == name }) else {
            Issue.record("no exercise named \(name)")
            return
        }
        for index in 0..<sets {
            while exercise.rows.count <= index { model.addSet(to: exercise) }
            let row = exercise.rows[index]
            row.weightKg = 20
            row.reps = 10
            model.toggleDone(row, in: exercise)
        }
    }

    @Test("switching to a cut keeps a dropped lift that already carries work")
    func cutDoesNotEraseLoggedSets() {
        let model = armsBulk()
        // `Seated DB Wrist Curl` is `cutSets: 0` — the cut drops it entirely.
        #expect(model.exercises.contains { $0.name == "Seated DB Wrist Curl" })
        log(model, "Seated DB Wrist Curl", sets: 2)

        model.phase = .cut

        let survivor = model.exercises.first { $0.name == "Seated DB Wrist Curl" }
        #expect(survivor != nil, "a lift with logged sets must not vanish with the prescription")
        #expect(survivor?.rows.count == 2)
        #expect(survivor?.rows.allSatisfy(\.isDone) == true)
        // ...and the blanks it no longer prescribes are gone.
        #expect(model.exercises.first { $0.name == "Cable Overhead Extension" }?.rows.count == 2)
    }

    @Test("a dropped lift with NO logged work does leave")
    func cutDropsUntouchedLifts() {
        let model = armsBulk()
        model.phase = .cut
        #expect(model.exercises.contains { $0.name == "Seated DB Wrist Curl" } == false)
        #expect(model.exercises.count == 7)
    }

    @Test("trimming sets does not reorder the ones already logged")
    func rebuildPreservesRowOrder() {
        let model = armsBulk()
        // Bulk prescribes 3 of these; cut prescribes 2. Tick the LAST one only,
        // so a rebuild that sorts ticked rows to the top is visible.
        let exercise = model.exercises.first { $0.name == "DB Hammer Curl" }!
        #expect(exercise.rows.count == 3)
        let ids = exercise.rows.map(\.id)
        let third = exercise.rows[2]
        third.weightKg = 16
        third.reps = 10
        model.toggleDone(third, in: exercise)

        model.phase = .cut

        let rebuilt = model.exercises.first { $0.name == "DB Hammer Curl" }!
        #expect(rebuilt.rows.count == 2)
        // The logged row is still LAST, not promoted to the front.
        #expect(rebuilt.rows.last?.id == ids[2])
        #expect(rebuilt.rows.first?.id == ids[0])
    }

    @Test("a set with no reps cannot be ticked")
    func repsAreRequiredToLog() {
        let model = armsBulk()
        let exercise = model.exercises[0]
        let row = exercise.rows[0]
        row.weightKg = 28
        row.reps = nil

        #expect(model.toggleDone(row, in: exercise) == false)
        #expect(row.isDone == false)
        // Zero tonnage, and no rest timer started for a set that did not happen.
        #expect(model.totalVolumeKg == 0)
        #expect(model.restEndsAt == nil)
    }

    @Test("a zero-kilogram set is real work and a nil load is not zero")
    func bodyweightSetsCount() {
        let model = LoggerModel(day: Program.onyx5.day(key: "legs_b")!, phase: .cut)
        let raise = model.exercises.first { $0.name == "Hanging Knee Raise" }!
        // The deck seeds no load for it, and nil is not 0 — nothing has silently
        // become a zero-kilogram set on the way in.
        #expect(raise.rows[0].weightKg == nil)

        raise.rows[0].weightKg = 0
        raise.rows[0].reps = 12
        #expect(model.toggleDone(raise.rows[0], in: raise))
        #expect(raise.physicalSets == 1)
        // Zero tonnage, but a set that counts everywhere sets are counted.
        #expect(model.totalVolumeKg == 0)
        #expect(model.completedSets == 1)
    }

    @Test("warm-ups count for the body and not for the prescription")
    func warmupsCountOnlyWhereTheyShould() {
        let model = armsBulk()
        let press = model.exercises.first { $0.name == "DB Shoulder Press" }!
        press.rows[0].weightKg = 12
        press.rows[0].reps = 15
        model.setKind(.warmup, on: press.rows[0], in: press)
        model.toggleDone(press.rows[0], in: press)

        #expect(press.physicalSets == 1)   // the body was asked to do it
        #expect(press.workingSets == 0)    // the program was not
        #expect(model.completedSets == 0)

        // And it reaches the muscle sheet, because that is the one question a
        // warm-up genuinely answers.
        #expect(model.muscleSets[.frontDelts] == 1)
        #expect(model.muscleSets[.triceps] == 0.5)
    }

    @Test("a ghost set counts for nothing, anywhere")
    func ghostSetsAreExcluded() {
        let model = armsBulk()
        let press = model.exercises.first { $0.name == "DB Shoulder Press" }!
        press.rows[0].weightKg = 28
        press.rows[0].reps = 10
        model.toggleDone(press.rows[0], in: press)
        model.setKind(.ghost, on: press.rows[0], in: press)

        #expect(press.physicalSets == 0)
        #expect(press.volumeKg == 0)
        #expect(model.muscleSets.isEmpty)
    }

    @Test("ticking a set starts the movement's own prescribed rest")
    func tickStartsRest() {
        let model = armsBulk()
        let press = model.exercises.first { $0.name == "DB Shoulder Press" }!
        #expect(press.plan.restSec == 105)
        press.rows[0].weightKg = 28
        press.rows[0].reps = 10
        model.toggleDone(press.rows[0], in: press)

        #expect(model.restDuration == 105)
        #expect(model.restingExercise == "DB Shoulder Press")

        // Pulling the clock below now ENDS it rather than counting negative.
        model.adjustRest(by: -600)
        #expect(model.restEndsAt == nil)
        #expect(model.restingExercise == nil)
    }

    @Test("the volume curve is cumulative, capped, and silent below two points")
    func volumeCurveShape() {
        let model = armsBulk()
        #expect(model.volumeCurve.isEmpty)

        log(model, "DB Shoulder Press", sets: 1)
        // One point is not a trend; a single dot on an axis reads as a failure.
        #expect(model.volumeCurve.isEmpty)

        log(model, "Seated Incline DB Curl", sets: 3)
        let curve = model.volumeCurve
        #expect(curve.count == 4)
        #expect(curve == curve.sorted(), "cumulative tonnage cannot decrease")
        #expect(curve.last == model.totalVolumeKg)
    }

    @Test("the current set is the first one not yet ticked")
    func currentSetWalksForward() {
        let model = armsBulk()
        #expect(model.currentSet?.exercise.name == "DB Shoulder Press")
        #expect(model.currentSet?.ordinal == 1)

        log(model, "DB Shoulder Press", sets: 3)
        #expect(model.currentSet?.exercise.name == "Single Arm Lateral Raise (Cable)")
        #expect(model.currentSet?.total == 5)
    }
}
