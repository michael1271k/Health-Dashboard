import Foundation
import Testing
@testable import OnyxCore

/// The deck and the credit rule.
///
/// These are not golden vectors — nothing in `MuscleCredit` is exported by
/// `npm run golden` yet. They are the runnable check the arithmetic ships with,
/// and the headline case is a REAL one: the numbers in the first assertion were
/// read off the shipping app's own muscle-distribution sheet, mid-session, and
/// the Swift has to reproduce them exactly.
@Suite("Training — the deck and the credit rule")
struct TrainingTests {

    // MARK: - The credit rule

    @Test("the shipping sheet's own numbers: 2 physical sets, 5 weighted")
    func matchesTheLiveSheet() {
        // Upper B, one set logged of each of the first two lifts.
        //
        //   Neutral-Grip Lat Pulldown  primary lats · secondary upper back, biceps, forearms
        //   Seated Cable Row (Wide)    primary upper back · secondary lats, traps, biceps, forearms
        //
        // `traps` folds to Upper back, where the row's own PRIMARY already
        // pays 1.0 — the `max` is what stops one set of rowing being credited
        // 1.5 sets of upper back.
        let day = Program.onyx5.day(key: "cb_b")!
        let pulldown = day.exercises[1]
        let row = day.exercises[3]

        let sets = MuscleCredit.weightedSets([
            .init(physicalSets: 1, movers: pulldown.movers),
            .init(physicalSets: 1, movers: row.movers),
        ])

        #expect(sets[.lats] == 1.5)
        #expect(sets[.upperBack] == 1.5)
        #expect(sets[.biceps] == 1.0)
        #expect(sets[.forearms] == 1.0)
        #expect(sets.values.reduce(0, +) == 5.0)
        // Nothing else was trained. A stray landmark here means a token folded
        // somewhere it should not have.
        #expect(Set(sets.keys) == [.lats, .upperBack, .biceps, .forearms])
    }

    @Test("a muscle named as both primary and secondary is paid once, at the higher rate")
    func overlapTakesTheMaximum() {
        let sets = MuscleCredit.weightedSets([
            .init(physicalSets: 2, movers: MoverTokens(primary: ["upper back"], secondary: ["traps"])),
        ])
        // 2 sets, not 3. Summing the two tokens is the bug this guards.
        #expect(sets[.upperBack] == 2.0)
    }

    @Test("a bare `shoulders` is side delts and a bare `back` is lats")
    func legacyTokensFoldWhereTheCatalogueMeansThem() {
        #expect(LandmarkMuscle.from(token: "shoulders") == .sideDelts)
        #expect(LandmarkMuscle.from(token: "back") == .lats)
        #expect(LandmarkMuscle.from(token: "Upper Back") == .upperBack)
        #expect(LandmarkMuscle.from(token: "inner_thigh") == .adductors)
        // Hip abduction is genuinely not a tracked target — nil is the answer,
        // not a fallback bucket.
        #expect(LandmarkMuscle.from(token: "abductors") == nil)
    }

    @Test("the tint floor keeps a single set visible")
    func workedFloorsAtAQuarter() {
        let worked = MuscleCredit.worked(from: [.quads: 12, .calves: 1])
        #expect(worked[.quads] == 1)
        // 1/12 is 0.083, which would render as nothing at all.
        #expect(worked[.calves] == 0.25)
        #expect(MuscleCredit.worked(from: [:]).isEmpty)
    }

    // MARK: - The deck

    @Test("cutting drops the two bulk-only lifts and nothing else")
    func cutDropsOnlyTheZeroes() {
        let arms = Program.onyx5.day(key: "arms")!
        let legsB = Program.onyx5.day(key: "legs_b")!

        #expect(arms.exercises(for: .bulk).count == 8)
        #expect(arms.exercises(for: .cut).count == 7)
        #expect(arms.exercises(for: .cut).contains { $0.name == "Seated DB Wrist Curl" } == false)

        #expect(legsB.exercises(for: .cut).contains { $0.name == "Hip Adduction" } == false)
        #expect(legsB.exercises(for: .bulk).contains { $0.name == "Hip Adduction" })
    }

    @Test("every day loses volume on a cut, and no day loses its identity")
    func cutIsLighterEverywhere() {
        for day in Program.onyx5.days {
            #expect(day.plannedSets(for: .cut) < day.plannedSets(for: .bulk),
                    "\(day.label) should train less on a cut")
            #expect(day.exercises(for: .cut).isEmpty == false)
        }
    }

    @Test("the rep window splits on an EN DASH, and a duration is not a window")
    func repWindowParsing() {
        let legsB = Program.onyx5.day(key: "legs_b")!
        let rdl = legsB.exercises[0]
        #expect(rdl.repWindow?.floor == 8)
        #expect(rdl.repWindow?.ceiling == 12)

        // "55s" is a hold, not a rep count. A parser that answers (55, 55) here
        // puts a progression ceiling on a plank.
        let plank = legsB.exercises.first { $0.name == "Side Plank" }!
        #expect(plank.repWindow == nil)
    }

    @Test("a nil seed load is not a zero seed load")
    func nilIsNotZero() {
        let legsA = Program.onyx5.day(key: "legs_a")!
        // Nobody has recorded a hack squat, so there is no seed.
        #expect(legsA.exercises.first { $0.name == "Hack Squat" }?.wk1Kg == nil)
        // A hanging knee raise IS performed, at bodyweight — also nil here,
        // because the deck seeds a LOAD and bodyweight has none to seed.
        #expect(legsA.exercises.first { $0.name == "Leg Press" }?.wk1Kg == 70)
    }

    @Test("the five days are the five weekdays the program trains")
    func theWeekIsIntact() {
        #expect(Program.onyx5.days.map(\.weekday) == [0, 1, 2, 4, 5])
        // Wed (3) and Sat (6) are Zone-2 rest and have no deck at all.
        #expect(Program.onyx5.day(weekday: 3) == nil)
        #expect(Program.onyx5.day(weekday: 6) == nil)
    }
}
