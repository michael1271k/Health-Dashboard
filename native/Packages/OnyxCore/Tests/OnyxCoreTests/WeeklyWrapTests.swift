import Foundation
import Testing
@testable import OnyxCore

@Suite("Weekly wrap — the week closes when the work is done")
struct WeeklyWrapTests {

    private let weekStart = "2026-09-06"          // Sunday
    /// Train Mon/Tue/Thu/Fri; rest Sun/Wed/Sat.
    private let trainingDays: Set<String> = ["2026-09-07", "2026-09-08", "2026-09-10", "2026-09-11"]
    private func isTraining(_ d: String) -> Bool { trainingDays.contains(d) }

    // MARK: - When it fires

    @Test("the last planned session closes the week, even on a Friday")
    func firesOnTheLastSession() {
        // The plan rests Saturday, so Friday evening IS the end of the training
        // week. Waiting for the calendar means the summary arrives after you
        // have stopped thinking about the week it describes.
        #expect(WeeklyWrap.isWrapped(weekStart: weekStart, logged: trainingDays, isTrainingDay: isTraining))
    }

    @Test("a week with a session still to come is not wrapped")
    func waitsForEveryPlannedDay() {
        // This is the difference from `WeekReady.isReady`, which asks only about
        // days up to today and therefore turns true on a Tuesday.
        var partial = trainingDays
        partial.remove("2026-09-11")
        #expect(!WeeklyWrap.isWrapped(weekStart: weekStart, logged: partial, isTrainingDay: isTraining))
    }

    @Test("cardio does not gate it")
    func cardioIsIndependent() {
        // A walk is not in the schedule and the training week is not waiting on
        // one. `logged` only ever holds strength sessions, which is the rule —
        // stated here so a future caller cannot quietly widen it.
        #expect(WeeklyWrap.isWrapped(
            weekStart: weekStart, logged: trainingDays.union(["2026-09-12"]), isTrainingDay: isTraining
        ))
    }

    @Test("a week the plan asks nothing of never wraps")
    func emptyWeekNeverWraps() {
        #expect(!WeeklyWrap.isWrapped(weekStart: weekStart, logged: [], isTrainingDay: { _ in false }))
    }

    // MARK: - The verdict

    private func movement(_ now: Double, _ before: Double?) -> WeeklyWrap.Movement {
        WeeklyWrap.Movement(
            name: "Chest Press", dayKey: "cb_a", weightKg: 40, reps: 10,
            e1rm: now, previousE1rm: before
        )
    }

    @Test("a drop inside 2.5% is holding, not regressing")
    func smallDropsHold() {
        // One rep fewer at the same load moves an e1RM by about 3% at ten reps,
        // and there is no week where that never happens. Flagging it paints a
        // normal week red and teaches the reader to ignore the colour.
        #expect(WeeklyWrap.verdict(movement(100, 100), isDeload: false) == .held)
        #expect(WeeklyWrap.verdict(movement(98, 100), isDeload: false) == .held)
        #expect(WeeklyWrap.verdict(movement(102, 100), isDeload: false) == .held)
        // Exactly at the threshold is inside it: the rule is "more than 2.5%".
        #expect(WeeklyWrap.verdict(movement(97.5, 100), isDeload: false) == .held)
    }

    @Test("a drop beyond the band is a regression")
    func realDropsRegress() {
        #expect(WeeklyWrap.verdict(movement(95, 100), isDeload: false) == .regressed)
        #expect(WeeklyWrap.verdict(movement(105, 100), isDeload: false) == .progressed)
    }

    @Test("a deload week cannot produce a regression")
    func deloadRelabels() {
        // Every movement in a deload drops, by design. Eight red rows for a week
        // that went exactly as intended is not reporting, it is punishing the
        // user for following the plan — but the drop is still SHOWN, with its
        // own word, or the week looks like nothing happened.
        #expect(WeeklyWrap.verdict(movement(88, 100), isDeload: true) == .deloaded)
        // And a movement that went UP in a deload is still a progression. The
        // rule relabels losses, it does not mute the week.
        #expect(WeeklyWrap.verdict(movement(105, 100), isDeload: true) == .progressed)
    }

    @Test("a movement with nothing to compare against has no verdict")
    func firstWeekHolds() {
        #expect(WeeklyWrap.verdict(movement(100, nil), isDeload: false) == .held)
        // An unloaded movement has no e1RM at all and must not be read as a
        // collapse to zero — the `Epley` nil that exists for exactly this.
        #expect(WeeklyWrap.verdict(movement(0, 100).withoutE1rm, isDeload: false) == .held)
        // A previous of zero is not a baseline anything can be divided by.
        #expect(WeeklyWrap.verdict(movement(100, 0), isDeload: false) == .held)
    }

    // MARK: - The summary

    private var summary: WeeklyWrap.Summary {
        WeeklyWrap.Summary(
            weekStart: weekStart, sessions: 4, tonnageKg: 42_180.4, tonnageDeltaKg: 1_240, prCount: 2,
            movements: [
                .init(name: "Chest Press", dayKey: "cb_a", weightKg: 40, reps: 10, e1rm: 53.3, previousE1rm: 50),
                .init(name: "Leg Press", dayKey: "legs_a", weightKg: 70, reps: 12, e1rm: 98, previousE1rm: 110),
                .init(name: "Lat Pulldown", dayKey: "cb_a", weightKg: 65, reps: 11, e1rm: 88.8, previousE1rm: 88),
                .init(name: "Side Plank", dayKey: "legs_a", weightKg: 0, reps: 61),
            ]
        )
    }

    @Test("progressions and regressions sort by how much moved")
    func sortsByMagnitude() {
        #expect(summary.progressions.map(\.name) == ["Chest Press"])
        #expect(summary.regressions.map(\.name) == ["Leg Press"])
        // Inside the band, and the unloaded movement with no estimate at all.
        #expect(summary.movements(.held).map(\.name).sorted() == ["Lat Pulldown", "Side Plank"])
    }

    @Test("a deload week moves every drop out of the red list")
    func deloadEmptiesRegressions() {
        var deload = summary
        deload.isDeload = true
        #expect(deload.regressions.isEmpty)
        #expect(deload.deloaded.map(\.name) == ["Leg Press"])
        #expect(deload.progressions.map(\.name) == ["Chest Press"])
    }

    @Test("the headline top set is the heaviest LOAD, not the best estimate")
    func topSetIsAFact() {
        // 70 kg on the leg press is heavier than 65 on the pulldown even though
        // the pulldown's e1RM is close. The headline is "the heaviest thing you
        // picked up", which is a fact; the best estimated max is an inference
        // and belongs in the list beside its reps.
        #expect(summary.topSet?.name == "Leg Press")
        // The 0 kg plank is never the top set.
        #expect(summary.topSet?.weightKg == 70)
    }

    @Test("the headline reads as a sentence and omits what did not happen")
    func headlineOmitsZeroes() {
        #expect(summary.headline == "4 sessions · 42180 kg · 2 PRs")
        #expect(WeeklyWrap.Summary(weekStart: weekStart, sessions: 1, tonnageKg: 0).headline == "1 session")
    }
}

private extension WeeklyWrap.Movement {
    var withoutE1rm: Self {
        var copy = self
        copy.e1rm = nil
        return copy
    }
}
