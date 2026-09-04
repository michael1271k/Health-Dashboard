import SwiftUI

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
