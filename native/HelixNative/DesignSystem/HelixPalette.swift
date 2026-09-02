import SwiftUI

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
enum HelixPalette {

    // ── Base surfaces ────────────────────────────────────────────────────────
    static let obsidian      = Color(hex: 0x0A0B0D)
    static let graphite      = Color(hex: 0x121418)
    static let slateSurface  = Color(hex: 0x1A1D23)
    static let hairline      = Color(hex: 0x23262B)

    // ── Signature + jewel accents ────────────────────────────────────────────
    /// Evolved ember: warmer and richer than the old flat orange.
    static let ember         = Color(hex: 0xE0703C)
    static let emberDeep     = Color(hex: 0xB4522A)
    static let copper        = Color(hex: 0xC97A45)
    static let bronze        = Color(hex: 0x9C6B3F)

    static let sapphire      = Color(hex: 0x3D7AB8)
    static let sapphireDeep  = Color(hex: 0x2E5C8A)
    static let emerald       = Color(hex: 0x3E9E7A)
    static let emeraldDeep   = Color(hex: 0x2F7D63)
    static let emeraldLight  = Color(hex: 0x5FBF98)

    /// The effort ladder's fourth rung, and nothing else. Not `gold`, which
    /// means a personal record app-wide.
    static let amber         = Color(hex: 0xE0A03C)
    static let gold          = Color(hex: 0xD4AF37)
    static let goldDeep      = Color(hex: 0xA88722)
    static let amethyst      = Color(hex: 0x8A6FA8)
    static let plum          = Color(hex: 0x6B4E7D)
    /// Drop sets, and drop sets only — `amethyst` is already spoken for as a
    /// DAY colour, so a drop-set chip in the day's own hue would say nothing.
    static let dropset       = Color(hex: 0x9A6DD7)
    static let platinum      = Color(hex: 0xC9CDD6)
    static let steel         = Color(hex: 0x8E9AAC)
    static let oxide         = Color(hex: 0xC4514E)
    /// Wine — skeletal muscle.
    static let garnet        = Color(hex: 0xB4526B)
    /// Bone / mineral.
    static let bone          = Color(hex: 0xE6EAF0)
    /// The travel/deload tone. A deliberate "away" colour, not a mistake.
    static let sand          = Color(hex: 0xE6C68C)
    /// The muscle atlas's own blue — brighter and cooler than `sapphire`.
    static let atlasBlue     = Color(hex: 0x3FA9F5)

    // ── Semantic ─────────────────────────────────────────────────────────────
    static let text          = Color(hex: 0xECEEF2)
    static let muted         = Color(hex: 0x79808C)
    static let dim           = Color(hex: 0x5A6472)
    static let danger        = oxide

    // ── Surface chrome ───────────────────────────────────────────────────────
    /// `border-white/[0.07]` — the hairline every card in the web app draws.
    static let cardBorder    = Color.white.opacity(0.07)
    /// `bg-white/[0.03]` — the card fill. Note this is a LIGHTER-ON-DARK wash,
    /// not a solid: cards stack over `obsidian` and each other and must stay
    /// translucent to keep the depth order readable.
    static let cardFill      = Color.white.opacity(0.03)
    /// `border-white/[0.08]` + `bg-white/[0.04]` — the slightly stronger pair
    /// used for tappable rows (history rows, the two page-footer links).
    static let rowBorder     = Color.white.opacity(0.08)
    static let rowFill       = Color.white.opacity(0.04)
    /// `bg-white/[0.07]` — the empty part of any progress track.
    static let trackFill     = Color.white.opacity(0.07)

    /// Macros — four distinct jewel tones so the fills read instantly apart.
    /// Calories lead with the signature ember; protein is emerald (growth),
    /// carbs sapphire (glycogen/fuel), fat antique gold.
    enum Macro {
        static let calories = HelixPalette.ember
        static let protein  = HelixPalette.emerald
        static let carbs    = HelixPalette.sapphire
        static let fat      = HelixPalette.gold
    }

    /// GLOBAL phase colours, independent of the active plan: Cut is always
    /// red/orange, Bulk always green, Maintenance steel.
    enum Phase {
        static let cut         = HelixPalette.ember
        static let maintenance = HelixPalette.steel
        static let bulk        = HelixPalette.emerald
    }
}

extension Color {
    /// `Color(hex: 0xE0703C)`.
    ///
    /// Takes an integer rather than a string on purpose: `Color(hex: "#E0703C")`
    /// has to decide what to do with a typo at runtime, and every such API in
    /// the wild answers "silently return black". An `Int` literal that is not a
    /// colour does not compile.
    init(hex: UInt32, opacity: Double = 1) {
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
    func alphaByte(_ byte: UInt8) -> Color {
        opacity(Double(byte) / 255)
    }
}
