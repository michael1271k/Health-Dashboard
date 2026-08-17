import SwiftUI

// MARK: - The atlas, drawn
//
// `HelixAtlas.swift` is GENERATED from `src/lib/body/atlas.ts` and holds only
// geometry. This is the view that draws it, and it is hand-written because how
// a body is TINTED is a design decision, not a translation of an SVG.
//
// ── ONE FIGURE, TWO PRODUCTS ─────────────────────────────────────────────────
// The app draws the same paths in SVG. Keeping the geometry generated and the
// styling separate is what lets the widget make its own choices — a 40pt figure
// on a Home Screen cannot use the app's 1.1pt strokes and survive — without the
// two anatomies ever diverging.

struct HelixAtlasFigure: View {
  /// Which side of the body. `both` draws them side by side, sharing a scale.
  enum Side { case front, back, both }

  var side: Side = .front
  /// Muscle name → 0…1. Names are the atlas's own (`"Side delts"`, `"Abs/core"`).
  var worked: [String: Double] = [:]
  var color: Color = Helix.ember
  var monochrome = false

  var body: some View {
    switch side {
    case .both:
      HStack(spacing: 2) {
        figure(.front)
        figure(.back)
      }
    case .front: figure(.front)
    case .back: figure(.back)
    }
  }

  private func figure(_ view: HelixAtlasView) -> some View {
    Canvas { context, size in
      let rect = CGRect(origin: .zero, size: size)

      // Head, neck and feet first, and never tinted: they carry no data, and a
      // glowing head would read as a muscle nobody can train.
      for build in HelixAtlas.base {
        var path = Path()
        build(rect, &path)
        context.fill(path, with: .color(.white.opacity(0.06)))
        context.stroke(path, with: .color(.white.opacity(0.10)), lineWidth: 0.5)
      }

      for entry in HelixAtlas.muscles where entry.view == view {
        var path = Path()
        entry.build(rect, &path)
        let intensity = min(max(worked[entry.muscle] ?? 0, 0), 1)
        if intensity > 0 {
          // Alpha, not a colour ramp. One hue at several strengths says "more
          // of the same"; a green-to-red ramp would read as a verdict, and this
          // figure passes no verdicts.
          let tint = monochrome ? Color.white : color
          context.fill(path, with: .color(tint.opacity(0.18 + intensity * 0.55)))
          context.stroke(path, with: .color(tint.opacity(0.9)), lineWidth: 0.6)
        } else {
          context.fill(path, with: .color(.white.opacity(0.05)))
          context.stroke(path, with: .color(.white.opacity(0.12)), lineWidth: 0.4)
        }
      }
    }
    .accessibilityHidden(true)
  }
}

extension HelixAtlasFigure {
  /// Every muscle at one intensity — a WHOLE-BODY reading, drawn on a body.
  ///
  /// The scale reports composition for the body, not per muscle, and there is
  /// no way to derive one from the other. So a composition figure fills evenly:
  /// it says "this much of you is lean tissue", which is exactly what the
  /// reading means. Tinting individual bellies from a single percentage would
  /// invent a distribution nobody measured.
  static func uniform(_ intensity: Double) -> [String: Double] {
    var out: [String: Double] = [:]
    for entry in HelixAtlas.muscles { out[entry.muscle] = intensity }
    return out
  }
}
