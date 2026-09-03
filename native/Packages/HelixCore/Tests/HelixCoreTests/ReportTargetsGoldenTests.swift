import Foundation
import Testing
@testable import HelixCore

/// `parseTargets` and the matcher, against the TypeScript's own answers.
///
/// This is the half of the FMT v2 reader that crosses into Swift: the renderer
/// stays in a `WKWebView`, but the PRESCRIPTION a report carries feeds the
/// logger. A misread load ladder does not look broken — it puts a plausible
/// wrong number on the card you are about to lift against.
@Suite("Report targets — the prescription the logger reads")
struct ReportTargetsGoldenTests {

    struct TargetsIn: Decodable {
        let name: String
        let lines: [String]
        let lookup: String?
    }

    struct TargetsOut: Decodable {
        let targets: ReportTargets
        let has: Bool
        let matched: TargetExercise?
        let formatted: String?
    }

    @Test("every case matches the TypeScript, field for field")
    func matchesTypeScript() throws {
        let fixture = try GoldenFixture<TargetsIn, TargetsOut>.load("report-targets")
        #expect(fixture.cases.count >= 26)

        for testCase in fixture.cases {
            let parsed = ReportReader.parseTargets(testCase.input.lines)
            let expected = testCase.expected

            #expect(
                parsed.exercises == expected.targets.exercises,
                "\(testCase.name) — exercises: \(parsed.exercises) vs \(expected.targets.exercises)"
            )
            #expect(parsed.water == expected.targets.water, "\(testCase.name) — water")
            #expect(parsed.steps == expected.targets.steps, "\(testCase.name) — steps")
            #expect(parsed.macros == expected.targets.macros, "\(testCase.name) — macros")
            #expect(parsed.notes == expected.targets.notes, "\(testCase.name) — notes")
            // `hasTargets` in the TypeScript, and it has to agree: it is the
            // gate the dashboard uses to decide whether to show anything at all.
            #expect(!parsed.isEmpty == expected.has, "\(testCase.name) — hasTargets")

            let matched = ReportReader.target(for: testCase.input.lookup, in: parsed)
            #expect(matched == expected.matched, "\(testCase.name) — matched")
            #expect(
                matched.flatMap(ReportReader.format) == expected.formatted,
                "\(testCase.name) — formatted"
            )
        }
    }

    // MARK: - The rules the vectors encode, said out loud

    /// ── A KNOWN FALSE POSITIVE, PORTED ON PURPOSE ───────────────────────────
    /// `fmtV2.ts` says the separator requirement is what "stops 'Volume dropped
    /// to 24 kg per set on Tuesday' being read as a prescription for an exercise
    /// called Volume dropped to". It does not: `\b`to`\b` is itself one of the
    /// accepted separators, so that sentence parses as an exercise named
    /// "Volume dropped" at 24 kg. The comment describes an intent the regex
    /// never implemented.
    ///
    /// This asserts the BEHAVIOUR, because the behaviour is what ships on the
    /// web today and the logger has to agree with it. Tightening the regex is a
    /// change to both implementations and to the vectors, and it belongs in the
    /// wave that owns the logger card — not smuggled in behind a port.
    @Test("prose with a load and the word \"to\" still parses — the TS does too")
    func proseFalsePositiveIsPreserved() {
        let targets = ReportReader.parseTargets([
            "Volume dropped to 24 kg per set on Tuesday and it showed in the last two sets.",
        ])
        #expect(targets.exercises.count == 1)
        #expect(targets.exercises.first?.name == "Volume dropped")
        #expect(targets.exercises.first?.loadKg == 24)
    }

    @Test("a load line with no separator at all is not a prescription")
    func noSeparatorIsNotAPrescription() {
        // This is what the requirement genuinely rules out.
        #expect(ReportReader.parseTargets(["Squatted 100 kg today and felt strong"]).exercises.isEmpty)
    }

    @Test("the matcher never merges two catalogue rows that were split on purpose")
    func theGripSplitSurvives() {
        let targets = ReportReader.parseTargets([
            "Seated Cable Row (Wide Grip) → 49.5 kg × 10-12",
        ])
        #expect(ReportReader.target(for: "Seated Cable Row (Wide Grip)", in: targets) != nil)
        // Two rows by grip, deliberately. A fuzzy matcher would re-merge them
        // in the one place nobody looks.
        #expect(ReportReader.target(for: "Seated Cable Row (V-Grip)", in: targets) == nil)
    }

    @Test("an absent field is nil, never zero")
    func nilIsNotZero() {
        let targets = ReportReader.parseTargets(["Pec Deck: 45 kg"])
        #expect(targets.steps == nil)
        #expect(targets.water == nil)
        #expect(targets.macros == nil)
        #expect(targets.exercises.first?.repsLow == nil)
    }

    @Test("a blank document is empty rather than an error")
    func emptyDocument() {
        #expect(ReportReader.parseTargets([]).isEmpty)
        #expect(ReportReader.parseTargets(["", "   "]).isEmpty)
    }

    @Test("isFmtV2 reads the body, not a column")
    func versionDetection() {
        #expect(ReportReader.isFmtV2("… · CUT · FMT v2 …"))
        #expect(ReportReader.isFmtV2("fmt2"))
        #expect(!ReportReader.isFmtV2("FMT v1"))
        #expect(!ReportReader.isFmtV2(nil))
        #expect(!ReportReader.isFmtV2(""))
    }
}
