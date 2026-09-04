import SwiftUI

/// Onyx — the type scale. Six roles, and `Features/` may not spell a size.
///
/// ── WHY THE SIZES ARE APPLE'S AND NOT OURS ──────────────────────────────────
/// v1 was a transliteration of the web app's `clamp()` scale: 11.6, 13.3, 15.1,
/// 17.5, 20.7, 28.2, 36.5 — seven sizes evaluated at a 390 pt viewport and then
/// frozen. Every one of them lands a fraction off a system text style, which is
/// why the screens read as a web page in SF: the app's 15.1 pt secondary line
/// sits beside a system `Section` header at 13 and a navigation title at 17, and
/// nothing aligns to anything.
///
/// The six roles below ARE system text styles — `.title` is 28, `.title3` is 20,
/// `.body` is 17, `.subheadline` is 15, `.footnote` is 13, `.caption2` is 11 —
/// so the sizes in §3.3 are not a scale we invented that happens to look Apple,
/// they are the scale, named for what each one is for. Naming them is what makes
/// the rule enforceable; using the system styles is what makes Dynamic Type,
/// optical sizing and the system's own tracking tables come for free. There is
///
/// The only frozen number left is the TRACKING, and `@ScaledMetric` scales that
/// against the role's own style so an `em` stays an `em` at every text setting.
///
/// ── NOTHING BELOW 11 ────────────────────────────────────────────────────────
/// `micro` is the floor, and it is for LABELS — a unit, a register caption, an
/// axis tick. Never a value. A widget face may go to 9 pt because WidgetKit does
/// not scale and a Lock Screen accessory is 40 pt tall; that is `HelixWidgetType`
/// and it does not exist inside the app.
///
/// ── TRACKING IS SIZE-SPECIFIC, WHICH IS THE WHOLE POINT ─────────────────────
/// Letterforms read further apart as they grow, so display text takes NEGATIVE
/// tracking and small text takes a little positive. One fixed value across a
/// scale is wrong at both ends. Stored in `em` and multiplied by the SCALED
/// size, so it stays proportional when the user turns text up.
public enum HelixType: CaseIterable, Sendable {
    /// The one figure a screen is about: a readiness score, the day's kcal.
    /// At most one per screen — a second hero is two screens in a trench coat.
    case hero
    /// A card's own title, a sheet's heading, a split name.
    case display
    /// Prose, list rows, and every value that is not the hero.
    case body
    /// The line under a value: a target, a previous set, a meta line.
    case secondary
    /// A section caption, a unit suffix, a chart's axis label.
    case caption
    /// A register label — uppercase, tracked out, never carrying a number.
    case micro

    /// The system style this role IS. Not "scales against" — is.
    public var textStyle: Font.TextStyle {
        switch self {
        case .hero:      .title       // 28
        case .display:   .title3      // 20
        case .body:      .body        // 17
        case .secondary: .subheadline // 15
        case .caption:   .footnote    // 13
        case .micro:     .caption2    // 11
        }
    }

    /// Size at the default Dynamic Type setting. Documentation and the token
    /// record; the rendering never reads it.
    public var points: CGFloat {
        switch self {
        case .hero: 28
        case .display: 20
        case .body: 17
        case .secondary: 15
        case .caption: 13
        case .micro: 11
        }
    }

    public var weight: Font.Weight {
        switch self {
        case .hero:      .bold
        case .display:   .semibold
        case .micro:     .semibold
        case .body, .secondary, .caption: .regular
        }
    }

    /// Rounded only for the hero, which is always a numeral and takes the same
    /// shape language as `helixNumeral()`. Prose in a rounded face reads as a
    /// children's app.
    public var design: Font.Design {
        self == .hero ? .rounded : .default
    }

    /// CSS `letter-spacing`, in `em`. Negative as the type grows, positive at
    /// the floor — `micro` is set in caps, and caps at 11 pt close their counters
    /// up into a block unless they are opened out. 0.10 em is 1.1 pt, which is
    /// what the register captions it replaces were tracked to by hand.
    public var trackingEm: CGFloat {
        switch self {
        case .hero:    -0.02
        case .display: -0.01
        case .micro:    0.10
        case .body, .secondary, .caption: 0
        }
    }

    public var font: Font {
        Font.system(textStyle, design: design).weight(weight)
    }
}

private struct HelixTypeModifier: ViewModifier {
    let role: HelixType
    /// An `em` that overrides the role's own. For the wordmark, which is a piece
    /// of brand rather than a piece of the scale.
    let trackingEm: CGFloat?

    /// The role's own point size, as the user's text setting renders it. Only
    /// the TRACKING needs it — the font comes from the text style — but tracking
    /// is an `em` and an `em` of a size nobody measured is a guess.
    @ScaledMetric private var size: CGFloat

    init(role: HelixType, trackingEm: CGFloat?) {
        self.role = role
        self.trackingEm = trackingEm
        _size = ScaledMetric(wrappedValue: role.points, relativeTo: role.textStyle)
    }

    func body(content: Content) -> some View {
        content
            .font(role.font)
            .tracking(size * (trackingEm ?? role.trackingEm))
    }
}

public extension View {
    /// Apply an Onyx type role.
    func helixType(_ role: HelixType, tracking trackingEm: CGFloat? = nil) -> some View {
        modifier(HelixTypeModifier(role: role, trackingEm: trackingEm))
    }

    /// Every number in the app.
    ///
    /// ── THREE THINGS THAT ONLY WORK TOGETHER ────────────────────────────────
    /// `.monospacedDigit()` stops neighbours shuffling as a value changes;
    /// `.rounded` matches the numerals to the shape language of the tiles;
    /// `.contentTransition(.numericText())` animates a digit rolling rather than
    /// cross-fading, which is the difference between a number that CHANGED and
    /// a number that was replaced. Numbers are the product here — they get the
    /// same care the copy does.
    func helixNumeral() -> some View {
        self.fontDesign(.rounded)
            .monospacedDigit()
            .contentTransition(.numericText())
    }

    /// The hero figure. `helixType(.hero)` plus numeral treatment, because the
    /// hero is always a number.
    func helixHero() -> some View {
        helixType(.hero).monospacedDigit().contentTransition(.numericText())
    }

    /// A card or sheet title.
    func helixDisplay() -> some View { helixType(.display) }

    /// A section caption or a unit suffix, in secondary ink.
    func helixCaption() -> some View {
        helixType(.caption).foregroundStyle(Color.helix.textSecondary)
    }

    /// A register label: uppercase, tracked out, tertiary ink. The case is part
    /// of the role — a register caption in sentence case is just small body text.
    func helixMicro() -> some View {
        helixType(.micro)
            .textCase(.uppercase)
            .foregroundStyle(Color.helix.textTertiary)
    }
}
