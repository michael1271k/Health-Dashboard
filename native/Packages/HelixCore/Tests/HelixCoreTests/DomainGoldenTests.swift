import Foundation
import Testing
@testable import HelixCore

// ─────────────────────────────────────────────────────────────────────────────
// Epley
// ─────────────────────────────────────────────────────────────────────────────

@Suite("Epley — estimated 1RM")
struct EpleyGoldenTests {
    struct Input: Decodable { let weight: Double; let reps: Double }

    @Test("matches the TypeScript implementation on every exported case")
    func matchesGoldenVectors() throws {
        let fixture = try GoldenFixture<Input, Double?>.load("epley")
        #expect(!fixture.cases.isEmpty)

        for c in fixture.cases {
            let actual = Epley.oneRepMax(weight: c.input.weight, reps: c.input.reps)
            expectClose(actual, c.expected, "epley1RM — \(c.name)")
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Energy — TEF and TDEE
// ─────────────────────────────────────────────────────────────────────────────

@Suite("Energy — TEF and TDEE")
struct EnergyGoldenTests {
    struct TefInput: Decodable { let intakeKcal: Double? }
    struct TdeeInput: Decodable {
        let bmr: Double?
        let active: Double?
        let intakeKcal: Double?
    }

    @Test("thermic effect of food matches")
    func tefMatches() throws {
        let fixture = try GoldenFixture<TefInput, Double?>.load("tef")
        for c in fixture.cases {
            expectClose(
                Energy.tef(intakeKcal: c.input.intakeKcal),
                c.expected,
                "tefKcal — \(c.name)"
            )
        }
    }

    @Test("total daily energy expenditure matches, including every null path")
    func tdeeMatches() throws {
        let fixture = try GoldenFixture<TdeeInput, Double?>.load("tdee")
        for c in fixture.cases {
            expectClose(
                Energy.tdee(bmr: c.input.bmr, active: c.input.active, intakeKcal: c.input.intakeKcal),
                c.expected,
                "tdeeKcal — \(c.name)"
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Battery
// ─────────────────────────────────────────────────────────────────────────────

@Suite("Battery — the drain model (v7)")
struct BatteryGoldenTests {
    struct Constants: Decodable {
        let floor, wakeMin, wakeRange, timeMax, activityCap, workoutMax: Double
        let defaultRpe, relMin, relMax, maxAwake: Double
        let maxTotalDrain, maintenanceDrainFactor, maintenanceRelMin: Double
    }
    struct Empty: Decodable {}
    struct WorkoutMaxInput: Decodable { let dayKey: String?; let maintenance: Bool }
    struct RelMinInput: Decodable { let maintenance: Bool }
    struct SleepQualityExpected: Decodable { let quality: Double; let morningCharge: Double }
    struct WorkoutDrainInput: Decodable {
        let sessionVolumeKg: Double
        let trailingAvgVolumeKg: Double
        let sessionRpe: Double?
        let dayKey: String?
        let maintenance: Bool
    }
    struct TimeDrainInput: Decodable { let hoursAwake: Double }
    struct BatteryInput: Decodable {
        let inputs: ScoringInputs
        let hoursAwakeArg: Double?
    }
    struct BatteryExpected: Decodable { let morningCharge: Double; let currentPct: Double }

    @Test("every constant survived the translation")
    func constantsMatch() throws {
        let fixture = try GoldenFixture<Empty, Constants>.load("battery-constants")
        let e = try #require(fixture.cases.first).expected
        let d = Battery.defaults

        expectClose(d.floor, e.floor, "floor")
        expectClose(d.wakeMin, e.wakeMin, "wakeMin")
        expectClose(d.wakeRange, e.wakeRange, "wakeRange")
        expectClose(d.timeMax, e.timeMax, "timeMax")
        expectClose(d.activityCap, e.activityCap, "activityCap")
        expectClose(d.workoutMax, e.workoutMax, "workoutMax")
        expectClose(d.defaultRpe, e.defaultRpe, "defaultRpe")
        expectClose(d.relMin, e.relMin, "relMin")
        expectClose(d.relMax, e.relMax, "relMax")
        expectClose(d.maxAwake, e.maxAwake, "maxAwake")
        expectClose(Battery.maxTotalDrain, e.maxTotalDrain, "maxTotalDrain")
        expectClose(Battery.maintenanceDrainFactor, e.maintenanceDrainFactor, "maintenanceDrainFactor")
        expectClose(Battery.maintenanceRelMin, e.maintenanceRelMin, "maintenanceRelMin")
    }

    @Test("workoutMaxFor matches — keyed on the programme day, never the split")
    func workoutMaxMatches() throws {
        let fixture = try GoldenFixture<WorkoutMaxInput, Double>.load("workout-max")
        for c in fixture.cases {
            expectClose(
                Battery.workoutMaxFor(dayKey: c.input.dayKey, maintenance: c.input.maintenance),
                c.expected,
                "workoutMaxFor — \(c.name)"
            )
        }
    }

    @Test("relMinFor matches")
    func relMinMatches() throws {
        let fixture = try GoldenFixture<RelMinInput, Double>.load("rel-min")
        for c in fixture.cases {
            expectClose(
                Battery.relMinFor(maintenance: c.input.maintenance),
                c.expected,
                "relMinFor — \(c.name)"
            )
        }
    }

    @Test("sleep quality and the wake charge it drives both match")
    func sleepQualityMatches() throws {
        let fixture = try GoldenFixture<ScoringInputs, SleepQualityExpected>.load("sleep-quality")
        for c in fixture.cases {
            let quality = Battery.computeSleepQuality(c.input)
            expectClose(quality, c.expected.quality, "computeSleepQuality — \(c.name)")
            expectClose(
                Battery.computeMorningCharge(sleepQuality: quality),
                c.expected.morningCharge,
                "computeMorningCharge — \(c.name)"
            )
        }
    }

    @Test("the raised-cosine time drain matches")
    func timeDrainMatches() throws {
        let fixture = try GoldenFixture<TimeDrainInput, Double>.load("time-drain")
        for c in fixture.cases {
            expectClose(
                Battery.timeDrain(hoursAwake: c.input.hoursAwake),
                c.expected,
                "timeDrain — \(c.name)"
            )
        }
    }

    @Test("workout drain matches across all 1,300+ exported combinations")
    func workoutDrainMatches() throws {
        let fixture = try GoldenFixture<WorkoutDrainInput, Double>.load("workout-drain")
        #expect(fixture.cases.count > 1000, "the grid collapsed — check the exporter")

        for c in fixture.cases {
            expectClose(
                Battery.workoutDrain(
                    sessionVolumeKg: c.input.sessionVolumeKg,
                    trailingAvgVolumeKg: c.input.trailingAvgVolumeKg,
                    sessionRpe: c.input.sessionRpe,
                    dayKey: c.input.dayKey,
                    maintenance: c.input.maintenance
                ),
                c.expected,
                "workoutDrain — \(c.name)"
            )
        }
    }

    @Test("the whole battery matches, including both paths into hoursAwake")
    func computeBatteryMatches() throws {
        let fixture = try GoldenFixture<BatteryInput, BatteryExpected>.load("battery")
        for c in fixture.cases {
            let state = Battery.computeBattery(c.input.inputs, hoursAwake: c.input.hoursAwakeArg)
            expectClose(state.morningCharge, c.expected.morningCharge, "morningCharge — \(c.name)")
            expectClose(state.currentPct, c.expected.currentPct, "currentPct — \(c.name)")
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Readiness
// ─────────────────────────────────────────────────────────────────────────────

@Suite("Readiness")
struct ReadinessGoldenTests {
    struct Input: Decodable {
        let sleepScore: Double?
        let recoveryScore: Double?
        let batteryPct: Double
    }

    @Test("level, label, colour and reason all match")
    func matchesGoldenVectors() throws {
        let fixture = try GoldenFixture<Input, ReadinessResult>.load("readiness")
        for c in fixture.cases {
            let actual = Readiness.compute(
                sleepScore: c.input.sleepScore,
                recoveryScore: c.input.recoveryScore,
                batteryPct: c.input.batteryPct
            )
            // Compared whole, not field by field: the colour and the sentence are
            // part of the contract. A port that got the level right and the
            // advice text wrong would still be telling the athlete the wrong thing.
            #expect(actual == c.expected, "computeReadiness — \(c.name)")
        }
    }
}
