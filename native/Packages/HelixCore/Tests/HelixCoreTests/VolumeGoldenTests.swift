import Foundation
import Testing
@testable import HelixCore

@Suite("Session volume — the ONE rule")
struct VolumeGoldenTests {
    struct Input: Decodable { let sets: [VolumeSet] }

    @Test("matches the TypeScript on every exported session")
    func matchesGoldenVectors() throws {
        let fixture = try GoldenFixture<Input, Double>.load("session-volume")
        #expect(fixture.cases.count > 50)
        for c in fixture.cases {
            expectClose(SessionVolume.sessionVolumeKg(c.input.sets), c.expected, "sessionVolumeKg — \(c.name)")
        }
    }

    @Test("a split set weighs exactly what the same set weighs unsided")
    func splitEqualsUnsided() {
        // 2026-08-18's Single Arm Lateral Raise, logged both ways in one exercise.
        let split = SessionVolume.sessionVolumeKg([
            VolumeSet(weightKg: 3.75, reps: 15, side: "L", pairId: "p1"),
            VolumeSet(weightKg: 3.75, reps: 15, side: "R", pairId: "p1"),
        ])
        #expect(split == SessionVolume.sessionVolumeKg([VolumeSet(weightKg: 3.75, reps: 15)]))
        #expect(split == 56.25)
    }
}
