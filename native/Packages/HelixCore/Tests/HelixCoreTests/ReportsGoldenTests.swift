import Foundation
import Testing
@testable import HelixCore

// ─────────────────────────────────────────────────────────────────────────────
// Reports — the weekly export, byte for byte, and everything it renders from.
// ─────────────────────────────────────────────────────────────────────────────

private struct Empty: Decodable {}

/// Drop every null (and every key holding one) so the TypeScript payload —
/// which writes `null` for a `x: number | null` field — compares structurally
/// with the Swift one, which omits an absent optional.
private func stripNulls(_ v: Any) -> Any {
    if let d = v as? [String: Any] {
        var out: [String: Any] = [:]
        for (k, x) in d where !(x is NSNull) { out[k] = stripNulls(x) }
        return out
    }
    if let a = v as? [Any] { return a.map(stripNulls) }
    return v
}

private func loadRaw(_ name: String) throws -> [[String: Any]] {
    guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else { throw GoldenError.missing(name) }
    let root = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
    return root["cases"] as! [[String: Any]]
}

/// The first line on which two strings differ, for a readable failure.
private func firstDiff(_ a: String, _ b: String) -> String {
    let la = a.split(separator: "\n", omittingEmptySubsequences: false)
    let lb = b.split(separator: "\n", omittingEmptySubsequences: false)
    for (i, (x, y)) in zip(la, lb).enumerated() where x != y { return "line \(i + 1)\n  swift: \(x)\n  ts:    \(y)" }
    return la.count == lb.count ? "identical" : "length \(la.count) vs \(lb.count)"
}

@Suite("Week numbering")
struct WeekNumberGoldenTests {
    struct In: Decodable { let date: String; let startDay: Int }
    struct Out: Decodable { let weekStart: String; let weekNumber: Double; let label: String; let weekNumberForDate: Double }

    @Test("weekStartOf, weekNumberOf and weekLabelOf match")
    func matches() throws {
        for c in try GoldenFixture<In, Out>.load("week-number").cases {
            let ws = Week.start(of: c.input.date, startDay: c.input.startDay)
            #expect(ws == c.expected.weekStart, "weekStartOf — \(c.name)")
            expectClose(Week.number(ofWeekStart: ws), c.expected.weekNumber, "weekNumberOf — \(c.name)")
            #expect(Week.label(ofWeekStart: ws) == c.expected.label, "weekLabelOf — \(c.name)")
            expectClose(Week.number(forDate: c.input.date, startDay: c.input.startDay), c.expected.weekNumberForDate, "weekNumberForDate — \(c.name)")
        }
    }
}

@Suite("Weekly export — the document")
struct WeeklyExportGoldenTests {
    struct Out: Decodable {
        let markdown: String; let summary: WeeklySummary; let totals: TrendTotals; let energy: EnergyBalance; let derived: DerivedWeek
    }

    @Test("every document matches byte for byte, and so do its aggregates")
    func documentsMatch() throws {
        let fixture = try GoldenFixture<WeeklyExportInput, Out>.load("weekly-export")
        #expect(fixture.cases.count >= 8)
        for c in fixture.cases {
            let md = WeeklyExport.build(c.input)
            #expect(md == c.expected.markdown, "markdown — \(c.name) — \(firstDiff(md, c.expected.markdown))")
            #expect(WeeklyExport.summary(c.input) == c.expected.summary, "weeklySummary — \(c.name)")
            #expect(WeeklyExport.trendTotals(days: c.input.days, sessions: c.input.sessions, cardio: c.input.cardio ?? []) == c.expected.totals, "trendTotals — \(c.name)")
            #expect(WeeklyExport.energyBalance(c.input.days) == c.expected.energy, "energyBalance — \(c.name)")
            #expect(Derived.week(c.input) == c.expected.derived, "derivedWeek — \(c.name)")
        }
    }

    @Test("the machine-readable payload matches structurally")
    func jsonMatches() throws {
        for c in try loadRaw("weekly-export") {
            let name = c["name"] as! String
            let input = try JSONDecoder().decode(WeeklyExportInput.self, from: JSONSerialization.data(withJSONObject: c["input"]!))
            let expected = stripNulls((c["expected"] as! [String: Any])["json"]!)
            let actual = stripNulls(try WeekJson.payload(input))
            #expect(NSDictionary(dictionary: actual as! [String: Any]).isEqual(to: expected as! [String: Any]), "weekJsonBlock — \(name)")
        }
    }
}

@Suite("Weekly export — the small renderers")
struct ExportRenderersGoldenTests {
    struct ValuesIn: Decodable { let values: [Double?] }

    @Test("sparkline matches")
    func sparklineMatches() throws {
        for c in try GoldenFixture<ValuesIn, String>.load("sparkline").cases {
            #expect(WeeklyExport.sparkline(c.input.values) == c.expected, "sparkline — \(c.name)")
        }
    }

    struct TableIn: Decodable { let header: [String]; let body: [[String]]; let align: [WeeklyExport.Align] }

    @Test("markdownTable matches")
    func tableMatches() throws {
        for c in try GoldenFixture<TableIn, [String]>.load("markdown-table").cases {
            #expect(WeeklyExport.markdownTable(header: c.input.header, body: c.input.body, align: c.input.align) == c.expected, "markdownTable — \(c.name)")
        }
    }

    struct PaceIn: Decodable { let distanceM: Double?; let durationMin: Double? }
    struct PaceOut: Decodable { let pace: Double?; let formatted: String }

    @Test("pace matches")
    func paceMatches() throws {
        for c in try GoldenFixture<PaceIn, PaceOut>.load("pace").cases {
            let pace = CardioMetrics.paceMinPerKm(distanceM: c.input.distanceM, durationMin: c.input.durationMin)
            expectClose(pace, c.expected.pace, "paceMinPerKm — \(c.name)")
            #expect(CardioMetrics.formatPace(pace) == c.expected.formatted, "formatPace — \(c.name)")
        }
    }

    struct SetFmtIn: Decodable { let weightKg: Double?; let reps: Double?; let timed: Bool; let bare: Bool; let unit: String? }
    struct SetFmtOut: Decodable { let text: String; let unloaded: Bool }

    @Test("formatSet and isUnloadedSet match")
    func setFormatMatches() throws {
        for c in try GoldenFixture<SetFmtIn, SetFmtOut>.load("set-format").cases {
            #expect(SetFormat.format(weightKg: c.input.weightKg, reps: c.input.reps, timed: c.input.timed, unit: c.input.unit ?? "kg", bare: c.input.bare) == c.expected.text, "formatSet — \(c.name)")
            #expect(SetFormat.isUnloaded(c.input.weightKg) == c.expected.unloaded, "isUnloadedSet — \(c.name)")
        }
    }

    struct StoredIn: Decodable { let stored: String? }
    struct SkipOut: Decodable { let reason: String; let isDefault: Bool }

    @Test("the weigh-in skip reason matches")
    func skipMatches() throws {
        for c in try GoldenFixture<StoredIn, SkipOut>.load("weigh-in-skip").cases {
            #expect(WeighIn.skipReason(c.input.stored) == c.expected.reason, "weighInSkipReason — \(c.name)")
            #expect(WeighIn.isDefaultSkipReason(c.input.stored) == c.expected.isDefault, "isDefaultSkipReason — \(c.name)")
        }
    }

    @Test("the nutrient targets table equals the TypeScript")
    func targetsMatch() throws {
        let e = try #require(try GoldenFixture<Empty, [NutrientTarget]>.load("nutrient-targets").cases.first).expected
        #expect(NutrientTargets.all == e)
    }

    struct ZoneIn: Decodable { let sets: Double; let target: Double; let direct: Double }

    @Test("volumeZone matches")
    func zoneMatches() throws {
        for c in try GoldenFixture<ZoneIn, VolumeZone>.load("volume-zone").cases {
            #expect(VolumeZone.of(weeklySets: c.input.sets, target: c.input.target, directSets: c.input.direct) == c.expected, "volumeZone — \(c.name)")
        }
    }

    struct NutrientIn: Decodable { let food: [String: Double]?; let stack: [String: Double]? }
    struct NutrientOut: Decodable { let line: String; let flagged: [String] }

    @Test("nutrientLine and flaggedNutrients match")
    func nutrientsMatch() throws {
        for c in try GoldenFixture<NutrientIn, NutrientOut>.load("nutrient-line").cases {
            #expect(WeeklyExport.nutrientLine(food: c.input.food, stack: c.input.stack) == c.expected.line, "nutrientLine — \(c.name)")
            let day = ExportDay(date: "2026-09-01", weekdayLabel: "Tue", isTrainingDay: false, nutrientsFood: c.input.food, nutrientsStack: c.input.stack, nutritionEstimated: false)
            #expect(WeeklyExport.flaggedNutrients([day]) == c.expected.flagged, "flaggedNutrients — \(c.name)")
        }
    }

    struct DetailIn: Decodable { let sets: [ExportSet]; let exerciseName: String? }

    @Test("setDetail matches, line for line")
    func detailMatches() throws {
        for c in try GoldenFixture<DetailIn, [String]>.load("set-detail").cases {
            #expect(WeeklyExport.setDetail(c.input.sets, exerciseName: c.input.exerciseName) == c.expected, "setDetail — \(c.name)")
        }
    }

    struct ProtocolIn: Decodable { let `protocol`: [ExportSupplement] }

    @Test("consolidateSupplements matches")
    func supplementsMatch() throws {
        for c in try GoldenFixture<ProtocolIn, [String]>.load("supplements-consolidate").cases {
            #expect(WeeklyExport.consolidateSupplements(c.input.`protocol`) == c.expected, "consolidateSupplements — \(c.name)")
        }
    }

    struct LedgerIn: Decodable { let weeks: [LedgerWeek] }

    @Test("trendLedger matches")
    func ledgerMatches() throws {
        for c in try GoldenFixture<LedgerIn, [String]>.load("trend-ledger").cases {
            #expect(WeeklyExport.trendLedger(c.input.weeks) == c.expected, "trendLedger — \(c.name)")
        }
    }

    struct Note: Decodable { let label: String?; let note: String }
    struct NotesOut: Decodable {
        let notes: [Note]; let training: [String]; let rest: [String]; let slots: [String]
        let unilateral: String; let epley: String; let watch: String
    }

    @Test("the standing strings match")
    func notesMatch() throws {
        let e = try #require(try GoldenFixture<Empty, NotesOut>.load("report-notes").cases.first).expected
        for n in e.notes { #expect(WeeklyExport.priorReportNote(n.label) == n.note, "priorReportNote — \(n.label ?? "nil")") }
        #expect(WeeklyExport.fatigueLabels(isTrainingDay: true) == e.training)
        #expect(WeeklyExport.fatigueLabels(isTrainingDay: false) == e.rest)
        #expect(WeeklyExport.fatigueSlotLabels == e.slots)
        #expect(WeeklyExport.unilateralVolumeNote == e.unilateral)
        #expect(WeeklyExport.epleyNote == e.epley)
        #expect(WeeklyExport.appleWatchDisclaimer == e.watch)
    }
}
