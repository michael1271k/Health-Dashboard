import Foundation
import Testing
import GRDB
import OnyxCore
import OnyxData
import OnyxUI
@testable import Onyx

/// A set that is two rows, and a set that carries more than one tag.
///
/// ── WHY THESE TWO ARE ONE SUITE ─────────────────────────────────────────────
/// They are the two halves of the same sheet and they share one hazard: both
/// change what a SET IS, and every count in the app is downstream of that. A
/// pair scored as two sets nearly doubles a session's tonnage, and a tag list
/// that reorders itself turns every sync into an edit. Neither fails loudly.
@MainActor
@Suite("Unilateral sets and set quality")
struct UnilateralAndQualityTests {

    /// Delts & Arms — the one ONYX-5 day that prescribes a unilateral movement
    /// (`Single Arm Lateral Raise`) beside seven bilateral ones, so both halves
    /// of every rule below are on the same deck.
    private func armsDay() -> LoggerModel {
        LoggerModel(day: Program.onyx5.day(key: "arms")!, phase: .bulk)
    }

    private func unilateral(_ model: LoggerModel) -> LoggerModel.ExerciseState? {
        model.exercises.first { model.canSplit($0) }
    }

    // MARK: - What may be split

    @Test("the four the founder named all match, and a barbell press does not")
    func catalogueMatches() {
        // Splitting a BILATERAL set logs the session at half its size, so the
        // gate is the feature. These four are the founder's own examples.
        for name in [
            "Side Plank", "Single Arm Cable Crossover",
            "Single Arm Triceps Pushdown", "Single Arm Lateral Raise",
        ] {
            #expect(Unilateral.isUnilateral(name), "\(name) must offer Split L/R")
        }
        for name in ["Barbell Bench Press", "Lat Pulldown", "Seated Cable Row (Wide Grip)"] {
            #expect(!Unilateral.isUnilateral(name), "\(name) must NOT offer Split L/R")
        }
    }

    @Test("a unilateral movement opens already split, a bilateral one does not")
    func decksOpenSplit() {
        let model = armsDay()
        guard let split = unilateral(model) else {
            Issue.record("no unilateral movement on Delts & Arms")
            return
        }
        #expect(split.rows.allSatisfy { $0.pairId != nil }, "every row is half of a pair")
        #expect(Set(split.rows.compactMap(\.side)) == ["left", "right"])
        // Two rows, ONE set. This is the assertion the whole feature rests on.
        #expect(split.rows.count == 2 * LoggerModel.physical(split.rows))

        #expect(split.name == "Single Arm Lateral Raise")
        for other in model.exercises where !model.canSplit(other) {
            #expect(other.rows.allSatisfy { $0.pairId == nil }, "\(other.name) must not open split")
        }
    }

    // MARK: - Splitting and merging by hand

    @Test("splitting a logged set replaces it with two sides that carry its numbers")
    func splitCarriesTheSet() {
        let model = armsDay()
        guard let exercise = model.exercises.first(where: {
            !model.canSplit($0) && !$0.rows.contains(where: \.isCardio)
        }) else {
            Issue.record("no bilateral movement on Delts & Arms")
            return
        }
        let row = exercise.rows[0]
        row.weightKg = 60
        row.reps = 10
        model.toggleDone(row, in: exercise)
        let before = exercise.volumeKg

        model.splitSet(row, in: exercise)

        let sides = exercise.rows.filter { $0.pairId != nil }
        #expect(sides.count == 2)
        #expect(sides.allSatisfy { $0.weightKg == 60 && $0.reps == 10 })
        #expect(sides.allSatisfy(\.isDone), "a set that was logged stays logged")
        #expect(Set(sides.compactMap(\.sideLabel)) == ["L", "R"])
        // The two sides are one set at the weaker side, so a set that was
        // 600 kg whole is 600 kg split. If this ever reads 1200 the pair has
        // stopped collapsing and every chart downstream is wrong.
        #expect(exercise.volumeKg == before)
        #expect(exercise.workingSets == 1)
    }

    @Test("merging keeps the weaker side, and never invents tonnage")
    func mergeTakesTheWeakerSide() {
        let model = armsDay()
        guard let exercise = model.exercises.first(where: {
            !model.canSplit($0) && !$0.rows.contains(where: \.isCardio)
        }) else {
            Issue.record("no bilateral movement on Delts & Arms")
            return
        }
        let row = exercise.rows[0]
        row.weightKg = 20
        row.reps = 12
        model.splitSet(row, in: exercise)

        // A genuinely weaker left arm — which is the only reason to split at all.
        let sides = exercise.rows.filter { $0.pairId != nil }
        let pairId = sides[0].pairId!
        sides[0].weightKg = 18
        sides[0].reps = 9
        sides[0].rpe = 9.5
        sides[1].rpe = 8
        for side in sides { model.toggleDone(side, in: exercise) }
        let split = exercise.volumeKg

        model.mergeSet(pairId: pairId, in: exercise)

        let merged = exercise.rows.first { $0.pairId == nil && $0.isDone }
        #expect(merged?.weightKg == 18, "the weaker load survives")
        #expect(merged?.reps == 9, "and the shorter set")
        #expect(merged?.rpe == 9.5, "but the HARDER rating — that is what it cost")
        #expect(merged?.side == nil)
        // 18 × 9 either way: the pair was already scored at its weaker side, so
        // un-splitting cannot change what the session weighed.
        #expect(exercise.volumeKg == split)
    }

    @Test("a set already split is not split again")
    func splitIsIdempotent() {
        let model = armsDay()
        guard let exercise = unilateral(model) else {
            Issue.record("no unilateral movement on Delts & Arms")
            return
        }
        let before = exercise.rows.count
        model.splitSet(exercise.rows[0], in: exercise)
        #expect(exercise.rows.count == before, "a side is not half of a side")
    }

    // MARK: - Several tags on one set

    @Test("tags accumulate, withdraw one at a time, and store in canonical order")
    func qualitiesAreASet() {
        let model = armsDay()
        let exercise = model.exercises.first { !$0.rows.contains(where: \.isCardio) }!
        let row = exercise.rows[0]

        model.setQuality(.partialRom, on: row, in: exercise)
        model.setQuality(.momentum, on: row, in: exercise)
        #expect(row.qualities == [.momentum, .partialRom], "declaration order, not tap order")
        // Which is the point: `SessionEditing.amendSet` compares the stored
        // string to decide whether an amend changed anything. A list that
        // reordered itself would seed the event log on every tap.
        #expect(SetQuality.join(row.qualities) == "momentum+partial_rom")

        // Tapping a chosen one withdraws just that one.
        model.setQuality(.momentum, on: row, in: exercise)
        #expect(row.qualities == [.partialRom])
        // And nil clears the lot.
        model.setQuality(nil, on: row, in: exercise)
        #expect(row.qualities.isEmpty)
        #expect(SetQuality.join(row.qualities) == nil, "absence is NULL, not an empty string")
    }

    @Test("one tag is byte-identical to what this app has always written")
    func oneTagIsUnchanged() {
        // The whole reason the column did not have to change shape. Every row
        // already in Postgres parses, and every row this build writes for a
        // single tag is a value the OLD CHECK constraint would have accepted.
        for quality in SetQuality.allCases {
            #expect(SetQuality.join([quality]) == quality.rawValue)
            #expect(SetQuality.parse(quality.rawValue) == [quality])
        }
        #expect(SetQuality.parse(nil).isEmpty)
        #expect(SetQuality.parse("").isEmpty)
        // A key from a newer client is dropped rather than failing the row.
        #expect(SetQuality.parse("momentum+invented") == [.momentum])
        // And a value written out of order still reads correctly.
        #expect(SetQuality.parse("partial_rom+momentum") == [.momentum, .partialRom])
    }

    // MARK: - The rest nudge

    @Test("a nudge moves this rest and leaves the plan alone")
    func nudgeIsForThisSetOnly() {
        let model = armsDay()
        // A real prescription, not the treadmill's zero: `startRest` accepts a
        // 0 and a rest that is already over is not one this test can nudge.
        guard let exercise = model.exercises.first(where: { ($0.plan.restSec ?? 0) > 60 }),
              let prescribed = exercise.plan.restSec
        else {
            Issue.record("no movement on Delts & Arms prescribes a rest")
            return
        }
        model.startRest(for: exercise)
        model.adjustRest(by: 15)
        #expect(model.restDuration == TimeInterval(prescribed) + 15)

        // The next set is prescribed by the PLAN again. A longer breather after
        // set 3 is a fact about set 3, not a standing amendment to the block.
        model.startRest(for: exercise)
        #expect(model.restDuration == TimeInterval(prescribed))
        #expect(exercise.plan.restSec == prescribed, "the plan itself never moved")
    }

    @Test("pulling the clock past now ends the rest rather than counting backwards")
    func nudgeCannotGoNegative() {
        let model = armsDay()
        guard let exercise = model.exercises.first(where: { ($0.plan.restSec ?? 0) > 60 }) else {
            Issue.record("no movement on Delts & Arms prescribes a rest")
            return
        }
        model.startRest(for: exercise)
        for _ in 0..<40 { model.adjustRest(by: -15) }
        #expect(model.restEndsAt == nil)
        #expect(model.restingExercise == nil, "and the card stops claiming to be resting")
    }
}
