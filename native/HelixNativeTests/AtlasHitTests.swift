import Testing
import SwiftUI
import HelixCore
import HelixUI
@testable import HelixNative

/// The DOMS body is only an interface if a tap lands on the muscle the eye was
/// pointing at, and there is no screenshot that can prove that — an atlas with
/// the hit test off by a limb photographs identically to one that is right.
@Suite("Atlas hit testing")
struct HelixAtlasHitTests {
    /// The rect the figure is drawn into, on the atlas's own 120 × 260 viewBox
    /// scaled ×2 — the same shape a 96 pt tile hands the path builders.
    private let rect = CGRect(x: 0, y: 0, width: 240, height: 520)

    /// A point in viewBox coordinates, converted the way the drawing converts
    /// it. Every expectation below is therefore written in the coordinates the
    /// generator emits, not in pixels of a particular frame.
    private func at(_ x: CGFloat, _ y: CGFloat) -> CGPoint { HelixAtlas.pt(x, y, in: rect) }

    @Test("the sixteen landmarks are all reachable, on the side that draws them")
    func everyLandmarkIsDrawn() {
        let front = HelixAtlas.landmarks(on: .front)
        let back = HelixAtlas.landmarks(on: .back)
        // Every path in the generated file names a muscle the domain knows; a
        // rename on either side of the generator shows up here as a hole.
        #expect(HelixAtlas.muscles.allSatisfy { LandmarkMuscle(rawValue: $0.muscle) != nil })
        #expect(Set(front + back).count == LandmarkMuscle.allCases.count)
        // Adductors are front-only and hamstrings back-only: the figure is two
        // views of one body, not the same list twice.
        #expect(front.contains(.adductors) && !back.contains(.adductors))
        #expect(back.contains(.hamstrings) && !front.contains(.hamstrings))
        #expect(front.contains(.chest) && !front.contains(.lats))
    }

    @Test("a tap lands on the muscle under it, and on nothing off the body")
    func hits() {
        // Points read off the generated file's own coordinates: chest at
        // sternum height, quads and hamstrings mid-thigh, lats mid-back.
        #expect(HelixAtlas.muscle(at: at(48, 66), in: rect, side: .front) == .chest)
        #expect(HelixAtlas.muscle(at: at(47, 175), in: rect, side: .front) == .quads)
        #expect(HelixAtlas.muscle(at: at(50, 205), in: rect, side: .front) == .calves)
        // The same two points on the back are a different body.
        #expect(HelixAtlas.muscle(at: at(47, 175), in: rect, side: .back) == .hamstrings)
        #expect(HelixAtlas.muscle(at: at(48, 90), in: rect, side: .back) == .lats)

        // The head carries no trainable muscle, and neither does the margin
        // the aspect-fit letter-boxes away.
        #expect(HelixAtlas.muscle(at: at(60, 24), in: rect, side: .front) == nil)
        #expect(HelixAtlas.muscle(at: CGPoint(x: 2, y: 2), in: rect, side: .front) == nil)
    }

    @Test("overlapping paths answer with the one drawn on top")
    func zOrder() {
        // Delts are emitted before the chest sweep and after it in places; what
        // matters is that the answer matches the LAST fill, which is what the
        // eye sees. A forward search returned the chest for a point the figure
        // draws as a shoulder.
        let shoulder = at(36, 56)
        func covers(_ entry: HelixAtlasPath) -> Bool {
            var path = Path()
            entry.build(rect, &path)
            return path.contains(shoulder)
        }
        let painted = HelixAtlas.muscles.last { $0.view == .front && covers($0) }
        #expect(HelixAtlas.muscle(at: shoulder, in: rect, side: .front)?.rawValue == painted?.muscle)
    }
}


/// The two colour ramps Wave 2.9 added. They live in the app's test target
/// rather than `HelixUITests` because that package cannot build for macOS
/// (UIKit, `MeshGradient`) and its suite therefore never runs.
@Suite("Subjective ramps")
struct SubjectiveRampTests {
    @Test("soreness and fatigue share one three-step ramp, and silence is not green")
    func ramps() {
        // §3.2: none tertiary · mild Good · moderate Record · severe Danger.
        #expect(Color.helix.severity(0) == Color.helix.textTertiary)
        #expect(Color.helix.severity(1) == Color.helix.good)
        #expect(Color.helix.severity(2) == Color.helix.record)
        #expect(Color.helix.severity(3) == Color.helix.danger)
        // A slot nobody has rated is NOT "Fresh" — the commonest way a recovery
        // screen lies is by drawing an absent reading as a good one.
        #expect(Color.helix.fatigue(nil) == Color.helix.textTertiary)
        #expect(Color.helix.fatigue(1) == Color.helix.good)
        #expect(Color.helix.fatigue(5) == Color.helix.danger)
    }

    @Test("every DOMS group maps back from every landmark it draws")
    func domsGroups() {
        for (group, landmarks) in DomsMap.landmarks {
            for landmark in landmarks {
                #expect(DomsMap.group(of: landmark) == group)
            }
        }
        // The nine rated groups cover every landmark the atlas can be tapped
        // on, minus the two nothing rates (adductors are not a DOMS group).
        let mapped = Set(DomsMap.landmarks.values.flatMap { $0 })
        #expect(mapped.isSubset(of: Set(LandmarkMuscle.allCases)))
        #expect(DomsMap.group(of: .quads) == "Quads")
    }
}
