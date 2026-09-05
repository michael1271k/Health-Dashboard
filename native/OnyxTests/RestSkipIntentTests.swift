import Testing
import Foundation
@testable import Onyx

/// The one claim Wave 2.12 makes that neither a screenshot nor a build proves.
///
/// ── WHY THE MAILBOX AND NOT THE BUTTON ──────────────────────────────────────
/// Everything else about this feature is checked by something else already: the
/// build proves the intent compiles into both targets, and the shot loop cannot
/// photograph a Lock Screen at all. What is genuinely fragile is the wiring in
/// between — an intent that resolves its handler to `nil` still returns a
/// perfectly successful `.result()`, so the button that does nothing looks
/// exactly like the button that works. Faking ActivityKit to assert the rest of
/// it would be building a second implementation to test the first.
@MainActor
@Suite("Rest skip intent")
struct RestSkipIntentTests {

    @Test("Performing the intent runs the installed handler")
    func performRunsTheHandler() async throws {
        defer { RestSkip.handler = nil }

        var skipped = false
        RestSkip.handler = { skipped = true }

        _ = try await RestSkipIntent().perform()

        #expect(skipped)
    }
}
