import Testing
import SwiftUI
import OnyxCore
import OnyxUI
@testable import Onyx

/// The DOMS body is only an interface if a tap lands on the muscle the eye was
/// pointing at, and there is no screenshot that can prove that — an atlas with
/// the hit test off by a limb photographs identically to one that is right.
@Suite("Atlas hit testing")
struct OnyxAtlasHitTests {
    /// The rect the figure is drawn into, on the atlas's own 120 × 260 viewBox
    /// scaled ×2 — the same shape a 96 pt tile hands the path builders.
    private let rect = CGRect(x: 0, y: 0, width: 240, height: 520)

    /// A point in viewBox coordinates, converted the way the drawing converts
    /// it. Every expectation below is therefore written in the coordinates the
    /// generator emits, not in pixels of a particular frame.
    private func at(_ x: CGFloat, _ y: CGFloat) -> CGPoint { OnyxAtlas.pt(x, y, in: rect) }

    @Test("the sixteen landmarks are all reachable, on the side that draws them")
    func everyLandmarkIsDrawn() {
        let front = OnyxAtlas.landmarks(on: .front)
        let back = OnyxAtlas.landmarks(on: .back)
        // Every path in the generated file names a muscle the domain knows; a
        // rename on either side of the generator shows up here as a hole.
        #expect(OnyxAtlas.muscles.allSatisfy { LandmarkMuscle(rawValue: $0.muscle) != nil })
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
        #expect(OnyxAtlas.muscle(at: at(48, 66), in: rect, side: .front) == .chest)
        #expect(OnyxAtlas.muscle(at: at(47, 175), in: rect, side: .front) == .quads)
        #expect(OnyxAtlas.muscle(at: at(50, 205), in: rect, side: .front) == .calves)
        // The same two points on the back are a different body.
        #expect(OnyxAtlas.muscle(at: at(47, 175), in: rect, side: .back) == .hamstrings)
        #expect(OnyxAtlas.muscle(at: at(48, 90), in: rect, side: .back) == .lats)

        // The head carries no trainable muscle, and neither does the margin
        // the aspect-fit letter-boxes away.
        #expect(OnyxAtlas.muscle(at: at(60, 24), in: rect, side: .front) == nil)
        #expect(OnyxAtlas.muscle(at: CGPoint(x: 2, y: 2), in: rect, side: .front) == nil)
    }

    /// The gate table (§9, Wave 2.7): every landmark × both sides.
    ///
    /// For a landmark the side DRAWS, at least one point inside one of its
    /// paths must answer with that landmark — no muscle is fully buried under
    /// another — and EVERY sampled point inside the figure must answer with
    /// the LAST path covering it, which is what the eye sees. For a landmark
    /// the side does not draw, no sampled point on that side may answer with
    /// it. Points are sampled on a grid over each path's bounds, filtered by
    /// the path itself, so the probes are the drawing's own and never a
    /// hand-tuned coordinate that goes stale when the atlas is regenerated.
    @Test("the 16 × 2 table: every landmark, both sides", arguments: LandmarkMuscle.allCases, [OnyxAtlasView.front, .back])
    func table(_ muscle: LandmarkMuscle, _ side: OnyxAtlasView) {
        let entries = OnyxAtlas.muscles.filter { $0.view == side }
        let paths: [(muscle: String, path: Path)] = entries.map {
            var path = Path()
            $0.build(rect, &path)
            return ($0.muscle, path)
        }
        /// The last painted path covering `point`, by a forward scan — a
        /// regression guard on the reversed walk, over the same `contains`.
        func painted(_ point: CGPoint) -> String? {
            paths.last { $0.path.contains(point) }?.muscle
        }
        func probes(_ path: Path) -> [CGPoint] {
            let box = path.boundingRect
            var out: [CGPoint] = []
            for i in 0..<8 { for j in 0..<8 {
                let point = CGPoint(x: box.minX + box.width * (CGFloat(i) + 0.5) / 8, y: box.minY + box.height * (CGFloat(j) + 0.5) / 8)
                if path.contains(point) { out.append(point) }
            } }
            return out
        }

        let own = paths.filter { $0.muscle == muscle.rawValue }
        if own.isEmpty {
            #expect(!OnyxAtlas.landmarks(on: side).contains(muscle), "\(muscle) is not drawn on the \(side.rawValue)")
            return
        }

        // Reachability is asserted over the UNION of a landmark's paths: a
        // thin diagonal sliver can miss every cell centre of its own box and
        // still be reachable through its sibling.
        var reachable = false
        var probed = 0
        for p in own {
            for point in probes(p.path) {
                probed += 1
                let answer = OnyxAtlas.muscle(at: point, in: rect, side: side)
                #expect(answer?.rawValue == painted(point), "\(muscle) \(side.rawValue) at \(point): hit \(String(describing: answer)), painted \(String(describing: painted(point)))")
                if answer == muscle { reachable = true }
            }
        }
        #expect(probed > 0, "\(muscle) \(side.rawValue): no path has an interior")
        #expect(reachable, "\(muscle) is drawn on the \(side.rawValue) but no point of it survives the z-order")
    }

    @Test("overlapping paths answer with the one drawn on top")
    func zOrder() {
        // Delts are emitted before the chest sweep and after it in places; what
        // matters is that the answer matches the LAST fill, which is what the
        // eye sees. A forward search returned the chest for a point the figure
        // draws as a shoulder.
        let shoulder = at(36, 56)
        func covers(_ entry: OnyxAtlasPath) -> Bool {
            var path = Path()
            entry.build(rect, &path)
            return path.contains(shoulder)
        }
        let painted = OnyxAtlas.muscles.last { $0.view == .front && covers($0) }
        #expect(OnyxAtlas.muscle(at: shoulder, in: rect, side: .front)?.rawValue == painted?.muscle)
    }
}


/// The two colour ramps Wave 2.9 added. They live in the app's test target
/// rather than `OnyxUITests` because that package cannot build for macOS
/// (UIKit, `MeshGradient`) and its suite therefore never runs.
@Suite("Subjective ramps")
struct SubjectiveRampTests {
    @Test("soreness and fatigue share one three-step ramp, and silence is not green")
    func ramps() {
        // §3.2: none tertiary · mild Good · moderate Record · severe Danger.
        #expect(Color.onyx.severity(0) == Color.onyx.textTertiary)
        #expect(Color.onyx.severity(1) == Color.onyx.good)
        #expect(Color.onyx.severity(2) == Color.onyx.record)
        #expect(Color.onyx.severity(3) == Color.onyx.danger)
        // A slot nobody has rated is NOT "Fresh" — the commonest way a recovery
        // screen lies is by drawing an absent reading as a good one.
        #expect(Color.onyx.fatigue(nil) == Color.onyx.textTertiary)
        #expect(Color.onyx.fatigue(1) == Color.onyx.good)
        #expect(Color.onyx.fatigue(5) == Color.onyx.danger)
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
