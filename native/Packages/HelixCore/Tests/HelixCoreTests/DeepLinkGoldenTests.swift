import Foundation
import Testing
@testable import HelixCore

/// `DeepLink.safePath` and the tab mapping, against the TypeScript's answers.
///
/// A `helix://` URL is untrusted input — anything on the device can open one —
/// so these are security vectors, not formatting ones. The allow-list is
/// pinned case for case so the Swift port cannot quietly widen it.
@Suite("Deep links — the allow-list and where each path lands")
struct DeepLinkGoldenTests {

    struct In: Decodable { let raw: String? }
    struct Dest: Decodable { let kind: String; let date: String? }
    struct Out: Decodable { let path: String?; let destination: Dest? }

    @Test("every case matches the TypeScript")
    func matchesTypeScript() throws {
        let fixture = try GoldenFixture<In, Out>.load("deep-link")
        #expect(fixture.cases.count >= 20)

        for testCase in fixture.cases {
            let path = DeepLink.safePath(testCase.input.raw)
            #expect(path == testCase.expected.path, "\(testCase.name) — path")

            let destination = path.flatMap(DeepLink.destination(forPath:))
            let expected = testCase.expected.destination.map(Self.decode)
            #expect(destination == expected, "\(testCase.name) — destination")
        }
    }

    @Test("url(path:) round-trips through safePath")
    func urlRoundTrips() {
        for path in ["/", "/nutrition/micros", "/day/2026-09-03?section=sleep"] {
            #expect(DeepLink.safePath(DeepLink.url(path: path)?.absoluteString) == path)
        }
    }

    private static func decode(_ dest: Dest) -> DeepLink.Destination {
        switch dest.kind {
        case "today": return .today
        case "train": return .train
        case "fuel": return .fuel
        case "body": return .body(date: dest.date)
        case "you": return .you
        case "reports": return .reports
        default: fatalError("unknown destination kind \(dest.kind)")
        }
    }
}
