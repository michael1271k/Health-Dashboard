import Foundation
import Testing
@testable import OnyxCore

@Suite("Muscle recovery — what the ledger implies you are still carrying")
struct MuscleRecoveryTests {

    private func bout(_ hoursAgo: Double, _ worked: [LandmarkMuscle: Double]) -> MuscleRecovery.Bout {
        MuscleRecovery.Bout(hoursAgo: hoursAgo, worked: worked)
    }

    // MARK: - The decay

    @Test("a muscle is at half its load after its own half-life")
    func halvesAtItsHalfLife() {
        for muscle in LandmarkMuscle.allCases {
            let out = MuscleRecovery.fatigue([bout(MuscleRecovery.halfLifeHours(muscle), [muscle: 1])])
            #expect(abs((out[muscle] ?? 0) - 0.5) < 0.01, "\(muscle.rawValue) was \(out[muscle] ?? 0)")
        }
    }

    @Test("big musculature is still loaded where small heads have recovered")
    func decayDiffersByMuscle() {
        // The whole reason the table exists. A single constant draws a Monday
        // squat and a Monday lateral raise at the same shade on Wednesday, which
        // teaches the reader nothing a calendar could not.
        let out = MuscleRecovery.fatigue([bout(48, [.quads: 1, .sideDelts: 1])])
        let quads = try! #require(out[.quads])
        let delts = out[.sideDelts] ?? 0
        #expect(quads > 0.4, "quads two days after a squat session read \(quads)")
        #expect(delts < 0.2, "side delts two days after read \(delts)")
        #expect(quads > delts * 2)
    }

    @Test("two sessions ADD rather than fold to the worse one")
    func contributionsAccumulate() {
        // Two leg days in three days is more residual fatigue than one, which is
        // the entire reason somebody looks at this before choosing today. A
        // max-fold would report the two as identical.
        let once = MuscleRecovery.fatigue([bout(48, [.quads: 0.5])])[.quads] ?? 0
        let twice = MuscleRecovery.fatigue([bout(48, [.quads: 0.5]), bout(12, [.quads: 0.5])])[.quads] ?? 0
        #expect(twice > once)
    }

    @Test("accumulated load clamps at 1 and never runs away")
    func clampsAtOne() {
        let heavy = MuscleRecovery.fatigue((0..<6).map { bout(Double($0) * 6, [.quads: 1]) })
        #expect(heavy[.quads] == 1)
    }

    @Test("a clock that disagrees with itself cannot produce fatigue above 1")
    func futureSessionsAreClamped() {
        // A session whose `ended_at` is in the future — a device whose clock has
        // just been corrected backwards — would otherwise raise 0.5 to a
        // NEGATIVE power and report a muscle carrying several sessions' worth
        // of a session that has not finished.
        let out = MuscleRecovery.fatigue([bout(-72, [.quads: 1])])
        #expect(out[.quads] == 1)
    }

    // MARK: - What is absent

    @Test("a recovered muscle is ABSENT, not zero")
    func recoveredMusclesLeaveTheDictionary() {
        // An entry of 0 and no entry draw the same untrained belly, and a
        // dictionary that never empties would make a body five days clear of any
        // session read as permanently faintly loaded.
        #expect(MuscleRecovery.fatigue([bout(200, [.quads: 1])]).isEmpty)
        #expect(MuscleRecovery.fatigue([bout(96, [.biceps: 1])]).isEmpty)
        #expect(MuscleRecovery.fatigue([]).isEmpty)
        #expect(MuscleRecovery.fatigue([bout(2, [.quads: 0])]).isEmpty)
    }

    @Test("a session beyond the horizon is not read at all")
    func horizonCutsOff() {
        #expect(MuscleRecovery.fatigue([bout(MuscleRecovery.horizonHours + 1, [.quads: 1])]).isEmpty)
    }

    @Test("nothing is ever reported above 1 or below the visible floor")
    func staysInsideTheBand() {
        let out = MuscleRecovery.fatigue([
            bout(0, [.quads: 1, .chest: 0.4]),
            bout(18, [.quads: 1, .biceps: 0.2]),
            bout(60, [.calves: 1]),
        ])
        for (muscle, value) in out {
            #expect(value <= 1, "\(muscle.rawValue) was \(value)")
            #expect(value >= 0.04, "\(muscle.rawValue) was \(value)")
        }
    }

    // MARK: - Words

    @Test("the bands are in order and cover the whole range")
    func labelsAreOrdered() {
        #expect(MuscleRecovery.label(0) == "Fresh")
        #expect(MuscleRecovery.label(0.3) == "Mostly recovered")
        #expect(MuscleRecovery.label(0.6) == "Still loaded")
        #expect(MuscleRecovery.label(1) == "Heavily loaded")
    }

    @Test("only genuinely loaded muscles are named, worst first")
    func namesWhatLimitsToday() {
        let out = MuscleRecovery.mostLoaded([.quads: 0.9, .glutes: 0.6, .biceps: 0.1, .chest: 0.44])
        #expect(out.map(\.0) == [.quads, .glutes])
        // 0.44 is below the "still loaded" band and is not worth naming: a list
        // that includes a muscle the figure draws as nearly clear is a list
        // nobody trusts.
        #expect(!out.map(\.0).contains(.chest))
    }

    @Test("ties break on a stable key rather than on dictionary order")
    func tiesAreStable() {
        // A `Dictionary` has no order, so two muscles at the same value would
        // swap places between launches and the sentence under the figure would
        // change with nothing behind it.
        let tied: [LandmarkMuscle: Double] = [.quads: 0.8, .calves: 0.8, .chest: 0.8]
        #expect(MuscleRecovery.mostLoaded(tied).map(\.0.rawValue) == ["Calves", "Chest", "Quads"])
    }
}
