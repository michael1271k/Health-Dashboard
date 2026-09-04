import Testing
import SwiftUI
@testable import HelixUI

@Suite("HelixUI") struct HelixUITests {
    @Test("every domain has a distinct accent") func accents() {
        let accents = HelixDomain.allCases.map { $0.accent.description }
        #expect(Set(accents).count == accents.count)
    }

    @Test("a rest day wears no domain accent") func restDay() {
        #expect(Color.helix.day(nil) == Color.helix.textSecondary)
        #expect(Color.helix.day("cb_a") != Color.helix.day("legs_a"))
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
