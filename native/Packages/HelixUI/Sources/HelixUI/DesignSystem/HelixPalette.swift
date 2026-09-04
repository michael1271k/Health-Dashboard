import SwiftUI
import HelixCore

/// HELIX palette — "Obsidian & Ember, Refined".
///
/// A 1:1 port of `src/lib/theme/palette.ts`. Same names, same hex values, in the
/// same order, so the two files can be diffed by eye.
///
/// ── WHY THE HEX VALUES ARE COPIED RATHER THAN DERIVED ───────────────────────
/// Every other generated Swift file in this repo (`HelixAtlas.swift`) exists
/// because the source has structure a generator can parse. A palette is 40 flat
/// constants; a generator for it would be more code than the constants, and the
/// failure it prevents — a hand-transcribed hex — is caught here by `PaletteTests`
/// comparing against the same literals. What matters is that there is exactly one
/// place in the Swift app that knows what "ember" means, and this is it.
///
/// ── AND WHY THEY ARE NOT `Color(.systemOrange)` ─────────────────────────────
/// The app is dark-only (`UIUserInterfaceStyle: Dark` in project.yml), matching
/// the web app, which pins `defaultTheme="dark"` and ships no toggle. A semantic
/// system colour would shift under a light appearance the app never enters, and
/// would not be the same orange. The port is the port.
public enum HelixPalette {

    // ── Base surfaces ────────────────────────────────────────────────────────
    public static let obsidian      = Color(hex: 0x0A0B0D)
    public static let graphite      = Color(hex: 0x121418)
    public static let slateSurface  = Color(hex: 0x1A1D23)
    public static let hairline      = Color(hex: 0x23262B)

    // ── Signature + jewel accents ────────────────────────────────────────────
    /// Evolved ember: warmer and richer than the old flat orange.
    public static let ember         = Color(hex: 0xE0703C)
    public static let emberDeep     = Color(hex: 0xB4522A)
    public static let copper        = Color(hex: 0xC97A45)
    public static let bronze        = Color(hex: 0x9C6B3F)

    public static let sapphire      = Color(hex: 0x3D7AB8)
    public static let sapphireDeep  = Color(hex: 0x2E5C8A)
    public static let emerald       = Color(hex: 0x3E9E7A)
    public static let emeraldDeep   = Color(hex: 0x2F7D63)
    public static let emeraldLight  = Color(hex: 0x5FBF98)

    /// The effort ladder's fourth rung, and nothing else. Not `gold`, which
    /// means a personal record app-wide.
    public static let amber         = Color(hex: 0xE0A03C)
    public static let gold          = Color(hex: 0xD4AF37)
    public static let goldDeep      = Color(hex: 0xA88722)
    public static let amethyst      = Color(hex: 0x8A6FA8)
    public static let plum          = Color(hex: 0x6B4E7D)
    /// Drop sets, and drop sets only — `amethyst` is already spoken for as a
    /// DAY colour, so a drop-set chip in the day's own hue would say nothing.
    public static let dropset       = Color(hex: 0x9A6DD7)
    public static let platinum      = Color(hex: 0xC9CDD6)
    public static let steel         = Color(hex: 0x8E9AAC)
    public static let oxide         = Color(hex: 0xC4514E)
    /// Wine — skeletal muscle.
    public static let garnet        = Color(hex: 0xB4526B)
    /// Bone / mineral.
    public static let bone          = Color(hex: 0xE6EAF0)
    /// The travel/deload tone. A deliberate "away" colour, not a mistake.
    public static let sand          = Color(hex: 0xE6C68C)
    /// The muscle atlas's own blue — brighter and cooler than `sapphire`.
    public static let atlasBlue     = Color(hex: 0x3FA9F5)

    // ── Semantic ─────────────────────────────────────────────────────────────
    public static let text          = Color(hex: 0xECEEF2)
    public static let muted         = Color(hex: 0x79808C)
    public static let dim           = Color(hex: 0x5A6472)
    public static let danger        = oxide

    // ── Surface chrome ───────────────────────────────────────────────────────
    /// `border-white/[0.07]` — the hairline every card in the web app draws.
    public static let cardBorder    = Color.white.opacity(0.07)
    /// `bg-white/[0.03]` — the card fill. Note this is a LIGHTER-ON-DARK wash,
    /// not a solid: cards stack over `obsidian` and each other and must stay
    /// translucent to keep the depth order readable.
    public static let cardFill      = Color.white.opacity(0.03)
    /// `border-white/[0.08]` + `bg-white/[0.04]` — the slightly stronger pair
    /// used for tappable rows (history rows, the two page-footer links).
    public static let rowBorder     = Color.white.opacity(0.08)
    public static let rowFill       = Color.white.opacity(0.04)
    /// `bg-white/[0.07]` — the empty part of any progress track.
    public static let trackFill     = Color.white.opacity(0.07)

    /// Macros — four distinct jewel tones so the fills read instantly apart.
    /// Calories lead with the signature ember; protein is emerald (growth),
    /// carbs sapphire (glycogen/fuel), fat antique gold.
    public enum Macro {
        public static let calories = HelixPalette.ember
        public static let protein  = HelixPalette.emerald
        public static let carbs    = HelixPalette.sapphire
        public static let fat      = HelixPalette.gold
    }

    /// GLOBAL phase colours, independent of the active plan: Cut is always
    /// red/orange, Bulk always green, Maintenance steel.
    public enum Phase {
        public static let cut         = HelixPalette.ember
        public static let maintenance = HelixPalette.steel
        public static let bulk        = HelixPalette.emerald
    }

    /// The sixteen landmark muscles, ported from `MUSCLE` in `palette.ts`.
    ///
    /// ── THREE CHANNELS, NOT ONE ─────────────────────────────────────────────
    /// Hue says the FAMILY (chest ember, back emerald, shoulders amethyst, arms
    /// copper, legs sapphire, core steel); the step within that family's ramp
    /// says WHICH muscle; opacity says HOW MUCH work landed there. A single
    /// day-accent tint — which is what the atlas used to draw — answered the
    /// one question you already knew the answer to (which session am I in) and
    /// said nothing about where the work went.
    ///
    /// A family with one landmark sits on its base hue. A family with several
    /// ramps light → dark, deepest for the biggest muscle, so the ORDER carries
    /// meaning rather than merely separating the cells.
    public static func muscle(_ muscle: LandmarkMuscle) -> Color {
        switch muscle {
        case .chest:      ember
        case .lats:       emerald
        case .upperBack:  Color(hex: 0x5FBF9B)
        case .lowerBack:  emeraldDeep
        case .frontDelts: Color(hex: 0xBFA6D4)
        case .sideDelts:  Color(hex: 0xA085BC)
        case .rearDelts:  Color(hex: 0x6E5589)
        case .biceps:     copper
        case .triceps:    Color(hex: 0xA6602F)
        case .forearms:   Color(hex: 0xDB9A6E)
        case .quads:      Color(hex: 0x5B93CC)
        case .hamstrings: sapphire
        case .glutes:     sapphireDeep
        case .adductors:  Color(hex: 0x7FA9D4)
        case .calves:     Color(hex: 0x24486B)
        case .absCore:    steel
        }
    }
}

extension Color {
    /// `Color(hex: 0xE0703C)`.
    ///
    /// Takes an integer rather than a string on purpose: `Color(hex: "#E0703C")`
    /// has to decide what to do with a typo at runtime, and every such API in
    /// the wild answers "silently return black". An `Int` literal that is not a
    /// colour does not compile.
    public init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >>  8) & 0xFF) / 255,
            blue:  Double( hex        & 0xFF) / 255,
            opacity: opacity
        )
    }
}

extension Color {
    /// The `${EMBER}1a` idiom, ported.
    ///
    /// The web app builds tinted fills by suffixing a hex with an alpha byte —
    /// `` `${color}1f` `` for a chip's background, `55` for its border, `44` for
    /// its glow. Those bytes appear all over the components being translated, so
    /// this takes the SAME byte rather than a re-derived decimal: `0x1f` here is
    /// visibly the `1f` in the TSX, and nobody has to check whether 0.12 was
    /// meant to be 31/255 (it was) or 30/255.
    public func alphaByte(_ byte: UInt8) -> Color {
        opacity(Double(byte) / 255)
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// MARK: - Legacy: the Live Logger's chrome and type
//
// Everything below was `HelixSurface.swift` and `HelixType.swift`'s v1 scale.
// Both were deleted from the design system in Wave 2.0 — `HelixRadius` was a
// SECOND corner scale (6/8/12/16) sitting beside `HelixCorner`, and
// `helixCard`/`helixRow` were a second depth primitive sitting beside
// `helixGlass`. Two scales for one decision is how a design system stops being
// one.
//
// They are here rather than gone because the Live Logger — the last six files
// still on `HelixPalette` — reads them, and re-skinning it is Wave 2.4's diff,
// not a token wave's. Parking them in the file that already has a deletion date
// means 2.4 deletes ONE file and the whole legacy layer goes with it. Nothing
// new may call any of it; the token-discipline test enforces that by pinning
// the legacy list.
// ═════════════════════════════════════════════════════════════════════════════

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

/// The HELIX type scale, ported from the `@theme` block in `src/app/globals.css`.
///
/// ── HOW A `clamp()` BECOMES A NUMBER ────────────────────────────────────────
/// Every web size is `clamp(floor, base + N vw, ceiling)` — one expression that
/// covers a 390 px phone and a 27" monitor. Decision 5 removed the second half
/// of that range: iPhone and Watch only, no iPad, no desktop. So each token is
/// evaluated ONCE, at the 390 px viewport the app actually renders in, and the
/// result is the constant below. `--text-fluid-2xl` is
/// `clamp(1.65rem, 1.30rem + 1.9vw, 2.55rem)`; at 390 px that is
/// `1.30rem + 7.41px` = 28.2 px, which is what `fluid2XL` says.
///
/// ── AND WHY IT STILL SCALES ─────────────────────────────────────────────────
/// A frozen px value would ignore the user's text-size setting, which the web
/// app got for free from `rem`. `@ScaledMetric(relativeTo:)` puts it back: the
/// constant is the size at the default Dynamic Type setting, and it scales from
/// there against a matched system text style. Spacing that surrounds text is in
/// points and does not scale — the cards here are built from `VStack` spacing
/// rather than fixed heights, so they grow with their content.
///
/// ── TRACKING IS SIZE-SPECIFIC, WHICH IS THE WHOLE POINT ─────────────────────
/// Letterforms read further apart as they grow, so display text takes NEGATIVE
/// tracking and small text takes a little positive. One fixed value across a
/// scale is wrong at both ends. Stored in `em` exactly as the CSS declares it,
/// and multiplied by the *scaled* size so it stays proportional under Dynamic
/// Type.
public struct HelixTextStyle: Sendable {
    /// Points at the default Dynamic Type setting.
    public let size: CGFloat
    /// CSS `line-height`, unitless.
    public let lineHeight: CGFloat
    /// CSS `letter-spacing`, in `em`.
    public let trackingEm: CGFloat
    /// The system style this scales against.
    public let relativeTo: Font.TextStyle

    public init(size: CGFloat, lineHeight: CGFloat, trackingEm: CGFloat, relativeTo: Font.TextStyle) {
        self.size = size
        self.lineHeight = lineHeight
        self.trackingEm = trackingEm
        self.relativeTo = relativeTo
    }

    // ── The fluid scale ──────────────────────────────────────────────────────
    public static let fluidXS   = HelixTextStyle(size: 11.6, lineHeight: 1.45, trackingEm:  0.010, relativeTo: .footnote)
    public static let fluidSM   = HelixTextStyle(size: 13.3, lineHeight: 1.45, trackingEm:  0.005, relativeTo: .subheadline)
    /// Body sits at zero tracking.
    public static let fluidBase = HelixTextStyle(size: 15.1, lineHeight: 1.55, trackingEm:  0,     relativeTo: .body)
    public static let fluidLG   = HelixTextStyle(size: 17.5, lineHeight: 1.35, trackingEm: -0.006, relativeTo: .title3)
    public static let fluidXL   = HelixTextStyle(size: 20.7, lineHeight: 1.22, trackingEm: -0.011, relativeTo: .title2)
    public static let fluid2XL  = HelixTextStyle(size: 28.2, lineHeight: 1.12, trackingEm: -0.016, relativeTo: .title)
    public static let fluid3XL  = HelixTextStyle(size: 36.5, lineHeight: 1.04, trackingEm: -0.022, relativeTo: .largeTitle)

    // ── The literal sizes the components spell out ───────────────────────────
    // `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[13px]`, `text-sm`,
    // `text-3xl`. These are Tailwind arbitrary values in the TSX rather than
    // tokens, so they are reproduced as-is instead of being tidied into the
    // scale — tidying them would be a redesign, and this is a translation.
    public static let micro   = HelixTextStyle(size:  9, lineHeight: 1.35, trackingEm: 0, relativeTo: .caption2)
    public static let tiny    = HelixTextStyle(size: 10, lineHeight: 1.35, trackingEm: 0, relativeTo: .caption2)
    public static let small   = HelixTextStyle(size: 11, lineHeight: 1.35, trackingEm: 0, relativeTo: .caption)
    public static let compact = HelixTextStyle(size: 13, lineHeight: 1.35, trackingEm: 0, relativeTo: .footnote)
    public static let base    = HelixTextStyle(size: 14, lineHeight: 1.45, trackingEm: 0, relativeTo: .subheadline)
    public static let display = HelixTextStyle(size: 30, lineHeight: 1.10, trackingEm: 0, relativeTo: .title)

    /// `uppercase tracking-wide` at 10 px — the macro column label.
    public static let label = HelixTextStyle(size: 10, lineHeight: 1.35, trackingEm: 0.025, relativeTo: .caption2)
}

/// How much room a line gets.
public enum HelixLeading {
    /// The style's own `line-height`.
    case standard
    /// Tailwind's `leading-none`. Almost every number in these cards uses it:
    /// a figure that is baseline-aligned against a unit label must not carry
    /// half a line of air, or the two stop sitting on the same line.
    case none
}

private struct HelixTextModifier: ViewModifier {
    let style: HelixTextStyle
    let weight: Font.Weight
    let leading: HelixLeading

    @ScaledMetric private var size: CGFloat

    init(style: HelixTextStyle, weight: Font.Weight, leading: HelixLeading) {
        self.style = style
        self.weight = weight
        self.leading = leading
        _size = ScaledMetric(wrappedValue: style.size, relativeTo: style.relativeTo)
    }

    func body(content: Content) -> some View {
        content
            .font(.system(size: size, weight: weight))
            .tracking(size * style.trackingEm)
            .lineSpacing(extraLeading)
    }

    /// `lineSpacing` is the gap ADDED between lines, not the line box. The
    /// system font's own box is about 1.2× its size, so the CSS line-height has
    /// to have that subtracted out of it — and clamped at zero, because SwiftUI
    /// cannot make a line box smaller than the font's ascent plus descent and a
    /// negative value here would silently do nothing on some faces and something
    /// on others.
    private var extraLeading: CGFloat {
        guard leading == .standard else { return 0 }
        return max(0, size * (style.lineHeight - 1.2))
    }
}

public extension View {
    /// Apply a HELIX type token.
    func helixText(
        _ style: HelixTextStyle,
        weight: Font.Weight = .regular,
        leading: HelixLeading = .standard
    ) -> some View {
        modifier(HelixTextModifier(style: style, weight: weight, leading: leading))
    }

    /// `.helix-num` — the class every figure in the app carries.
    ///
    /// It exists so digits keep the same advance width as they change, which is
    /// what stops a counting number from shuffling its neighbours sideways. The
    /// web app spells it `tabular-nums` in some places and `helix-num` in others;
    /// both resolve to the same thing and so does this.
    func helixNumber() -> some View {
        monospacedDigit()
    }
}
