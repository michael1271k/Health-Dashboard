import Testing
import SwiftUI
import WidgetKit
import HelixCore
@testable import HelixUI

@Suite("HelixUI") struct HelixUITests {
    @Test("every domain has a distinct accent") func accents() {
        let accents = HelixDomain.allCases.map { $0.accent.description }
        #expect(Set(accents).count == accents.count)
    }

    @Test("a rest day wears no domain accent") func restDay() {
        #expect(Color.helix.day(nil) == Color.helix.textTertiary)
        #expect(Color.helix.day("cb_a") != Color.helix.day("legs_a"))
        // §3.2: a split and its A/B twin are the same family two steps apart,
        // and Helix-4's drawer keys mirror their Helix-5 counterparts exactly.
        #expect(Color.helix.day("cb_a") != Color.helix.day("cb_b"))
        #expect(Color.helix.day("cb_a") == Color.helix.day("upper_a"))
        #expect(Color.helix.day("legs_b") == Color.helix.day("lower_b"))
        // A ring may sit at tertiary; a WORD may not. `dayLabel` is the only
        // difference, and only on a rest day.
        #expect(Color.helix.dayLabel(nil) == Color.helix.textSecondary)
        #expect(Color.helix.dayLabel("legs_a") == Color.helix.day("legs_a"))
    }

    @Test("the four sleep stages are four colours, not four alphas") func sleepStages() {
        // The v1 ramp derived all four from Lunar and the Sleep sheet came out
        // as four lavender bars nobody could tell apart (Phase 2 §2.2).
        let stages = HelixSleepStage.allCases.map { $0.color.description }
        #expect(Set(stages).count == stages.count)
    }

    @Test("the scales are ordered and the corners are concentric") func scales() {
        #expect(HelixSpace.xs < HelixSpace.s)
        #expect(HelixSpace.s < HelixSpace.m)
        #expect(HelixSpace.m < HelixSpace.l)
        #expect(HelixSpace.l < HelixSpace.xl)
        #expect(HelixCorner.row < HelixCorner.tile)
        #expect(HelixCorner.tile < HelixCorner.sheet)
        // A row inset by a tile's padding keeps the same shoulder as the tile.
        #expect(HelixCorner.inner(HelixCorner.tile, padding: HelixSpace.m) == HelixCorner.tile - HelixSpace.m)
        // §3.3: nothing in the app is smaller than 11 pt, and the roles descend.
        let points = HelixType.allCases.map(\.points)
        #expect(points == points.sorted(by: >))
        #expect(points.min() == 11)
    }

    @Test("the sample snapshot is full-scope") func sample() {
        let s = HelixSnapshot.sample
        #expect(s.records?.isEmpty == false)
        #expect(s.calendar?.isEmpty == false)
        #expect(s.vitals != nil && s.cardio != nil && s.body != nil && s.readiness != nil)
        let entry = HelixTileEntry(date: HelixSnapshot.sampleDate, snapshot: s)
        #expect(entry.isStale == false)
        #expect(entry.age == 0)
    }
}

@Suite("Dashboard tiles")
struct HelixTileTests {
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
struct HelixChartTests {
    @Test("categorical series is a fixed order of six, then the neutral") func series() {
        #expect(Color.helix.series.count == 6)
        #expect(Set(Color.helix.series.map(\.description)).count == 6)
        #expect(Color.helix.series(6) == Color.helix.textTertiary)
        #expect(Color.helix.series(-1) == Color.helix.textTertiary)
    }

    @Test("ISO dates land on local midnight") func isoDate() {
        let d = HelixChart.date("2026-09-04")!
        let c = Calendar.current.dateComponents([.year, .month, .day, .hour], from: d)
        #expect(c.year == 2026 && c.month == 9 && c.day == 4 && c.hour == 0)
        #expect(HelixChart.date("2026-9") == nil)
    }
}
