import SwiftUI

/// The Onyx mark: one ring with a break at one o'clock.
///
/// ── WHY A RING REPLACES THE ONYX ───────────────────────────────────────────
/// The old mark was two sine strands and three rungs — a DNA onyx, drawn to
/// match a name the app no longer has. It also had a second problem the rename
/// only exposed: at the 12–16 pt it is actually used at, five strokes inside a
/// 16 pt box is a smudge, and every widget face carried one in its corner.
///
/// A ring is one stroke. It survives 12 pt, it survives the accented widget
/// rendering mode where the system paints everything white, and it is already
/// the app's most-repeated shape — the battery ring on Today, the score gauge,
/// the progress arc on the Lock Screen. The break at one o'clock is what stops
/// it being a generic circle: it reads as the "O" of Onyx and as a gauge that
/// has not closed, which is the same idea the product is about.
///
/// ── AND WHY IT IS DRAWN, NOT AN ASSET ───────────────────────────────────────
/// A PDF or an SVG asset would need a size-matched stroke to stay 2 pt at every
/// call site, would not take the accented mode's tint, and would be a second
/// place the brand is defined. One `Shape` takes both for free.
public struct OnyxRing: Shape {
    /// How much of the circumference the TRIM removes.
    ///
    /// Not the gap you see. The `.round` caps at each end extend tangentially by
    /// half the stroke, which on this radius eats ~17° of the cut — so an 8 %
    /// trim, which sounds like 29°, draws a 12° notch and the mark reads as a
    /// closed "O" at the 12 pt it spends most of its life at. 13 % is what puts
    /// ~30° of actual black between the two caps.
    public static let gap: CGFloat = 0.13

    /// Where the gap sits, measured the way a clock is. One o'clock is 30°
    /// clockwise of twelve, and SwiftUI's zero angle is three o'clock.
    public static let gapAngle = Angle.degrees(-60)

    /// The stroke, as a fraction of the mark's size: 2 pt at 16 pt.
    public static let strokeRatio: CGFloat = 0.125

    public init() {}

    public func path(in rect: CGRect) -> Path {
        // The same floor the view applies, so the shape and its stroke agree
        // about the inset at sizes below 8 pt.
        let width = max(1, min(rect.width, rect.height) * Self.strokeRatio)
        return Circle()
            .inset(by: width / 2)
            .trim(from: Self.gap / 2, to: 1 - Self.gap / 2)
            .rotation(Self.gapAngle)
            .path(in: rect)
    }
}

/// The mark, at a size.
public struct OnyxMark: View {
    public var size: CGFloat = 16
    /// Accented widget rendering, where the system has already chosen the ink
    /// and a two-stop gradient would be a lie.
    public var monochrome = false
    /// One hue instead of the Lunar → Ion ramp — for the Dynamic Island's
    /// compact regions, where the mark carries the running session's own colour.
    public var tint: Color? = nil
    /// 70 % (§8). The mark sits in a corner and is not the content; at full
    /// strength it competes with the number it is next to.
    public var opacity: Double = 0.70

    public init(size: CGFloat = 16, monochrome: Bool = false, tint: Color? = nil, opacity: Double = 0.70) {
        self.size = size
        self.monochrome = monochrome
        self.tint = tint
        self.opacity = opacity
    }

    public var body: some View {
        OnyxRing()
            .stroke(ink, style: StrokeStyle(lineWidth: max(1, size * OnyxRing.strokeRatio), lineCap: .round))
            .frame(width: size, height: size)
            .opacity(opacity)
            .accessibilityHidden(true)
    }

    /// Lavender at the top-left falling to indigo at the bottom-right — the
    /// same ramp the app icon's ring is lit with, so the tab bar and the Home
    /// Screen show one object.
    private var ink: AnyShapeStyle {
        if monochrome { return AnyShapeStyle(Color.white) }
        if let tint { return AnyShapeStyle(tint) }
        return AnyShapeStyle(LinearGradient(
            colors: [OnyxDomain.recover.start, OnyxDomain.train.start],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        ))
    }
}

/// The wordmark. SF Pro Display semibold, tightened (§8).
public struct OnyxWordmark: View {
    public var role: OnyxType = .display

    public init(role: OnyxType = .display) { self.role = role }

    public var body: some View {
        // `onyxType` rather than a hand-rolled font: the role already scales its
        // own tracking with Dynamic Type, and a wordmark whose tracking is frozen
        // at the default size opens up into a gappy mess at AX5.
        Text("Onyx")
            .onyxType(role, tracking: -0.03)
            .fontWeight(.semibold)
            .foregroundStyle(Color.onyx.textPrimary)
    }
}

// MARK: - The one seam

public extension OnyxMark {
    /// The room the corner mark needs, for a header row whose content runs to
    /// the trailing edge. Most do not — they end in a `Spacer` — and the ones
    /// that do reserve this rather than being drawn on.
    static let faceInset: CGFloat = 24
}


public extension View {
    /// The mark, placed — top-trailing, out of the way, never in the tap path.
    ///
    /// ── ONE OVERLAY, NOT THIRTY-SIX INLINE COPIES ───────────────────────────
    /// Every face used to draw its own `OnyxBrand` inside whichever caption row
    /// it happened to have, which is why the mark sat mid-tile on eleven of them
    /// and inside a split column on six more: the corner is a property of the
    /// FACE, and a view drawn inside a row cannot know where the face's corner
    /// is. An overlay on the container knows exactly, at every family and every
    /// size, and there is one of it.
    ///
    /// ── AND WHY STALENESS TAKES THE CORNER ──────────────────────────────────
    /// The corner is one slot. A face whose data is hours old has something more
    /// useful to say there than whose app it is, and `StaleTag` was already
    /// drawn at the trailing edge of the same caption row — so the mark stands
    /// down while the tag is up rather than being drawn on top of it.
    func onyxMarked(monochrome: Bool = false, size: CGFloat = 12, hidden: Bool = false) -> some View {
        overlay(alignment: .topTrailing) {
            if !hidden {
                OnyxMark(size: size, monochrome: monochrome)
                    .padding(OnyxSpace.s)
                    .allowsHitTesting(false)
            }
        }
    }
}

#if DEBUG
#Preview("Onyx mark") {
    VStack(spacing: OnyxSpace.xl) {
        HStack(spacing: OnyxSpace.l) {
            OnyxMark(size: 12)
            OnyxMark(size: 16)
            OnyxMark(size: 24)
            OnyxMark(size: 64, opacity: 1)
        }
        HStack(spacing: OnyxSpace.l) {
            OnyxMark(size: 24, monochrome: true)
            OnyxMark(size: 24, tint: Color.onyx.day("legs_a"))
            OnyxMark(size: 24, tint: Color.onyx.record)
        }
        OnyxWordmark(role: .hero)
    }
    .padding(OnyxSpace.xl)
    .background(Color.onyx.base)
}
#endif
