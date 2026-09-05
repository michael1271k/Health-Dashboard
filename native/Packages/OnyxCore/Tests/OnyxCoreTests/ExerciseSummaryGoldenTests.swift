import Foundation
import Testing
@testable import OnyxCore

/// The exercise page's three numbers, against the TypeScript the web now draws
/// them with. §W7 decision 4: the NATIVE definitions are the truth.
@Suite("Exercise summary — pairs collapsed, warm-ups gone")
struct ExerciseSummaryGoldenTests {

    struct In: Decodable {
        let sets: [ExerciseSummarySet]
        let timed: Bool?
    }

    @Test("every case matches the TypeScript")
    func matchesGoldenVectors() throws {
        let fixture = try GoldenFixture<In, ExerciseSummary>.load("exercise-summary")
        #expect(fixture.cases.count >= 15)
        for c in fixture.cases {
            let got = ExerciseSummary.summarize(c.input.sets, timed: c.input.timed ?? false)
            #expect(got == c.expected, "summarize — \(c.name)")
        }
    }

    // MARK: - The two rules the old page got wrong

    @Test("a unilateral lift is counted as physical sets, not as rows")
    func pairsAreOneSet() {
        let sets = (1...3).flatMap { i in
            [
                ExerciseSummarySet(sessionId: "s1", weightKg: 14, reps: 12, side: "L", pairId: "p\(i)"),
                ExerciseSummarySet(sessionId: "s1", weightKg: 14, reps: 12, side: "R", pairId: "p\(i)"),
            ]
        }
        let summary = ExerciseSummary.summarize(sets)
        #expect(summary.workingSets == 3)
        #expect(summary.totalReps == 36)
        // Not 6 × 14 × 12 = 1008: a pair is one set at min(weight) × min(reps).
        #expect(summary.bestSessionVolumeKg == 504)
    }

    @Test("a warm-up never reaches any of the three numbers")
    func warmUpsAreExcluded() {
        let sets = [
            ExerciseSummarySet(sessionId: "s1", weightKg: 100, reps: 20, setType: "warmup"),
            ExerciseSummarySet(sessionId: "s1", weightKg: 80, reps: 5),
        ]
        let summary = ExerciseSummary.summarize(sets)
        #expect(summary.heaviestKg == 80)
        #expect(summary.workingSets == 1)
        #expect(summary.totalReps == 5)
        #expect(summary.bestSessionVolumeKg == 400)
    }

    @Test("unloaded work has no estimate, and a stored zero is not one either")
    func unloadedHasNoEstimate() {
        let bodyweight = ExerciseSummary.summarize([
            ExerciseSummarySet(sessionId: "s1", weightKg: 0, reps: 18),
        ])
        #expect(bodyweight.unloaded)
        #expect(bodyweight.bestE1rmKg == nil)
        #expect(bodyweight.bestReps == 18)

        let storedZero = ExerciseSummary.summarize([
            ExerciseSummarySet(sessionId: "s1", weightKg: 100, reps: 5, est: 0),
        ])
        // Epley, not the stored 0 — 100 × (1 + 5/30) = 116.7.
        #expect(storedZero.bestE1rmKg == 116.7)
    }
}
