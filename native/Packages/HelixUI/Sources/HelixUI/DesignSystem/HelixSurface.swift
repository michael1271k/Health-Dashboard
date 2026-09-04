import SwiftUI

/// The card chrome, and the one progress bar the whole app draws.
///
/// Both are ported from `src/components/nutrition/MacroCards.tsx` and the card
/// classes repeated across every panel in `src/components`.

// MARK: - Card

/// Tailwind's corner scale, in points. `rounded-md` … `rounded-2xl`.
public enum HelixRadius {
    public static let md: CGFloat  = 6
    public static let lg: CGFloat  = 8
    public static let xl: CGFloat  = 12
    public static let xxl: CGFloat = 16
}

private struct HelixCardModifier: ViewModifier {
    let radius: CGFloat
    let fill: Color
    let border: Color

    func body(content: Content) -> some View {
        content
            .background(
                // `.continuous` rather than `.circular`. This is the one place
                // the translation deliberately does not match the CSS: Tailwind's
                // `rounded-2xl` is a circular arc, and every card on iOS —
                // including the ones this app sits next to in the App Switcher —
                // is a squircle. Matching the platform is what "native redesign"
                // means, and at 16 pt the difference is a few pixels of shoulder.
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(fill)
            )
            .overlay(
                // `strokeBorder`, not `stroke`: `stroke` centres the line on the
                // path and spills half a point outside the shape, so a hairline
                // card drawn this way is 1 pt wider than its background and the
                // edge reads soft.
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(border, lineWidth: 1)
            )
    }
}

public extension View {
    /// `rounded-2xl border border-white/[0.07] bg-white/[0.03]` — the standard
    /// panel. Apply padding yourself; the two nutrition cards use `px-4 py-3.5`
    /// and the history rows use `px-3 py-2.5`, so it is not baked in here.
    func helixCard(radius: CGFloat = HelixRadius.xxl) -> some View {
        modifier(HelixCardModifier(
            radius: radius, fill: HelixPalette.cardFill, border: HelixPalette.cardBorder
        ))
    }

    /// `rounded-xl border border-white/[0.08] bg-white/[0.04]` — the slightly
    /// stronger pair used wherever the surface is tappable.
    func helixRow(radius: CGFloat = HelixRadius.xl) -> some View {
        modifier(HelixCardModifier(
            radius: radius, fill: HelixPalette.rowFill, border: HelixPalette.rowBorder
        ))
    }
}

// MARK: - Bar

/// One horizontal fill, with the target marked and the overshoot shown.
///
/// ── THE FILL USED TO CLAMP AT THE GOAL ──────────────────────────────────────
/// `min(1, value / goal)` meant 2,100 kcal against a 1,950 goal and 3,400 kcal
/// against the same goal drew the IDENTICAL full bar. The one reading the bar
/// exists to give — how far past you went — was the one it could not draw.
///
/// So the track rescales to `max(value, goal)`: the fill runs to the goal, a
/// tick marks where the goal sits, and the excess continues past it in oxide.
/// The tick is what keeps the bar readable while it rescales — without it, a bar
/// that shortens as you eat more is just confusing.
///
/// The track alpha is `rgba(255,255,255,0.07)` unchanged, so the empty part of
/// the goal reads at exactly the weight it always did.
public struct HelixBar: View {
    public let value: Double?
    public let goal: Double?
    public let color: Color
    public var height: CGFloat = 6

    public init(value: Double?, goal: Double?, color: Color, height: CGFloat = 6) {
        self.value = value
        self.goal = goal
        self.color = color
        self.height = height
    }

    /// `transition: width 0.9s cubic-bezier(0.4,0,0.2,1)`, verbatim.
    ///
    /// A spring would be the house style for anything a finger drives, and this
    /// is not that: nothing here is grabbable, the value changes because a
    /// number arrived from the database, and the web app's curve is a decelerating
    /// ease that already reads correctly for it. Ported rather than reinterpreted.
    private static let fillCurve = Animation.timingCurve(0.4, 0, 0.2, 1, duration: 0.9)

    private var v: Double { value ?? 0 }
    private var g: Double { goal ?? 0 }
    private var scale: Double { max(v, g) }
    private var isOver: Bool { g > 0 && v > g }

    private func fraction(_ n: Double) -> Double {
        scale > 0 ? n / scale : 0
    }

    public var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(HelixPalette.trackFill)

                Capsule()
                    .fill(color)
                    .frame(width: width * fraction(min(v, g > 0 ? g : v)))

                if isOver {
                    // The excess, past the goal. `rounded-r-full` in the web
                    // version — only the trailing end is round, because the
                    // leading end butts against the fill.
                    UnevenRoundedRectangle(
                        topLeadingRadius: 0, bottomLeadingRadius: 0,
                        bottomTrailingRadius: height / 2, topTrailingRadius: height / 2,
                        style: .continuous
                    )
                    .fill(HelixPalette.oxide)
                    .frame(width: width * fraction(v - g))
                    .offset(x: width * fraction(g))

                    // The target tick. Only drawn once there is something past
                    // it to separate — on an under-budget day the end of the
                    // fill IS the answer.
                    Rectangle()
                        .fill(Color.white.opacity(0.55))
                        .frame(width: 1)
                        .offset(x: width * fraction(g))
                }
            }
            .animation(Self.fillCurve, value: v)
            .animation(Self.fillCurve, value: g)
        }
        .frame(height: height)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }
}

#Preview("Bars") {
    VStack(spacing: 20) {
        HelixBar(value: 1200, goal: 1950, color: HelixPalette.Macro.calories)
        HelixBar(value: 1950, goal: 1950, color: HelixPalette.Macro.calories)
        HelixBar(value: 2600, goal: 1950, color: HelixPalette.oxide)
        HelixBar(value: nil, goal: 1950, color: HelixPalette.Macro.calories)
        HelixBar(value: 140, goal: 190, color: HelixPalette.Macro.protein, height: 4)
    }
    .padding()
    .background(HelixPalette.obsidian)
}
