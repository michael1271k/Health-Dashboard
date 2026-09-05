import Foundation
import Testing
@testable import OnyxCore

// ─────────────────────────────────────────────────────────────────────────────
// The plan catalogue, the id migration, the phase narrowing, the phase goals
// and the weekly set targets — replayed from `npm run golden`.
//
// These are tables rather than formulas, which is exactly why they are worth
// replaying: a transcription slip in a table looks like data and reviews like
// data. Nothing on this page is derived, so every failure here is a number that
// was typed in twice and disagreed.
// ─────────────────────────────────────────────────────────────────────────────

private struct NoInput: Decodable {}

@Suite("Plans — the catalogue and the id migration")
struct PlanCatalogueGoldenTests {

    struct CatalogueOut: Decodable {
        let defaultPlanId: String
        let plans: [PlanInfo]
    }

    @Test("the three plans, live first and legacy last")
    func catalogueMatches() throws {
        let e = try #require(try GoldenFixture<NoInput, CatalogueOut>.load("plan-catalogue").cases.first).expected
        #expect(Programs.defaultPlanId == e.defaultPlanId)
        #expect(Programs.pickerOrder == e.plans)
        // The catalogue and the picker hold the same plans; only the order is
        // the picker's business.
        #expect(Set(Programs.all.map(\.id)) == Set(e.plans.map(\.id)))
    }

    struct RawIn: Decodable { let raw: String? }

    @Test("normalizePlanId agrees on every alias, every stale id and every falsy one")
    func normalizeMatches() throws {
        for c in try GoldenFixture<RawIn, String?>.load("plan-normalize").cases {
            #expect(Programs.normalizePlanId(c.input.raw) == c.expected, "normalizePlanId — \(c.name)")
        }
    }

    @Test("an id that normalizes always names a plan in the catalogue")
    func normalizedIdsResolve() throws {
        for c in try GoldenFixture<RawIn, String?>.load("plan-normalize").cases {
            guard let id = Programs.normalizePlanId(c.input.raw) else { continue }
            #expect(Programs.plan(id: id) != nil, "plan(id:) — \(c.name)")
        }
    }
}

@Suite("Phases — the narrowing and the goals a phase steers toward")
struct PhaseGoalsGoldenTests {

    struct StoredIn: Decodable { let raw: String? }

    @Test("a stored phase string narrows the way both TypeScript copies narrow it")
    func narrowingMatches() throws {
        for c in try GoldenFixture<StoredIn, ProgramPhase>.load("plan-phase-narrow").cases {
            #expect(ProgramPhase.stored(c.input.raw) == c.expected, "ProgramPhase.stored — \(c.name)")
        }
    }

    struct GoalsIn: Decodable { let planId: String; let phase: ProgramPhase }

    @Test("phaseGoalsFor matches on every plan in both directions, overlay included")
    func goalsMatch() throws {
        let fixture = try GoldenFixture<GoalsIn, PhaseGoals>.load("plan-phase-goals")
        for c in fixture.cases {
            let g = Programs.goals(planId: c.input.planId, phase: c.input.phase)
            // Field by field rather than `==`, so a failure names the goal that
            // drifted instead of printing two sixteen-field structs.
            #expect(g.phase == c.expected.phase, "phase — \(c.name)")
            #expect(g.label == c.expected.label, "label — \(c.name)")
            expectClose(g.calorieGoal, c.expected.calorieGoal, "calorieGoal — \(c.name)")
            expectClose(g.proteinGoalG, c.expected.proteinGoalG, "proteinGoalG — \(c.name)")
            expectClose(g.carbsGoalG, c.expected.carbsGoalG, "carbsGoalG — \(c.name)")
            expectClose(g.fatGoalG, c.expected.fatGoalG, "fatGoalG — \(c.name)")
            expectClose(g.fiberGoalG, c.expected.fiberGoalG, "fiberGoalG — \(c.name)")
            expectClose(g.fiberMin, c.expected.fiberMin, "fiberMin — \(c.name)")
            expectClose(g.fiberMax, c.expected.fiberMax, "fiberMax — \(c.name)")
            expectClose(g.stepsGoal, c.expected.stepsGoal, "stepsGoal — \(c.name)")
            expectClose(g.targetWeightKg, c.expected.targetWeightKg, "targetWeightKg — \(c.name)")
            expectClose(g.targetBodyFatPct, c.expected.targetBodyFatPct, "targetBodyFatPct — \(c.name)")
            expectClose(g.targetMuscleMassKg, c.expected.targetMuscleMassKg, "targetMuscleMassKg — \(c.name)")
            expectClose(g.rateMinKgWk, c.expected.rateMinKgWk, "rateMinKgWk — \(c.name)")
            expectClose(g.rateMaxKgWk, c.expected.rateMaxKgWk, "rateMaxKgWk — \(c.name)")
            expectClose(g.bodyFatCeilingPct, c.expected.bodyFatCeilingPct, "bodyFatCeilingPct — \(c.name)")
            #expect(g == c.expected, "phaseGoalsFor — \(c.name)")
        }
        // The cut carries no body-fat ceiling, and that has to arrive as nil
        // rather than as 0 — a ceiling of zero would end the phase immediately.
        #expect(PhaseGoals.cut.bodyFatCeilingPct == nil)
    }
}

@Suite("Program targets — sixteen muscles, two phases")
struct ProgramTargetsGoldenTests {

    struct TargetIn: Decodable { let phase: String; let muscle: String }

    @Test("every weekly set target matches, and the unknown phase lands on the cut")
    func targetsMatch() throws {
        let fixture = try GoldenFixture<TargetIn, Double>.load("program-targets")
        #expect(fixture.cases.count == 4 * LandmarkMuscle.allCases.count)

        for c in fixture.cases {
            // The raw phase string goes through the SAME narrowing a stored
            // one does. That is where the TypeScript's `?? PROGRAM_TARGETS.cut`
            // fallback lives now: "maintenance" and outright garbage both
            // become `.cut` before a target is ever looked up.
            let phase = ProgramPhase.stored(c.input.phase)
            let muscle = try #require(LandmarkMuscle(rawValue: c.input.muscle), "unknown muscle \(c.input.muscle)")
            expectClose(Programs.weeklySetTargets(phase)[muscle], c.expected, "programTargets — \(c.name)")
        }
    }

    @Test("both phases name all sixteen muscles")
    func tablesAreComplete() {
        for phase in ProgramPhase.allCases {
            let targets = Programs.weeklySetTargets(phase)
            #expect(targets.count == LandmarkMuscle.allCases.count, "\(phase) is missing a muscle")
        }
    }
}
