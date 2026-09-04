import SwiftUI
import HelixUI
import HelixCore

/// The body, tinted by where the session landed.
///
/// `HelixAtlas.swift` beside this file is GENERATED from `src/lib/body/atlas.ts`
/// and holds only geometry; `atlas-parity.test.ts` re-runs the generator and
/// fails when either Swift copy differs, so the web app, the widget and this
/// screen can never disagree about where a muscle is.
///
/// How a body is TINTED is a design decision rather than a translation, so the
/// drawing is hand-written — and it is written differently here than in the
/// widget. A 40 pt figure on a Home Screen has to fill in one hue at several
/// alphas to stay readable; a 160 pt figure in a sheet can afford the full
/// three-channel language (family hue · ramp step · alpha) and is a worse
/// figure without it.
struct AtlasFigure: View {

    enum Side { case front, back, both }

    var side: Side = .both
    /// Landmark → 0…1. `MuscleCredit.worked(from:)` produces exactly this.
    var worked: [LandmarkMuscle: Double] = [:]
    /// Draw every muscle in the day's accent instead of its own family hue.
    /// Used at thumbnail size, where sixteen hues turn to mud.
    var monochromeTint: Color?

    var body: some View {
        switch side {
        case .both:
            HStack(spacing: 10) {
                figure(.front)
                figure(.back)
            }
        case .front: figure(.front)
        case .back:  figure(.back)
        }
    }

    /// Muscle name → colour, resolved once per draw rather than per path.
    ///
    /// `HelixAtlas` keys on the muscle's display STRING, because it is generated
    /// from TypeScript and knows nothing about a Swift enum. This is the join,
    /// and `LandmarkMuscle.rawValue` carrying the display spelling is what makes
    /// it a lookup rather than a translation table.
    private var tints: [String: (Color, Double)] {
        var out: [String: (Color, Double)] = [:]
        for (muscle, intensity) in worked {
            out[muscle.rawValue] = (monochromeTint ?? HelixPalette.muscle(muscle), intensity)
        }
        return out
    }

    private func figure(_ view: HelixAtlasView) -> some View {
        let resolved = tints
        return Canvas { context, size in
            let rect = CGRect(origin: .zero, size: size)

            // The silhouette first, and never tinted: it carries no data, and a
            // glowing head would read as a muscle nobody can train.
            for build in HelixAtlas.base {
                var path = Path()
                build(rect, &path)
                context.fill(path, with: .linearGradient(
                    Gradient(colors: [.white.opacity(0.10), .white.opacity(0.035)]),
                    startPoint: CGPoint(x: rect.minX, y: rect.minY),
                    endPoint: CGPoint(x: rect.maxX, y: rect.maxY)
                ))
                context.stroke(path, with: .color(.white.opacity(0.10)), lineWidth: 0.5)
            }

            for entry in HelixAtlas.muscles where entry.view == view {
                var path = Path()
                entry.build(rect, &path)
                if let (tint, intensity) = resolved[entry.muscle], intensity > 0 {
                    // Alpha carries the amount. A hue RAMP would read as a
                    // verdict — green good, red bad — and this figure passes no
                    // verdicts; it reports where work landed.
                    let strength = min(max(intensity, 0), 1)
                    context.fill(path, with: .linearGradient(
                        Gradient(colors: [
                            tint.opacity(0.30 + strength * 0.60),
                            tint.opacity(0.16 + strength * 0.44),
                        ]),
                        startPoint: CGPoint(x: rect.midX, y: rect.minY),
                        endPoint: CGPoint(x: rect.midX, y: rect.maxY)
                    ))
                    context.stroke(path, with: .color(tint.opacity(0.95)), lineWidth: 0.7)
                } else {
                    context.fill(path, with: .color(.white.opacity(0.055)))
                    context.stroke(path, with: .color(.white.opacity(0.10)), lineWidth: 0.4)
                }
            }

            // Definition last, over everything, and STROKED ONLY — several of
            // these are OPEN paths (a brow, the linea alba), and SwiftUI closes
            // an open path when it fills one, so a filled brow becomes a wedge
            // across the forehead.
            for entry in HelixAtlas.detail where entry.view == view {
                var path = Path()
                entry.build(rect, &path)
                context.stroke(path, with: .color(.white.opacity(0.18)), lineWidth: 0.35)
            }
        }
        .aspectRatio(HelixAtlas.viewBox.width / HelixAtlas.viewBox.height, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

#if DEBUG
#Preview("Atlas — Upper B") {
    let day = Program.helix5.day(key: "cb_b")!
    let sets = MuscleCredit.weightedSets(
        day.exercises(for: .cut).map { .init(physicalSets: $0.sets(for: .cut), movers: $0.movers) }
    )
    return AtlasFigure(worked: MuscleCredit.worked(from: sets))
        .frame(height: 260)
        .padding()
        .background(HelixPalette.obsidian)
}
#endif
