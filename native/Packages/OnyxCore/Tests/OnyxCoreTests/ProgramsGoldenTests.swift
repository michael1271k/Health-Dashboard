import Foundation
import Testing
@testable import OnyxCore

// ─────────────────────────────────────────────────────────────────────────────
// The plan id migration and the phase narrowing — replayed from `npm run golden`.
//
// The catalogue, the phase goals and the weekly set targets were tables here
// until W2; they are `plans` / `plan_phase_goals` / `volume_targets` rows now
// and nothing in the package holds a copy to compare.
// ─────────────────────────────────────────────────────────────────────────────

@Suite("Plans — the id migration")
struct PlanCatalogueGoldenTests {

    struct RawIn: Decodable { let raw: String? }

    /// The catalogue is rows now, so `normalizePlanId` is alias hygiene only:
    /// it resolves the aliases the vector names and hands every other
    /// non-empty id back unchanged (existence is `resolvePlanId`'s question).
    /// The vector's nils for UNKNOWN ids were the deleted catalogue's answer;
    /// only nil and empty still read as nil.
    @Test("normalizePlanId agrees on every alias and every falsy id")
    func normalizeMatches() throws {
        for c in try GoldenFixture<RawIn, String?>.load("plan-normalize").cases {
            let raw = c.input.raw
            if let expected = c.expected {
                #expect(Programs.normalizePlanId(raw) == expected, "normalizePlanId — \(c.name)")
            } else if raw == nil || raw == "" {
                #expect(Programs.normalizePlanId(raw) == nil, "normalizePlanId — \(c.name)")
            } else {
                #expect(Programs.normalizePlanId(raw) == raw, "normalizePlanId — \(c.name)")
            }
        }
    }

    @Test("resolvePlanId falls to the active plan, then picker order, then the stored string")
    func resolveFallsBack() {
        let plans = FounderTables.plans
        #expect(Programs.resolvePlanId(stored: "apex51", in: plans) == "onyx5")
        #expect(Programs.resolvePlanId(stored: "bogus", in: plans, activeFallback: "onyx4") == "onyx4")
        #expect(Programs.resolvePlanId(stored: "bogus", in: plans) == Programs.pickerOrder(plans).first?.id)
        #expect(Programs.resolvePlanId(stored: "bogus", in: []) == "bogus")
        #expect(Programs.pickerOrder(plans).map(\.id) == ["onyx5", "onyx4", "ppl"])
    }
}

@Suite("Phases — the narrowing")
struct PhaseGoalsGoldenTests {

    struct StoredIn: Decodable { let raw: String? }

    @Test("a stored phase string narrows the way both TypeScript copies narrow it")
    func narrowingMatches() throws {
        for c in try GoldenFixture<StoredIn, ProgramPhase>.load("plan-phase-narrow").cases {
            #expect(ProgramPhase.stored(c.input.raw) == c.expected, "ProgramPhase.stored — \(c.name)")
        }
    }

    @Test("an empty phase goal carries no ceiling — nil, never 0")
    func emptyHasNoCeiling() {
        // A ceiling of zero would end the phase immediately.
        #expect(PhaseGoals.empty(.cut).bodyFatCeilingPct == nil)
    }
}
