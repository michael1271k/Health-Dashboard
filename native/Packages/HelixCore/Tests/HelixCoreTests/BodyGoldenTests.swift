import Foundation
import Testing
@testable import HelixCore

private struct Empty: Decodable {}

@Suite("Body — composition, the verdict and the gap")
struct BodyGoldenTests {
    @Test("deriveBodyComp matches — every mass, only where its inputs exist")
    func deriveMatches() throws {
        for c in try GoldenFixture<BodyCompInput, BodyCompDerived>.load("body-comp-derive").cases {
            #expect(BodyComposition.derive(c.input) == c.expected, "deriveBodyComp — \(c.name)")
        }
    }

    struct WhrIn: Decodable { let ratio: Double; let sex: String }

    @Test("whrBand and visceralBand match")
    func bandsMatch() throws {
        for c in try GoldenFixture<WhrIn, WhrBand>.load("whr-band").cases {
            #expect(BodyComposition.whrBand(c.input.ratio, sex: c.input.sex) == c.expected, "whrBand — \(c.name)")
        }
        struct IndexIn: Decodable { let index: Double }
        for c in try GoldenFixture<IndexIn, VisceralBand>.load("visceral-band").cases {
            #expect(BodyComposition.visceralBand(c.input.index) == c.expected, "visceralBand — \(c.name)")
        }
    }

    struct VerdictIn: Decodable { let metric: BodyMetric; let delta: Double; let phase: ProgramPhase; let maintenance: Bool }

    @Test("deltaVerdict matches across every metric, phase, band edge and sign")
    func verdictMatches() throws {
        let fixture = try GoldenFixture<VerdictIn, Verdict>.load("delta-verdict")
        #expect(fixture.cases.count > 300)
        for c in fixture.cases {
            #expect(DeltaVerdict.verdict(c.input.metric, delta: c.input.delta, phase: c.input.phase, maintenance: c.input.maintenance) == c.expected, "deltaVerdict — \(c.name)")
        }
    }

    struct Band: Decodable { let weight: Double; let fat: Double; let muscle: Double; let water: Double? }

    @Test("the maintenance band equals the TypeScript")
    func bandMatches() throws {
        let e = try #require(try GoldenFixture<Empty, Band>.load("maintenance-band").cases.first).expected
        #expect(DeltaVerdict.maintenanceBand[.weight] == e.weight)
        #expect(DeltaVerdict.maintenanceBand[.fat] == e.fat)
        #expect(DeltaVerdict.maintenanceBand[.muscle] == e.muscle)
        #expect(DeltaVerdict.maintenanceBand[.water] == .infinity && e.water == nil)
    }

    struct GapIn: Decodable { let row: BodyCompFields? }
    struct GapOut: Decodable { let state: BodyCompState; let missing: [String]; let label: String?; let short: String? }

    @Test("the composition gap matches")
    func gapMatches() throws {
        for c in try GoldenFixture<GapIn, GapOut>.load("body-comp-gap").cases {
            #expect(CompGap.state(c.input.row) == c.expected.state, "bodyCompState — \(c.name)")
            #expect(CompGap.missingFields(c.input.row) == c.expected.missing, "missingBodyCompFields — \(c.name)")
            #expect(CompGap.gapLabel(c.input.row) == c.expected.label, "bodyCompGapLabel — \(c.name)")
            #expect(CompGap.gapShort(c.input.row) == c.expected.short, "bodyCompGapShort — \(c.name)")
        }
    }
}
