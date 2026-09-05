import Foundation
import Testing
@testable import OnyxCore

/// Claims that must hold in Swift for the same reasons they hold in TypeScript.
///
/// The golden vectors prove the port agrees with its source. These prove the
/// source's own rules survived translation as rules — so that editing a constant
/// in `Battery.swift` alone fails here, rather than silently producing a model
/// that is internally consistent and wrong.
@Suite("Domain invariants")
struct InvariantTests {

    // MARK: Battery

    @Test("the drain budget stays strictly under the charge budget — the rule v6 broke")
    func drainBudgetUnderChargeBudget() {
        // v6's arithmetic reached 104.2 against a 100-point charge, so a leg day
        // hit the floor before bedtime no matter how well you slept. The reading
        // that should be most informative had no dynamic range at all.
        #expect(Battery.maxTotalDrain < 100 - Battery.defaults.floor)
    }

    @Test("v8: timeMax 35 + activityCap 12 + workoutMax 32 + stressCap 10 = 89 < 100")
    func v8BudgetIsEightyNine() {
        let d = Battery.defaults
        #expect(d.timeMax == 35 && d.activityCap == 12 && d.workoutMax == 32 && d.stressCap == 10)
        #expect(Battery.maxTotalDrain == 89)
        #expect(Battery.maxTotalDrain < 100)
        // The lowest a perfect night can start is 97 (onset trouble); the floor
        // stays out of reach even then.
        #expect(100 - d.onsetPenalty - Battery.maxTotalDrain > d.floor)
        // The per-day ceilings are what the budget is checked against.
        #expect(Battery.workoutMaxByDay.values.max() == d.workoutMax)
        #expect(Battery.workoutMaxByDay["legs_a"] == 32 && Battery.workoutMaxByDay["cb_a"] == 24 && Battery.workoutMaxByDay["arms"] == 16)
    }

    @Test("the stress drain never exceeds its cap and never recharges")
    func stressStaysInBand() {
        let worst = Battery.stressDrain(ScoringInputs(restingHR: 120, baselineHR: 50, hrvMs: 1, hrvBaseline: 80, fatigueLevel: 5))
        #expect(worst == Battery.defaults.stressCap)
        let calm = Battery.stressDrain(ScoringInputs(restingHR: 40, baselineHR: 52, hrvMs: 120, hrvBaseline: 60, fatigueLevel: 1))
        #expect(calm == 0)
        for level in [-1.0, 0, 0.5, 1, 2, 3, 4, 5, 6, 99] {
            let term = Battery.stressParts(ScoringInputs(fatigueLevel: level)).fatigueTerm
            #expect(term >= 0 && term <= 4, "fatigue term out of band at level \(level)")
        }
    }

    @Test("maintenance can only ever lower a drain, never raise the worst case")
    func maintenanceOnlyLowers() {
        #expect(Battery.maintenanceDrainFactor < 1)
        #expect(Battery.maintenanceRelMin < Battery.defaults.relMin)

        // Concretely, for every day type.
        for dayKey in Battery.workoutMaxByDay.keys {
            #expect(
                Battery.workoutMaxFor(dayKey: dayKey, maintenance: true)
                    < Battery.workoutMaxFor(dayKey: dayKey, maintenance: false)
            )
        }
    }

    @Test("time drain is monotonic and spans exactly 0 to timeMax")
    func timeDrainIsMonotonic() {
        #expect(Battery.timeDrain(hoursAwake: 0) == 0)
        expectClose(
            Battery.timeDrain(hoursAwake: Battery.defaults.maxAwake),
            Battery.defaults.timeMax,
            "an 18-hour day costs the full time budget"
        )

        var previous = -Double.infinity
        for step in 0...180 {
            let value = Battery.timeDrain(hoursAwake: Double(step) / 10)
            #expect(value >= previous, "time drain went backwards at hour \(Double(step) / 10)")
            previous = value
        }

        // Clamped at both ends: a negative or over-long day must not escape.
        #expect(Battery.timeDrain(hoursAwake: -5) == 0)
        expectClose(
            Battery.timeDrain(hoursAwake: 48),
            Battery.defaults.timeMax,
            "an over-long day is clamped, not extrapolated"
        )
    }

    @Test("the battery never leaves its band, on any input in the exported grid")
    func batteryStaysInBand() throws {
        let fixture = try GoldenFixture<
            BatteryGoldenTests.BatteryInput, BatteryGoldenTests.BatteryExpected
        >.load("battery")

        for c in fixture.cases {
            let state = Battery.computeBattery(c.input.inputs, hoursAwake: c.input.hoursAwakeArg)
            #expect(state.currentPct >= Battery.defaults.floor, "below the floor — \(c.name)")
            #expect(state.currentPct <= 100, "above 100 — \(c.name)")
            // v8: onset trouble may take the charge 3 under wakeMin, never further.
            #expect(state.morningCharge >= Battery.defaults.wakeMin - Battery.defaults.onsetPenalty, "wake charge below wakeMin − onset — \(c.name)")
            #expect(state.morningCharge <= 100, "wake charge above 100 — \(c.name)")
        }
    }

    @Test("no recharge term exists: adding intake can never raise the battery")
    func noRechargeTerm() {
        // The protein/water bug: eating breakfast used to make the battery jump.
        // Drain-only means nutrition is not an input to this model at all, so
        // varying it must change nothing.
        let base = ScoringInputs(sleepHours: 7, deepMinutes: 60, hoursAwake: 10)
        var fed = base
        fed.calories = 2400
        fed.proteinG = 190
        fed.waterMl = 3200

        #expect(Battery.computeBattery(base) == Battery.computeBattery(fed))
    }

    // MARK: Epley

    @Test("unloaded work has no estimate — nil, never zero")
    func unloadedWorkHasNoEstimate() {
        // The exact shape that printed "1RM 0" beside a Reverse Crunch 0 kg × 17
        // and flattened the movement's entire progress chart.
        #expect(Epley.oneRepMax(weight: 0, reps: 17) == nil)
        #expect(Epley.oneRepMax(weight: 0, reps: 1) == nil)
        #expect(Epley.oneRepMax(weight: -12, reps: 5) == nil)
        #expect(Epley.oneRepMax(weight: .nan, reps: 5) == nil)
        #expect(Epley.oneRepMax(weight: .infinity, reps: 5) == nil)
    }

    @Test("a single rep returns the load itself")
    func singleRepIsTheLoad() {
        #expect(Epley.oneRepMax(weight: 142.5, reps: 1) == 142.5)
    }

    // MARK: Energy

    @Test("TDEE is all-or-nothing: a missing component yields nil, not a partial total")
    func tdeeIsAllOrNothing() {
        // A null propagates; a zero lies. A day with no active-energy sync must
        // not report a 400 kcal larger deficit than it earned.
        #expect(Energy.tdee(bmr: nil, active: 400, intakeKcal: 1900) == nil)
        #expect(Energy.tdee(bmr: 1500, active: nil, intakeKcal: 1900) == nil)
        #expect(Energy.tdee(bmr: 1500, active: 400, intakeKcal: nil) == nil)
        #expect(Energy.tdee(bmr: 1500, active: 400, intakeKcal: 1900) != nil)
    }

    @Test("TEF is included, and it is not a rounding error")
    func tefIsMaterial() {
        // ~200 kcal/day on a ~1900 kcal intake — a fifth of a kilo of fat a week
        // that `BMR + active` credited to nothing.
        let tef = try! #require(Energy.tef(intakeKcal: 1900))
        #expect(tef > 190 && tef < 210)
    }

    // MARK: Rounding

    @Test("jsRound follows JavaScript's rule, not Swift's")
    func jsRoundMatchesJavaScript() {
        // Math.round rounds a half towards POSITIVE INFINITY. Swift's rounded()
        // rounds away from zero. They differ on every negative half, which is
        // precisely the input a hand-written test grid never contains.
        #expect(jsRound(2.5) == 3)
        #expect(jsRound(-2.5) == -2)
        #expect(jsRound(0.5) == 1)
        #expect(jsRound(-0.5) == 0)
        #expect(jsRound(1.4999999) == 1)

        // The divergence, stated as the assertion that would have caught it.
        #expect(jsRound(-2.5) != (-2.5).rounded())
    }
}
