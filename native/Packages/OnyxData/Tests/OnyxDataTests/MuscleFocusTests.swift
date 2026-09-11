import Testing
import Foundation
import OnyxCore
@testable import OnyxData

/// The week's sets on the body, against the week's targets.
///
/// Three things can go wrong here and none of them shows up as a crash: the
/// credit rule can drift from the tile's, a zero-target muscle can read as
/// "behind" instead of "not asked for", and an override can fail to beat the
/// program's default — which is the whole reason the override exists.
///
/// The first of those is now structural rather than tested twice: since W3 both
/// call `MuscleCredit.weightedSets(exerciseNames:)`, and
/// `WidgetSnapshotBuilderTests.slugSetsCountTowardsMuscleCredit` asserts the
/// sheet's row and the tile's bar against one logged set.
@Suite("Weekly muscle focus")
struct MuscleFocusTests {

    private func set(_ id: String, session: String = "s1", type: String = "normal") -> WorkoutSet {
        WorkoutSet(
            id: UUID().uuidString, sessionId: session, exerciseId: id, setIndex: 0,
            weightKg: 60, reps: 8, setType: type
        )
    }

    /// Names the DICTIONARY knows, which is not the same as names that read like
    /// exercises: `MuscleMap` matches on token sets, and an unlisted title falls
    /// back to the row's stored tags — of which a test fixture has none. "Chest
    /// Press" is chest primary with triceps and front delts secondary.
    private let names = ["ex-bench": "Chest Press", "ex-curl": "Preacher Curl"]

    @Test("a primary mover earns a full set and a secondary earns half")
    func creditRule() {
        let focus = TodayFeedBuilder.muscleFocus(
            weekStart: "2026-08-30", sets: [set("ex-bench"), set("ex-bench")],
            names: names, phase: .cut, overrides: [:]
        )
        let by = Dictionary(uniqueKeysWithValues: focus.rows.map { ($0.muscle, $0.sets) })
        #expect(by[.chest] == 2)
        // Half a set each, twice — and the halves must not be rounded away.
        #expect(by[.triceps] == 1)
        #expect(by[.frontDelts] == 1)
        #expect(by[.quads] == 0)
    }

    @Test("a ghost set counts for nothing, here as everywhere")
    func ghostsAreFree() {
        let focus = TodayFeedBuilder.muscleFocus(
            weekStart: "2026-08-30", sets: [set("ex-bench"), set("ex-bench", type: "ghost")],
            names: names, phase: .cut, overrides: [:]
        )
        #expect(focus.rows.first { $0.muscle == .chest }?.sets == 1)
    }

    @Test("every landmark is present, trained or not")
    func totalCoverage() {
        let focus = TodayFeedBuilder.muscleFocus(
            weekStart: "2026-08-30", sets: [], names: names, phase: .cut, overrides: [:]
        )
        #expect(focus.rows.count == LandmarkMuscle.allCases.count)
        #expect(focus.doneSets == 0)
        // A muscle that vanishes when it is untrained is the one you most need
        // to see, so an empty week is sixteen rows and not none.
        #expect(focus.rows.allSatisfy { $0.sets == 0 })
    }

    @Test("an override beats the program's own target")
    func overridesWin() {
        let focus = TodayFeedBuilder.muscleFocus(
            weekStart: "2026-08-30", sets: [], names: names, phase: .cut,
            overrides: ["Chest": 20]
        )
        #expect(focus.rows.first { $0.muscle == .chest }?.target == 20)
        // A muscle with no row has no target since W2 — 0, not another
        // athlete's MEV.
        #expect(focus.rows.first { $0.muscle == .quads }?.target == 0)
    }

    @Test("work past the target is done, never negative")
    func remainingFloorsAtZero() {
        let row = MuscleFocusRow(muscle: .chest, sets: 14, target: 11)
        #expect(row.remaining == 0)
        #expect(MuscleFocusRow(muscle: .chest, sets: 4, target: 11).remaining == 7)
    }

    @Test("the atlas grades each muscle against its OWN target")
    func workedIsPerTarget() {
        let focus = MuscleFocusSummary(weekStart: "2026-08-30", rows: [
            MuscleFocusRow(muscle: .quads, sets: 10, target: 10),
            MuscleFocusRow(muscle: .biceps, sets: 4, target: 8),
            // Trained, and the plan asks for none of it. It still happened, so
            // it must light — fading it out would report real work as untrained.
            MuscleFocusRow(muscle: .adductors, sets: 2, target: 0),
            MuscleFocusRow(muscle: .calves, sets: 0, target: 6),
        ])
        let worked = focus.worked
        // A muscle at its target is full even though 10 is not the biggest number
        // on the body — the sheet's question is "is the week done".
        #expect(worked[.quads] == 1)
        #expect(worked[.biceps] == 0.5)
        #expect(worked[.adductors] != nil)
        // Never drawn: nothing landed on it.
        #expect(worked[.calves] == nil)
    }

    @Test("the three totals are the three the sheet prints")
    func totals() {
        let focus = MuscleFocusSummary(weekStart: "2026-08-30", rows: [
            MuscleFocusRow(muscle: .chest, sets: 11, target: 11),
            MuscleFocusRow(muscle: .quads, sets: 2.5, target: 10),
            MuscleFocusRow(muscle: .adductors, sets: 0, target: 0),
        ])
        #expect(focus.doneSets == 13.5)
        #expect(focus.targetSets == 21)
        // Only the 7.5 the quads still owe: a met muscle owes nothing and an
        // untargeted one cannot be behind.
        #expect(focus.remainingSets == 7.5)
    }
}
