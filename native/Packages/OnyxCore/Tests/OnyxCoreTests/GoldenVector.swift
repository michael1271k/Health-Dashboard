import Foundation
import Testing

/// The replay harness for the golden vectors exported by the TypeScript
/// implementation (`src/tests/golden-vectors.test.ts`, regenerated with
/// `npm run golden`).
///
/// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
/// The Swift port is not trusted because it looks right. It is trusted because
/// it produces, case for case, the same numbers the shipping TypeScript
/// produces. That is the only check that catches the failure mode this domain
/// actually has: arithmetic that is slightly wrong and renders as a number
/// nobody questions.
///
/// The fixtures are checked into git. They are a specification, and a
/// specification you have to run a build step to read is not one.
struct GoldenFixture<Input: Decodable, Expected: Decodable>: Decodable {
    struct Case: Decodable {
        let name: String
        let input: Input
        let expected: Expected
    }

    let module: String
    let fn: String
    let note: String
    let cases: [Case]

    /// Load `Fixtures/<name>.json` from the test bundle.
    static func load(_ name: String) throws -> GoldenFixture {
        guard let url = Bundle.module.url(
            forResource: name, withExtension: "json", subdirectory: "Fixtures"
        ) else {
            throw GoldenError.missing(name)
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(GoldenFixture.self, from: data)
    }
}

enum GoldenError: Error, CustomStringConvertible {
    case missing(String)

    var description: String {
        switch self {
        case .missing(let name):
            return """
            Fixture "\(name).json" is not in the test bundle. Run `npm run golden` \
            from the repo root to export it from the TypeScript implementation.
            """
        }
    }
}

// MARK: - Comparison

/// Tolerance for a `Double` that both languages computed.
///
/// JavaScript numbers and Swift `Double` are both IEEE-754 binary64, and the
/// same sequence of `+ - * /` and `cos` on the same values agrees bit for bit —
/// so in practice these comparisons are exact. The tolerance exists only so a
/// future refactor that reassociates an expression (mathematically identical,
/// last-bit different) reports as a pass rather than a spurious failure. It is
/// deliberately far too tight to hide a real formula difference: the smallest
/// bug this domain has ever shipped was a percent, not a quadrillionth.
private let relativeTolerance = 1e-12

/// Assert two optional doubles agree, treating nil as a first-class value.
///
/// `nil` vs `0` is the distinction three separate bugs in this codebase turned
/// on — the unloaded-work e1RM, the all-or-nothing TDEE, the absent session RPE
/// — so a nil that should be a number, or a number that should be nil, must
/// fail loudly here rather than compare "close enough".
func expectClose(
    _ actual: Double?,
    _ expected: Double?,
    _ label: @autoclosure () -> String,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    switch (actual, expected) {
    case (nil, nil):
        return
    case (let a?, let e?):
        if a == e { return }
        let scale = Swift.max(Swift.abs(a), Swift.abs(e), 1)
        let diff = Swift.abs(a - e)
        #expect(
            diff <= relativeTolerance * scale,
            "\(label()) — Swift \(a) vs TypeScript \(e) (diff \(diff))",
            sourceLocation: sourceLocation
        )
    case (let a?, nil):
        let message = """
            \(label()) — Swift returned \(a) where TypeScript returned null. \
            A number standing in for "no answer" is the bug this suite exists to catch.
            """
        Issue.record(Comment(rawValue: message), sourceLocation: sourceLocation)
    case (nil, let e?):
        let message = "\(label()) — Swift returned nil where TypeScript returned \(e)."
        Issue.record(Comment(rawValue: message), sourceLocation: sourceLocation)
    }
}

/// Non-optional convenience.
func expectClose(
    _ actual: Double,
    _ expected: Double,
    _ label: @autoclosure () -> String,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    expectClose(Optional(actual), Optional(expected), label(), sourceLocation: sourceLocation)
}
