import SwiftUI

/// One movement, one hue, across the whole card.
///
/// ── WHY THE WASH IS VERTICAL AND CONTINUOUS ─────────────────────────────────
/// The exercise card is one subject — the movement — drawn as a header and the
/// sets that produced it. Both screens that draw it had arrived at the same
/// shape by different roads and painted it two different ways:
///
///   · the session ledger washed its HEADER left-to-right at 28 %→4 % and left
///     the rows bare, so the header read as a coloured band bolted to the top
///     of a black list;
///   · the live deck washed the first 120 pt of the card at 10 %→0 and gave its
///     rows their own fill, so the colour was a stripe rather than a surface.
///
/// A card whose top is tinted and whose body is not is a card the eye splits in
/// two, which is the "disconnected from the beautiful exercise header" the
/// review named. So the wash now runs TOP TO BOTTOM across header and rows
/// together: one gradient, applied once, by the card rather than by its parts.
/// The card reads as being made of the muscle's material instead of wearing a
/// band of it.
///
/// ── AND WHY 6 %→2 % AND NOT MORE ────────────────────────────────────────────
/// It sits behind `ultraThinMaterial`, over content that has to stay legible at
/// every Dynamic Type size, and it is drawn once per movement — seven of them
/// down a session. At the header's old 28 % a seven-exercise page is seven
/// saturated panels, which is the "rainbow explosion" the brief feared and is
/// the reason that value was survivable only while the rows underneath stayed
/// black. Ending at 2 % rather than 0 is what keeps the bottom of a long card
/// from fading back to a black list halfway down.
///
/// ONE hue does the surface. The secondary muscles get the rail and nothing
/// else — a second colour in the background is where a card with three muscle
/// chips starts arguing with the effort column, which is the only other thing
/// on these rows allowed to carry meaning in colour.
public extension View {

    /// Paint a card in its movement's own colour.
    ///
    /// - Parameters:
    ///   - primary: the movement's primary landmark hue. The surface.
    ///   - secondary: the assisting hue, if the movement has one. It reaches
    ///     the rail only, as its bottom half.
    ///   - corner: the card's own radius, so the wash and the rail are clipped
    ///     to the same shape the material is.
    func onyxMuscleWash(
        _ primary: Color, secondary: Color? = nil, corner: CGFloat = OnyxCorner.tile
    ) -> some View {
        modifier(OnyxMuscleWash(primary: primary, secondary: secondary, corner: corner))
    }
}

struct OnyxMuscleWash: ViewModifier {
    let primary: Color
    let secondary: Color?
    let corner: CGFloat

    func body(content: Content) -> some View {
        content
            // BEHIND the content and INSIDE the card's clip. `.background`
            // sizes to the modified view, which here is the whole card, so the
            // gradient spans header and rows as one run — the thing the two
            // per-part washes it replaces could not do.
            .background {
                LinearGradient(
                    colors: [primary.opacity(0.06), primary.opacity(0.02)],
                    startPoint: .top, endPoint: .bottom
                )
            }
            // ── THE RAIL CARRIES THE SECOND MUSCLE ──────────────────────────
            // A 3 pt edge is the one part of this that survives a pale family
            // on an OLED black, and it is what makes a scrolled deck scannable
            // by colour rather than by reading seven names. Primary at the top,
            // secondary at the bottom: the same order the header's chips are
            // in, so the rail is a legend for them rather than a second scheme.
            //
            // A movement with no secondary gets a solid rail rather than a
            // gradient to nothing — fading to clear would read as the rail
            // running out, which is a state that means nothing here.
            .overlay(alignment: .leading) {
                LinearGradient(
                    colors: [primary, secondary ?? primary],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(width: 3)
            }
            .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
    }
}
