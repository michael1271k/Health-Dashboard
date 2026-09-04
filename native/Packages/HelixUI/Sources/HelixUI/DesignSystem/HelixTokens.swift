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
public enum HelixDomain: String, CaseIterable, Sendable {
    /// Ion — logger, PRs, volume, muscle.
    case train
    /// Solar — nutrition, levers, water.
    case fuel
    /// Tide — composition, atlas intensity, cardio.
    case body
    /// Lunar — sleep, readiness, fatigue, DOMS.
    case recover

    /// The mesh's first stop. Also the accent when only one colour will do.
    public var start: Color {
        switch self {
        case .train:   Color(hex: 0x7C5CFF)
        case .fuel:    Color(hex: 0xFFB13D)
        case .body:    Color(hex: 0x3DFFB0)
        case .recover: Color(hex: 0xB9A7FF)
        }
    }

    /// The mesh's second stop.
    public var end: Color {
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
    public var accent: Color { start }

    /// A fixed offset along the mesh, 0 = `start` … 1 = `end`.
    ///
    /// §3.2: set states, macro rails and sleep stages "derive from the domain
    /// accent's mesh at fixed offsets, never from a fifth hue". This is the one
    /// function that derives them, so a tile never mixes a colour of its own.
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
        /// Fails 4.5:1 BY DESIGN, so it is only ever correct for a label whose
        /// absence would cost the reader nothing — a unit suffix, a row count, a
        /// timestamp already spoken by VoiceOver. Never a value, never a control
        /// label, never the only copy of a fact.
        public static let textTertiary = Color.white.opacity(0.38)

        /// System red's dark-appearance variant. Destructive actions and
        /// validation failures; never a chart series, never an accent.
        public static let danger = Color(hex: 0xFF453A)

        // ── Accents ──────────────────────────────────────────────────────────

        public static func accent(_ domain: HelixDomain) -> Color { domain.accent }

        /// Anything that went the right way: a delta in the good direction, a
        /// session logged, a target met. Tide's green stop — the one accent that
        /// reads as "yes" without borrowing a traffic light.
        public static let good = HelixDomain.body.start

        /// A personal record. Ion's far stop: PRs belong to Train (§3.2) and a
        /// record is the brightest thing that domain produces, so it sits at the
        /// end of Train's mesh rather than on a fifth hue. The old palette spent
        /// gold on this; gold is gone.
        public static let record = HelixDomain.train.end

        /// The colour of a ROUTINE DAY — what tints a calendar ring, a session
        /// chip and the Today face — keyed onto the domains by what the day
        /// TRAINS, the same way `HelixDomain.forMuscle` keys a muscle.
        ///
        /// Upper-body sessions (chest/back, arms, push, pull) are Ion; leg
        /// sessions are Tide. The A/B variant is a fixed offset along the
        /// family's own mesh, so Upper A and Upper B are visibly the same family
        /// and visibly not the same day. A rest day is the ABSENCE of a session
        /// and wears no accent at all.
        public static func day(_ dayKey: String?) -> Color {
            switch dayKey {
            // Helix-5 (active)
            case "cb_a":    return HelixDomain.train.at(0)
            case "cb_b":    return HelixDomain.train.at(0.35)
            case "arms":    return HelixDomain.train.at(0.7)
            case "legs_a":  return HelixDomain.body.at(0)
            case "legs_b":  return HelixDomain.body.at(0.5)
            // Helix-4 (drawer) — mirrors its Helix-5 counterpart
            case "upper_a": return HelixDomain.train.at(0)
            case "upper_b": return HelixDomain.train.at(0.35)
            case "lower_a": return HelixDomain.body.at(0)
            case "lower_b": return HelixDomain.body.at(0.5)
            // PPL legacy — the split colours, since the day IS the split
            case "ppl_push_sun", "ppl_push_thu": return HelixDomain.train.at(0)
            case "ppl_pull_mon", "ppl_pull_fri": return HelixDomain.train.at(0.7)
            case "ppl_legs_tue":                 return HelixDomain.body.at(0)
            default:        return textSecondary
            }
        }

        /// Battery banding — the one place a traffic light is the right
        /// metaphor, because the number genuinely is a fuel gauge. Good above
        /// 60, Solar's amber through the middle, danger below 30, and a reading
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

/// Concentric squircles: an inner radius is its outer radius minus the padding
/// between them. Corners that are merely "all rounded" read as stickers.
public enum HelixCorner {
    /// A row inside a tile.
    public static let row: CGFloat = 12
    /// A tile on a screen.
    public static let tile: CGFloat = 20
    /// A presented sheet.
    public static let sheet: CGFloat = 32

    /// The inner radius for content inset by `padding` inside `outer`.
    public static func inner(_ outer: CGFloat, padding: CGFloat) -> CGFloat {
        max(0, outer - padding)
    }
}

// MARK: - Type roles

public extension View {

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

// MARK: - Sleep

/// The sleep-stage ramp, deep → awake, derived from Lunar.
///
/// Deep is the saturated end of the mesh and each lighter stage sits a fixed
/// step further along it, so the stacked bar still ramps light-to-dark by depth
/// — which is what made the old indigo/sapphire/cyan ramp legible — without a
/// hue that is not one of the four. Awake is not sleep at all and takes no
/// accent: it is the gap in the night, drawn as text-grey.
public enum HelixSleepStage: CaseIterable, Sendable {
    case deep, core, rem, awake

    public var color: Color {
        switch self {
        case .deep:  HelixDomain.recover.at(0)
        case .core:  HelixDomain.recover.at(0.45)
        case .rem:   HelixDomain.recover.at(0.9)
        case .awake: Color.helix.textTertiary
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
