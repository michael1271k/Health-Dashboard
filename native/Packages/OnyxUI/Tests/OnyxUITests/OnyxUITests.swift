import Testing
import SwiftUI
import WidgetKit
import OnyxCore
@testable import OnyxUI

@Suite("OnyxUI") struct OnyxUITests {
    @Test("every domain has a distinct accent") func accents() {
        let accents = OnyxDomain.allCases.map { $0.accent.description }
        #expect(Set(accents).count == accents.count)
    }

    @Test("a rest day wears no domain accent") func restDay() {
        #expect(Color.onyx.day(nil) == Color.onyx.textTertiary)
        #expect(Color.onyx.day("cb_a") != Color.onyx.day("legs_a"))
        // §3.2: a split and its A/B twin are the same family two steps apart,
        // and Onyx-4's drawer keys mirror their Onyx-5 counterparts exactly.
        #expect(Color.onyx.day("cb_a") != Color.onyx.day("cb_b"))
        #expect(Color.onyx.day("cb_a") == Color.onyx.day("upper_a"))
        #expect(Color.onyx.day("legs_b") == Color.onyx.day("lower_b"))
        // A ring may sit at tertiary; a WORD may not. `dayLabel` is the only
        // difference, and only on a rest day.
        #expect(Color.onyx.dayLabel(nil) == Color.onyx.textSecondary)
        #expect(Color.onyx.dayLabel("legs_a") == Color.onyx.day("legs_a"))
    }

    @Test("the four sleep stages are four colours, not four alphas") func sleepStages() {
        // The v1 ramp derived all four from Lunar and the Sleep sheet came out
        // as four lavender bars nobody could tell apart (Phase 2 §2.2).
        let stages = OnyxSleepStage.allCases.map { $0.color.description }
        #expect(Set(stages).count == stages.count)
    }

    @Test("the scales are ordered and the corners are concentric") func scales() {
        #expect(OnyxSpace.xs < OnyxSpace.s)
        #expect(OnyxSpace.s < OnyxSpace.m)
        #expect(OnyxSpace.m < OnyxSpace.l)
        #expect(OnyxSpace.l < OnyxSpace.xl)
        #expect(OnyxCorner.row < OnyxCorner.tile)
        #expect(OnyxCorner.tile < OnyxCorner.sheet)
        // A row inset by a tile's padding keeps the same shoulder as the tile.
        #expect(OnyxCorner.inner(OnyxCorner.tile, padding: OnyxSpace.m) == OnyxCorner.tile - OnyxSpace.m)
        // §3.3: nothing in the app is smaller than 11 pt, and the roles descend.
        let points = OnyxType.allCases.map(\.points)
        #expect(points == points.sorted(by: >))
        #expect(points.min() == 11)
    }

    @Test("the sample snapshot is full-scope") func sample() {
        let s = OnyxSnapshot.sample
        #expect(s.records?.isEmpty == false)
        #expect(s.calendar?.isEmpty == false)
        #expect(s.vitals != nil && s.cardio != nil && s.body != nil && s.readiness != nil)
        let entry = OnyxTileEntry(date: OnyxSnapshot.sampleDate, snapshot: s)
        #expect(entry.isStale == false)
        #expect(entry.age == 0)
    }
}

@Suite("Dashboard tiles")
struct OnyxTileTests {
    @Test("every catalogue widget has a title, a symbol and a domain; the grid sizes map to the three families")
    func catalogue() {
        for id in Dashboard.widgetIds {
            #expect(!id.title.isEmpty)
            #expect(!id.symbol.isEmpty)
        }
        #expect(WidgetSize.s.family == .systemSmall)
        #expect(WidgetSize.w.family == .systemMedium)
        #expect(WidgetSize.xl.family == .systemLarge)
    }
}

@Suite("Chart kit")
struct OnyxChartTests {
    @Test("categorical series is a fixed order of six, then the neutral") func series() {
        #expect(Color.onyx.series.count == 6)
        #expect(Set(Color.onyx.series.map(\.description)).count == 6)
        #expect(Color.onyx.series(6) == Color.onyx.textTertiary)
        #expect(Color.onyx.series(-1) == Color.onyx.textTertiary)
    }

    @Test("ISO dates land on local midnight") func isoDate() {
        let d = OnyxChart.date("2026-09-04")!
        let c = Calendar.current.dateComponents([.year, .month, .day, .hour], from: d)
        #expect(c.year == 2026 && c.month == 9 && c.day == 4 && c.hour == 0)
        #expect(OnyxChart.date("2026-9") == nil)
    }
}

/// The one piece of arithmetic in the logger's chrome that is not a layout.
///
/// `elapsed` becomes `duration_min`, which multiplies session RPE into training
/// load, which readiness reads over 49 days — so an error here moves
/// `battery_pct` on every day for seven weeks, and it does it quietly. The live
/// database holds a 60-minute session recorded as 385 minutes; this is the
/// arithmetic that has to stop being able to say that.
@Suite("The session clock")
@MainActor
struct LoggerClockTests {

    @Test("elapsed is the wall clock minus what was banked in pauses") func pauses() async throws {
        let clock = LoggerClock(startedAt: Date().addingTimeInterval(-600))
        #expect(!clock.isPaused)
        #expect(abs(clock.elapsed() - 600) < 1)
        // A running clock counts from an origin the system can render; with no
        // pauses yet that origin IS the start.
        #expect(clock.timerOrigin == clock.startedAt)

        clock.pause()
        #expect(clock.isPaused)
        let frozen = clock.elapsed()
        try await Task.sleep(for: .milliseconds(120))
        // Frozen, not stalled: the reading does not move while paused.
        #expect(clock.elapsed() == frozen)

        // Idempotent — the button and the Lock Screen can both send it.
        clock.pause()
        #expect(clock.elapsed() == frozen)

        clock.resume()
        #expect(!clock.isPaused)
        #expect(clock.pausedTotal >= 0.1)
        // The pause came OUT of elapsed, and the origin moved forward by it.
        #expect(abs(clock.elapsed() - frozen) < 0.05)
        #expect(abs(clock.timerOrigin.timeIntervalSince(clock.startedAt) - clock.pausedTotal) < 0.001)
    }

    @Test("editing elapsed moves the start and never the pause ledger") func edits() {
        let clock = LoggerClock(startedAt: Date().addingTimeInterval(-600))
        clock.pause()
        clock.resume()
        let banked = clock.pausedTotal

        clock.setElapsed(45 * 60)
        #expect(abs(clock.elapsed() - 45 * 60) < 0.05)
        #expect(clock.pausedTotal == banked)

        // Negative is clamped rather than refused: a stepper held down at 0:00
        // must not run the clock backwards.
        clock.setElapsed(-60)
        #expect(clock.elapsed() == 0)

        // A start in the future would make `Text(_:style:.timer)` count DOWN.
        clock.setStart(Date().addingTimeInterval(3600))
        #expect(clock.elapsed() < 1)
        #expect(clock.timerOrigin <= Date())
    }

    @Test("correcting the start of a PAUSED session keeps the reading it asked for")
    func startWhilePaused() {
        // The clamp used to anchor on `Date()` while `elapsed` anchored on the
        // pause, so every start inside the open pause — the whole window the
        // sheet's wheel can reach — came back as a confident 0:00.
        let clock = LoggerClock(startedAt: Date().addingTimeInterval(-90 * 60))
        clock.pause()
        let pausedAt = try! #require(clock.pausedAt)

        clock.setStart(pausedAt.addingTimeInterval(-60 * 60))
        #expect(abs(clock.elapsed() - 60 * 60) < 1)

        // Still clamped: a start after the pause began is zero elapsed, not a
        // negative one dressed up by `max(0, …)`.
        clock.setStart(pausedAt.addingTimeInterval(60))
        #expect(clock.elapsed() == 0)
    }
}
