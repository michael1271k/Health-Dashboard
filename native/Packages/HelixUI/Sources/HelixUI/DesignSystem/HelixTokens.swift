import SwiftUI
import HelixCore

/// Onyx — the semantic token layer. Colour and geometry; type lives in
/// `HelixType.swift`.
///
/// ── WHY THIS FILE EXISTS BESIDE `HelixPalette` AND NOT INSTEAD OF IT ────────
/// `HelixPalette` is a Tailwind transliteration: forty flat hexes carried over
/// from `src/lib/theme/palette.ts` so the web app and the first native screens
/// could be diffed by eye. It did its job and it is not the design. This file is
/// the design — four domain accents, text at three weights, and a short list of
/// fixed semantic hues — and every screen reads it.
///
/// The logger is the last reader of `HelixPalette`; re-skinning it touches every
/// set row, so it is Wave 2.4's diff and `HelixPalette` dies with it.
///
/// ── WHAT CHANGED IN TOKENS v2 (Phase 2 §3.2) ────────────────────────────────
/// Every accent came down two steps. The v1 palette was Ion `#7C5CFF` and Tide
/// `#3DFFB0` — full-saturation hues on true black, which is the exact recipe
/// for a screen that reads as a web app in a new font: the accent shouts, the
/// glass under it tints, and every number has to compete with its own label's
/// colour. Desaturating is not a taste change, it is what lets the material
/// carry the hierarchy instead of the hue.
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
public enum HelixDomain: String, CaseIterable, Sendable {
    /// Ion — logger, PRs, volume, muscle. Indigo → sky.
    case train
    /// Solar — nutrition, levers, water. Honey → coral.
    case fuel
    /// Tide — composition, atlas intensity, cardio. Teal → deep teal.
    case body
    /// Lunar — sleep, readiness, fatigue, DOMS. Lavender → mist.
    case recover

    /// The mesh's first stop. Also the accent when only one colour will do.
    public var start: Color {
        switch self {
        case .train:   Color(hex: 0x6B78F0)
        case .fuel:    Color(hex: 0xE3A650)
        case .body:    Color(hex: 0x46B39D)
        case .recover: Color(hex: 0xA79FD6)
        }
    }

    /// The mesh's second stop.
    public var end: Color {
        switch self {
        case .train:   Color(hex: 0x4FB6E8)
        case .fuel:    Color(hex: 0xE07A7A)
        case .body:    Color(hex: 0x2E9AA6)
        case .recover: Color(hex: 0xC9D3EE)
        }
    }

    /// What a `Section` header, a `Gauge` tint or a selected row is coloured.
    ///
    /// The START stop rather than a computed midpoint: a midpoint of Solar
    /// (`#E3A650` → `#E07A7A`) is a muddy salmon that reads as neither warning
    /// nor warmth, and the two-stop ramp exists for gradients, not for solids.
    public var accent: Color { start }

    /// A fixed offset along the mesh, 0 = `start` … 1 = `end`.
    ///
    /// §3.2: split colours, macro rails and set states "derive from the domain
    /// accent's mesh at fixed offsets". This is the one function that derives
    /// them, so a tile never mixes a colour of its own.
    public func at(_ t: Double) -> Color {
        start.mix(with: end, by: min(max(t, 0), 1))
    }

    /// Which domain owns a muscle FAMILY by its display name — "Chest", "Back",
    /// "Shoulders", "Arms", "Legs", "Core" — as `volumeByFamily` reports them.
    /// The same collapse as `forMuscle`, keyed on the string the payload carries.
    public static func forFamily(_ name: String) -> HelixDomain {
        switch name {
        case "Chest", "Shoulders", "Arms": .train
        case "Back", "Legs":               .body
        case "Core":                       .recover
        default:                           .train
        }
    }

    /// The gradient both the mesh bleed and any tinted fill are built from.
    public var ramp: LinearGradient {
        LinearGradient(colors: [start, end], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// Which domain owns a tracked muscle.
    ///
    /// §3.2 of the plan: chest/arms/shoulders → Ion, back/legs → Tide, core →
    /// Lunar. The atlas GEOMETRY does not change; only the hue family it is
    /// keyed to. Six families collapsing to three is the point — the old ramp
    /// separated cells that never needed separating and cost the palette its
    /// meaning everywhere else.
    public static func forMuscle(_ muscle: LandmarkMuscle) -> HelixDomain {
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
    public enum helix {

        // ── Ground ───────────────────────────────────────────────────────────

        /// True black. OLED pixels that are off draw no power and have no edge,
        /// which is why every material above them reads as a real layer rather
        /// than a lighter rectangle on a dark grey one.
        public static let base = Color.black

        /// 0.5 pt at 8 % white, and only where content meets chrome. Hierarchy
        /// here is material weight; a border drawn between two things that are
        /// already separated by material is noise.
        public static let hairline = Color.white.opacity(0.08)

        // ── Text ─────────────────────────────────────────────────────────────

        public static let textPrimary = Color.white.opacity(0.92)
        public static let textSecondary = Color.white.opacity(0.62)
        /// 40 %, and it fails 4.5:1 BY DESIGN — so it is only ever correct for a
        /// label whose absence would cost the reader nothing: a unit suffix, a
        /// row count, a timestamp already spoken by VoiceOver. Never a value,
        /// never a control label, never the only copy of a fact.
        public static let textTertiary = Color.white.opacity(0.40)

        /// Destructive actions, validation failures, and the over-budget segment
        /// of a gauge. Never a chart series, never an accent.
        public static let danger = Color(hex: 0xE5484D)

        // ── Accents ──────────────────────────────────────────────────────────

        public static func accent(_ domain: HelixDomain) -> Color { domain.accent }

        /// Anything that went the right way: a delta in the good direction, a
        /// session logged, a target met. A muted green rather than Tide's teal —
        /// "yes" and "this is the Body tab" are different statements and the v1
        /// palette said them in the same colour.
        public static let good = Color(hex: 0x4CAF87)

        /// A personal record, and nothing else. §3.2 makes gold the ONLY fifth
        /// hue in the system precisely so that seeing it means one thing: the
        /// number under it has never been beaten.
        public static let record = Color(hex: 0xD9B25F)

        // ── Macros & water ───────────────────────────────────────────────────
        //
        // Fixed app-wide and never re-mapped per screen: a bar that is coral in
        // Nutrition and teal in a widget is two facts the reader has to hold.
        // Three of the four are domain stops rather than new hues, so the macro
        // rails still read as Solar and Lunar rather than as a fifth palette.

        /// Coral — Solar's far stop.
        public static let protein = HelixDomain.fuel.end
        /// Honey — Solar's near stop.
        public static let carbs = HelixDomain.fuel.start
        /// Lavender — Lunar's near stop.
        public static let fat = HelixDomain.recover.start
        /// Sapphire. The one macro-adjacent hue that is not on a domain mesh,
        /// because water is not a macro and must not be mistaken for one.
        public static let water = Color(hex: 0x5AA9E6)
        /// Calories are the Atwater SUM of the three macros, so they take the
        /// domain the three sit on rather than a colour of their own. Use
        /// `HelixDomain.fuel.ramp` where the fill is a gradient.
        public static let calories = HelixDomain.fuel.accent

        /// The colour of a ROUTINE DAY — what tints a calendar ring, a session
        /// chip and the This-week panel — keyed onto the domains by what the day
        /// TRAINS, the same way `HelixDomain.forMuscle` keys a muscle.
        ///
        /// §3.2: upper A/B are Ion at 0.35 / 0.65, legs A/B are Tide at the same
        /// two steps, and Delts & Arms takes Ion's end stop. Two steps in from
        /// each end rather than 0 and 1 — a split colour sits next to the domain
        /// accent on the same screen, and a day drawn in the accent itself reads
        /// as "selected" rather than as "leg day". Push/Pull/Legs mirror the rule
        /// so a Helix week and a PPL week are the same picture.
        ///
        /// A rest day is the ABSENCE of a session and wears no accent at all.
        public static func day(_ dayKey: String?) -> Color {
            switch dayKey {
            // Helix-5 (active)
            case "cb_a":    return HelixDomain.train.at(0.35)
            case "cb_b":    return HelixDomain.train.at(0.65)
            case "arms":    return HelixDomain.train.end
            case "legs_a":  return HelixDomain.body.at(0.35)
            case "legs_b":  return HelixDomain.body.at(0.65)
            // Helix-4 (drawer) — mirrors its Helix-5 counterpart
            case "upper_a": return HelixDomain.train.at(0.35)
            case "upper_b": return HelixDomain.train.at(0.65)
            case "lower_a": return HelixDomain.body.at(0.35)
            case "lower_b": return HelixDomain.body.at(0.65)
            // PPL legacy — the same rule; push and pull are both upper work.
            case "ppl_push_sun", "ppl_push_thu": return HelixDomain.train.at(0.35)
            case "ppl_pull_mon", "ppl_pull_fri": return HelixDomain.train.at(0.65)
            case "ppl_legs_tue":                 return HelixDomain.body.at(0.35)
            default:        return textTertiary
            }
        }

        /// `day()` for a WORD rather than a ring.
        ///
        /// Identical except on a rest day, where `day()` answers `textTertiary`
        /// — a RING colour (§3.2: "Rest = tertiary grey ring"), and 3.7:1 on
        /// black. A ring may sit at 3.7:1; a label naming the day may not, and
        /// `textTertiary`'s own rule says never the only copy of a fact.
        public static func dayLabel(_ dayKey: String?) -> Color {
            let colour = day(dayKey)
            return colour == textTertiary ? textSecondary : colour
        }

        /// Battery banding — the one place a traffic light is the right
        /// metaphor, because the number genuinely is a fuel gauge. Good above
        /// 60, Solar's honey through the middle, danger below 30, and a reading
        /// that does not exist is text-grey rather than any verdict.
        public static func battery(_ pct: Int?) -> Color {
            guard let pct else { return textSecondary }
            return pct >= 60 ? good : pct >= 30 ? HelixDomain.fuel.accent : danger
        }

        /// A muscle's colour: its family's accent, stepped so the ORDER inside
        /// the family still carries meaning.
        ///
        /// Step is an index within the family, not an arbitrary shade — the
        /// caller passes where the muscle sits in the list it is drawing, so a
        /// list of eight back muscles ramps rather than repeating one teal.
        public static func muscle(_ muscle: LandmarkMuscle, step: Int = 0, of count: Int = 1) -> Color {
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

/// The spacing scale. Five steps, and `Features/` may not spell a number.
///
/// ── WHY A SCALE AT ALL WHEN EVERY VALUE IS ALREADY A NUMBER ─────────────────
/// The screens this replaces used 14 and 16 and 18 interchangeably — not as
/// decisions but as whatever the file next door happened to say. Three values
/// that differ by 2 pt do not read as three levels of relationship; they read as
/// a grid that is slightly off, which is the single loudest "this was not made
/// by a designer" signal an iOS screen can send. Five steps that are visibly
/// different is a hierarchy. Fifteen that are not is noise.
public enum HelixSpace {
    /// 4 — inside a chip, between a glyph and its label.
    public static let xs: CGFloat = 4
    /// 8 — between the lines of one thought.
    public static let s: CGFloat = 8
    /// 12 — a tile's own padding, and the gap between rows inside it.
    public static let m: CGFloat = 12
    /// 16 — the gap between sections, and the screen's side gutter.
    public static let l: CGFloat = 16
    /// 24 — the gap above a footer CTA, and a sheet's top inset.
    public static let xl: CGFloat = 24

    /// The dashboard grid's gap: `s + 2`.
    ///
    /// The one value that is not a step of the scale, and it is deliberate. The
    /// grid's cells already carry `m` of padding inside their own edge, so a
    /// full `m` between them reads as a 24 pt trench; `s` alone lets two tiles
    /// touch. 10 is the value where a 2-up grid reads as a grid.
    public static let grid: CGFloat = 10
}

/// Concentric squircles: an inner radius is its outer radius minus the padding
/// between them. Corners that are merely "all rounded" read as stickers.
///
/// v2 brought all three down (12/20/32 → 10/16/28). A 20 pt corner on a 160 pt
/// tile is a lozenge; iOS's own widgets, cards and grouped rows sit near 16, and
/// the tiles were reading as web cards partly because of it.
public enum HelixCorner {
    /// A row inside a tile.
    public static let row: CGFloat = 10
    /// A tile on a screen.
    public static let tile: CGFloat = 16
    /// A presented sheet.
    public static let sheet: CGFloat = 28

    /// The inner radius for content inset by `padding` inside `outer`.
    public static func inner(_ outer: CGFloat, padding: CGFloat) -> CGFloat {
        max(0, outer - padding)
    }
}

// MARK: - Sleep

/// The four sleep stages, each its own token.
///
/// ── WHY NOT FOUR ALPHAS OF ONE HUE ──────────────────────────────────────────
/// v1 derived all four from Lunar at fixed offsets, and the Sleep sheet came out
/// as four lavender bars a reader had to decode from a legend. The stages are
/// not a ramp of one quantity — deep and REM are different KINDS of sleep, and
/// awake is not sleep at all — so they get four hues that stay distinct at a
/// widget's 9 pt legend and in the stacked arc. Deep is the indigo end of night,
/// core keeps Lunar, REM is warm because it is the active stage, and awake is
/// the neutral gap in the night.
public enum HelixSleepStage: CaseIterable, Sendable {
    case deep, core, rem, awake

    public var color: Color {
        switch self {
        case .deep:  Color(hex: 0x5B62C9)
        case .core:  HelixDomain.recover.start
        case .rem:   Color(hex: 0xE07A9A)
        case .awake: Color(hex: 0x6E6E78)
        }
    }

    public var label: String {
        switch self {
        case .deep:  "DEEP"
        case .core:  "CORE"
        case .rem:   "REM"
        case .awake: "AWAKE"
        }
    }
}
