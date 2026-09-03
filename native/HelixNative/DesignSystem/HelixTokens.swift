import SwiftUI
import HelixCore

/// Obsidian Glass — the semantic token layer.
///
/// ── WHY THIS FILE EXISTS BESIDE `HelixPalette` AND NOT INSTEAD OF IT ────────
/// `HelixPalette` is a Tailwind transliteration: forty flat hexes carried over
/// from `src/lib/theme/palette.ts` so the web app and the first native screens
/// could be diffed by eye. It did its job and it is not the design. This file is
/// the design — four domain accents, text at three weights, and nothing else
/// painted a colour — and every screen written from Wave 3 onward reads it.
///
/// The logger still reads `HelixPalette`. Re-skinning it is Wave 1's unfinished
/// half and touches every set row, so it is not smuggled into a tab wave. Two
/// token files is the visible cost of that; one of them has a deletion date.
///
/// ── THE RULE THIS FILE MAKES ENFORCEABLE ────────────────────────────────────
/// No raw hex in any view. Hexes live here, views name meanings, and
/// `src/tests/native-token-discipline.test.ts` fails the build if a `0x` or a
/// `Color(red:` appears under `Features/`. A token you cannot name is a token
/// you have not designed yet.

// MARK: - Domains

/// The four accents. One per domain, and a screen belongs to exactly one.
///
/// ── WHY FOUR AND NOT ONE PER SCREEN ─────────────────────────────────────────
/// The web app grew a colour per concept — ember for calories, emerald for
/// protein, sapphire for carbs, gold for fat, amethyst for a day, garnet for
/// muscle mass — and the result is that colour stopped meaning anything: every
/// screen is a different rainbow, so nothing on any of them stands out. Four
/// accents keyed to DOMAINS means the hue tells you where you are before you
/// read a word, and the one tinted thing on a screen is the one that matters.
enum HelixDomain: String, CaseIterable, Sendable {
    /// Ion — logger, PRs, volume, muscle.
    case train
    /// Solar — nutrition, levers, water.
    case fuel
    /// Tide — composition, atlas intensity, cardio.
    case body
    /// Lunar — sleep, readiness, fatigue, DOMS.
    case recover

    /// The mesh's first stop. Also the accent when only one colour will do.
    var start: Color {
        switch self {
        case .train:   Color(hex: 0x7C5CFF)
        case .fuel:    Color(hex: 0xFFB13D)
        case .body:    Color(hex: 0x3DFFB0)
        case .recover: Color(hex: 0xB9A7FF)
        }
    }

    /// The mesh's second stop.
    var end: Color {
        switch self {
        case .train:   Color(hex: 0x38E1FF)
        case .fuel:    Color(hex: 0xFF5E7A)
        case .body:    Color(hex: 0x12C2B0)
        case .recover: Color(hex: 0xDCEBFF)
        }
    }

    /// What a `Section` header, a `Gauge` tint or a selected row is coloured.
    ///
    /// The START stop rather than a computed midpoint: a midpoint of Solar
    /// (`#FFB13D` → `#FF5E7A`) is a muddy salmon that reads as neither warning
    /// nor warmth, and the two-stop ramp exists for gradients, not for solids.
    var accent: Color { start }

    /// The gradient both the mesh bleed and any tinted fill are built from.
    var ramp: LinearGradient {
        LinearGradient(colors: [start, end], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// Which domain owns a tracked muscle.
    ///
    /// §3.2 of the plan: chest/arms/shoulders → Ion, back/legs → Tide, core →
    /// Lunar. The atlas GEOMETRY does not change; only the hue family it is
    /// keyed to. Six families collapsing to three is the point — the old ramp
    /// separated cells that never needed separating and cost the palette its
    /// meaning everywhere else.
    static func forMuscle(_ muscle: LandmarkMuscle) -> HelixDomain {
        switch muscle {
        case .chest, .frontDelts, .sideDelts, .rearDelts, .biceps, .triceps, .forearms:
            .train
        case .lats, .upperBack, .lowerBack, .quads, .hamstrings, .glutes, .adductors, .calves:
            .body
        case .absCore:
            .recover
        }
    }
}

// MARK: - Semantic colours

extension Color {

    /// `Color.helix.textPrimary`. The only colours a view is allowed to name.
    ///
    /// Lowercase on purpose: it reads as a namespace at the call site, which is
    /// what it is, and `Color.Helix.textPrimary` would read as a type.
    enum helix {

        // ── Ground ───────────────────────────────────────────────────────────

        /// True black. OLED pixels that are off draw no power and have no edge,
        /// which is why every material above them reads as a real layer rather
        /// than a lighter rectangle on a dark grey one.
        static let base = Color.black

        /// 0.5 pt at 8 % white, and only where content meets chrome. Hierarchy
        /// here is material weight; a border drawn between two things that are
        /// already separated by material is noise.
        static let hairline = Color.white.opacity(0.08)

        // ── Text ─────────────────────────────────────────────────────────────

        static let textPrimary = Color.white.opacity(0.92)
        static let textSecondary = Color.white.opacity(0.62)
        /// Fails 4.5:1 BY DESIGN, so it is only ever correct for a label whose
        /// absence would cost the reader nothing — a unit suffix, a row count, a
        /// timestamp already spoken by VoiceOver. Never a value, never a control
        /// label, never the only copy of a fact.
        static let textTertiary = Color.white.opacity(0.38)

        /// System red's dark-appearance variant. Destructive actions and
        /// validation failures; never a chart series, never an accent.
        static let danger = Color(hex: 0xFF453A)

        // ── Accents ──────────────────────────────────────────────────────────

        static func accent(_ domain: HelixDomain) -> Color { domain.accent }

        /// A muscle's colour: its family's accent, stepped so the ORDER inside
        /// the family still carries meaning.
        ///
        /// Step is an index within the family, not an arbitrary shade — the
        /// caller passes where the muscle sits in the list it is drawing, so a
        /// list of eight back muscles ramps rather than repeating one teal.
        static func muscle(_ muscle: LandmarkMuscle, step: Int = 0, of count: Int = 1) -> Color {
            let domain = HelixDomain.forMuscle(muscle)
            guard count > 1 else { return domain.accent }
            // 0 … 1 across the family, then a fixed 35 % of the ramp's distance.
            // A full sweep would put the last muscle of a family on the NEXT
            // family's hue, which is exactly the confusion the four accents fix.
            let t = Double(step) / Double(count - 1) * 0.35
            return domain.start.mix(with: domain.end, by: t)
        }
    }
}

// MARK: - Geometry

/// Concentric squircles: an inner radius is its outer radius minus the padding
/// between them. Corners that are merely "all rounded" read as stickers.
enum HelixCorner {
    /// A row inside a tile.
    static let row: CGFloat = 12
    /// A tile on a screen.
    static let tile: CGFloat = 20
    /// A presented sheet.
    static let sheet: CGFloat = 32

    /// The inner radius for content inset by `padding` inside `outer`.
    static func inner(_ outer: CGFloat, padding: CGFloat) -> CGFloat {
        max(0, outer - padding)
    }
}

// MARK: - Type roles

extension View {

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

    /// A hero figure: readiness, load, kcal. One per screen at most.
    func helixHero() -> some View {
        self.font(.system(size: 56, weight: .bold, design: .rounded))
            .tracking(-56 * 0.03)
            .monospacedDigit()
            .contentTransition(.numericText())
    }

    /// A screen or sheet title. Tracking is size-specific — a display size that
    /// keeps body tracking reads loose, and one fixed value is wrong at both
    /// ends of a scale.
    func helixDisplay() -> some View {
        self.font(.largeTitle.weight(.semibold))
            .tracking(-34 * 0.02)
    }

    /// A section caption or a unit suffix.
    func helixCaption() -> some View {
        self.font(.caption)
            .tracking(12 * 0.01)
            .foregroundStyle(Color.helix.textSecondary)
    }
}

// MARK: - Colour mixing

extension Color {
    /// Linear interpolation towards another colour.
    ///
    /// iOS 18 ships `Color.mix(with:by:)`; this shim exists so the ramp above
    /// reads the same on both, and so the deployment floor can move without a
    /// call-site edit. It resolves through UIKit because SwiftUI's `Color` has
    /// no component accessors of its own.
    func mix(with other: Color, by amount: Double) -> Color {
        let t = min(max(amount, 0), 1)
        let a = UIColor(self)
        let b = UIColor(other)
        var (ar, ag, ab, aa): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        var (br, bg, bb, ba): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        a.getRed(&ar, green: &ag, blue: &ab, alpha: &aa)
        b.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
        return Color(
            .sRGB,
            red: Double(ar + (br - ar) * t),
            green: Double(ag + (bg - ag) * t),
            blue: Double(ab + (bb - ab) * t),
            opacity: Double(aa + (ba - aa) * t)
        )
    }
}
