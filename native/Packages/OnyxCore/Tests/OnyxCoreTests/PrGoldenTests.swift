import Foundation
import Testing
@testable import OnyxCore

// ─────────────────────────────────────────────────────────────────────────────
// PR engine, truth and seed — `src/lib/training/pr*.ts` + `exercises/aliases.ts`,
// replayed from `npm run golden`.
// ─────────────────────────────────────────────────────────────────────────────

private struct Empty: Decodable {}

@Suite("Exercise aliases")
struct AliasGoldenTests {
    @Test("the alias table equals the TypeScript one")
    func tableMatches() throws {
        let e = try #require(try GoldenFixture<Empty, [String: String]>.load("exercise-aliases").cases.first).expected
        #expect(ExerciseAliases.table == e)
    }

    struct RawIn: Decodable { let raw: String }

    @Test("canonicalExerciseName matches — aliases resolve, everything else is handed back untouched")
    func canonicalMatches() throws {
        let fixture = try GoldenFixture<RawIn, String>.load("exercise-canonical-name")
        #expect(fixture.cases.count > 80)
        for c in fixture.cases {
            #expect(ExerciseAliases.canonicalName(c.input.raw) == c.expected, "canonicalExerciseName — \(c.name)")
        }
    }
}

@Suite("PR truth — the asserted book and the excess floor")
struct PrTruthGoldenTests {
    struct Book: Decodable { let asOf: String; let truth: [String: TruthRecord]; let logged: [String: LoggedBest] }

    @Test("the book and the logged snapshot equal the TypeScript, field for field")
    func bookMatches() throws {
        let e = try #require(try GoldenFixture<Empty, Book>.load("pr-truth-book").cases.first).expected
        #expect(PrTruth.asOf == e.asOf)
        #expect(PrTruth.book.count == e.truth.count)
        for (name, rec) in e.truth { #expect(PrTruth.book[name] == rec, "PR_TRUTH — \(name)") }
        #expect(PrTruth.logged.count == e.logged.count)
        for (name, rec) in e.logged { #expect(PrTruth.logged[name] == rec, "PR_LOGGED — \(name)") }
    }

    struct NameIn: Decodable { let name: String? }

    @Test("prFloorFor matches on every exercise — only the excess floors")
    func floorMatches() throws {
        let fixture = try GoldenFixture<NameIn, PrFloor?>.load("pr-floor")
        #expect(fixture.cases.count > 30)
        for c in fixture.cases {
            #expect(PrTruth.floor(for: c.input.name) == c.expected, "prFloorFor — \(c.name)")
        }
    }

    struct AxisIn: Decodable { let name: String; let axis: PrAxis }

    @Test("truthAxisValue matches")
    func axisValueMatches() throws {
        let fixture = try GoldenFixture<AxisIn, Double?>.load("pr-truth-axis-value")
        for c in fixture.cases {
            expectClose(PrTruth.axisValue(PrTruth.book[c.input.name], c.input.axis), c.expected, "truthAxisValue — \(c.name)")
        }
    }
}

@Suite("PR seed — the asserted era")
struct PrSeedGoldenTests {
    struct Seed: Decodable { let cutoff: String; let assertedDates: [String]; let seeded: [SeededPr] }

    @Test("the seeded list, the cutoff and the asserted dates equal the TypeScript")
    func seedMatches() throws {
        let e = try #require(try GoldenFixture<Empty, Seed>.load("pr-seed-book").cases.first).expected
        #expect(PrSeed.cutoff == e.cutoff)
        #expect(PrSeed.assertedDates == e.assertedDates)
        #expect(PrSeed.records == e.seeded)
    }

    struct SeedIn: Decodable { let date: String?; let exercise: String?; let setNumber: Int?; let weightKg: Double; let reps: Double }

    @Test("seededAxesFor matches — strict on every field, tolerant of a missing one")
    func seededAxesMatch() throws {
        let fixture = try GoldenFixture<SeedIn, [PrAxis]>.load("pr-seeded-axes")
        #expect(fixture.cases.count > 150)
        for c in fixture.cases {
            let i = c.input
            #expect(
                PrSeed.seededAxes(date: i.date, exercise: i.exercise, setNumber: i.setNumber, weightKg: i.weightKg, reps: i.reps) == c.expected,
                "seededAxesFor — \(c.name)"
            )
        }
    }

    struct DateIn: Decodable { let date: String? }

    @Test("isAssertedSession matches on the boundary")
    func assertedMatches() throws {
        let fixture = try GoldenFixture<DateIn, Bool>.load("pr-asserted-session")
        for c in fixture.cases {
            #expect(PrSeed.isAssertedSession(c.input.date) == c.expected, "isAssertedSession — \(c.name)")
        }
    }
}

@Suite("PR engine — the four axes")
struct PrEngineGoldenTests {
    struct E1rmIn: Decodable { let reps: Double; let floor: Double? }
    struct TypeIn: Decodable { let setType: String? }
    struct WeightIn: Decodable { let weightKg: Double }
    struct LabelIn: Decodable { let axis: PrAxis; let timed: Bool }

    @Test("the eligibility rules and labels match")
    func rulesMatch() throws {
        for c in try GoldenFixture<E1rmIn, Bool>.load("pr-e1rm-eligible").cases {
            #expect(PrEngine.e1rmEligible(c.input.reps, floor: c.input.floor) == c.expected, "e1rmEligible — \(c.name)")
        }
        for c in try GoldenFixture<TypeIn, Bool>.load("pr-ineligible").cases {
            #expect(PrEngine.isPrIneligible(c.input.setType) == c.expected, "isPrIneligible — \(c.name)")
        }
        for c in try GoldenFixture<WeightIn, Bool>.load("pr-reps-eligible").cases {
            #expect(PrEngine.repsAxisEligible(c.input.weightKg) == c.expected, "repsAxisEligible — \(c.name)")
        }
        for c in try GoldenFixture<LabelIn, String>.load("pr-axis-label").cases {
            #expect(PrEngine.axisLabel(c.input.axis, timed: c.input.timed) == c.expected, "prAxisLabel — \(c.name)")
        }
    }

    struct CreditIn: Decodable { let rows: [VolumeCreditRow] }

    @Test("volumeCredits matches — the pair scores once, at the weaker side, on the completing row")
    func creditsMatch() throws {
        let fixture = try GoldenFixture<CreditIn, [Double?]>.load("pr-volume-credits")
        for c in fixture.cases {
            let actual = PrEngine.volumeCredits(c.input.rows)
            #expect(actual.count == c.expected.count, "volumeCredits length — \(c.name)")
            for (a, e) in zip(actual, c.expected) { expectClose(a, e, "volumeCredits — \(c.name)") }
        }
    }

    struct BaseIn: Decodable { let rows: [BaselineSetRow]; let timedKeys: [String]; let floor: Bool }

    @Test("buildBaselines matches, tuple for tuple, in insertion order")
    func baselinesMatch() throws {
        let fixture = try GoldenFixture<BaseIn, PrBaselines>.load("pr-baselines")
        #expect(fixture.cases.count > 300)
        for c in fixture.cases {
            let timed = Set(c.input.timedKeys)
            let actual = PrEngine.buildBaselines(
                c.input.rows,
                isTimed: { timed.contains($0) },
                floorFor: c.input.floor ? { PrTruth.floor(for: $0) } : nil
            )
            #expect(actual == c.expected, "buildBaselines — \(c.name)")
        }
    }

    struct SessIn: Decodable { let sets: [PrCandidateSet]; let baselines: PrBaselines }
    struct PerSet: Decodable { let axes: [PrAxis]; let est1rm: Double?; let records: [String: AxisRecord] }
    struct KeyAxesOut: Decodable { let key: String; let axes: [PrAxis] }
    struct RecEntry: Decodable { let axis: PrAxis; let weightKg: Double; let reps: Double; let value: Double }
    struct RecKey: Decodable { let key: String; let records: [RecEntry] }
    struct SessOut: Decodable { let perSet: [PerSet]; let axesByKey: [KeyAxesOut]; let prCount: Int; let recordSets: [RecKey] }

    @Test("whole sessions match — axes, deltas, counts and the ledger")
    func sessionsMatch() throws {
        let fixture = try GoldenFixture<SessIn, SessOut>.load("pr-session")
        #expect(fixture.cases.count > 150)
        for c in fixture.cases {
            let r = PrEngine.detectSessionPrs(c.input.sets, c.input.baselines)
            let e = c.expected

            #expect(r.perSet.count == e.perSet.count, "perSet length — \(c.name)")
            for (i, (a, x)) in zip(r.perSet, e.perSet).enumerated() {
                #expect(a.axes == x.axes, "axes[\(i)] — \(c.name)")
                expectClose(a.est1rm, x.est1rm, "est1rm[\(i)] — \(c.name)")
                let records = Dictionary(uniqueKeysWithValues: a.records.map { ($0.key.rawValue, $0.value) })
                #expect(records == x.records, "records[\(i)] — \(c.name)")
            }

            #expect(r.axesByKey.map(\.key) == e.axesByKey.map(\.key), "axesByKey keys — \(c.name)")
            #expect(r.axesByKey.map(\.axes) == e.axesByKey.map(\.axes), "axesByKey axes — \(c.name)")
            #expect(r.prCount == e.prCount, "prCount — \(c.name)")

            let rec = PrEngine.recordSets(c.input.sets, r)
            #expect(rec.map(\.key) == e.recordSets.map(\.key), "recordSets keys — \(c.name)")
            for (a, x) in zip(rec, e.recordSets) {
                #expect(a.records.map(\.axis) == x.records.map(\.axis), "recordSets axes — \(a.key) — \(c.name)")
                for (ra, rx) in zip(a.records, x.records) {
                    #expect(ra.set == RecordSet(weightKg: rx.weightKg, reps: rx.reps, value: rx.value), "recordSets \(a.key) \(ra.axis) — \(c.name)")
                }
            }
        }
    }
}
