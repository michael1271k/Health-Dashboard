/**
 * HELIX palette — "Obsidian & Ember, Refined".
 *
 * ONE source of truth for every colour in the app.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *   Runtime values come from HERE.
 *   CSS-only surfaces use `--color-*` in globals.css.
 *   A `--color-*` token exists only if something consumes it.
 *
 * That split is not stylistic, it is forced: the `${EMBER}1a` alpha-suffix
 * idiom needs a real hex string, and `var(--color-primary)` cannot be suffixed.
 * So anything interpolated into `style={{}}`, passed as a prop, or handed to
 * recharts imports from this file; Tailwind utilities and rules inside
 * globals.css use the token. Prefer `alpha()` below over string concatenation
 * in new code.
 *
 * The brief: premium and serious, but NOT flat black-and-orange. Real jewel
 * tones — deep sapphire, muted emerald, antique gold, platinum — over obsidian,
 * with a richer copper-ember as the signature. Saturation stays low enough that
 * nothing reads neon; every hue is "aged metal / gemstone", never candy.
 */

// ── Base surfaces ────────────────────────────────────────────────────────────
export const OBSIDIAN = '#0A0B0D'
export const GRAPHITE = '#121418'
export const SLATE_SURFACE = '#1A1D23'
export const HAIRLINE = '#23262B'

// ── Signature + jewel accents ────────────────────────────────────────────────
/** Evolved ember: warmer and richer than the old flat orange. */
export const EMBER = '#E0703C'
export const EMBER_DEEP = '#B4522A'
export const COPPER = '#C97A45'
export const BRONZE = '#9C6B3F'

export const SAPPHIRE = '#3D7AB8'
export const SAPPHIRE_DEEP = '#2E5C8A'
export const EMERALD = '#3E9E7A'
export const EMERALD_DEEP = '#2F7D63'
/**
 * The pale end of the emerald ramp — the light source on a COMPLETED surface.
 *
 * Promoted rather than spelled inline because a gradient needs three stops to
 * read as lit rather than as two colours meeting, and "done" is now a ramp in
 * two places (a ticked set row and its tick) that must agree.
 */
export const EMERALD_LIGHT = '#5FBF98'
/**
 * The effort ladder's fourth rung, and nothing else.
 *
 * The per-set RPE ramp runs EMERALD → SAND → EMBER → OXIDE → GARNET. Adding an
 * 8.0 stop between "Medium" (7.5) and "Hard" (8.5) put THREE consecutive stops
 * — 8, 8.5, 9 — inside the same EMBER band, so the control's whole purpose (you
 * can see at a glance which rung you are on) failed at exactly the rung that
 * was added to make the distinction.
 *
 * Not GOLD, which means a personal record app-wide (`WEEK_STATE.pr`); this is
 * hotter and less yellow, so a lit 8.0 pip cannot be mistaken for a PR marker
 * sitting in a row of effort dots.
 */
export const AMBER = '#E0A03C'
export const GOLD = '#D4AF37'
export const GOLD_DEEP = '#A88722'
export const AMETHYST = '#8A6FA8'
export const PLUM = '#6B4E7D'
/**
 * Drop sets, and drop sets only.
 *
 * Brighter and bluer than AMETHYST because AMETHYST is already spoken for as a
 * DAY colour (Legs, Delts & Arms, Shoulders) — a drop-set chip in the day's own
 * hue says nothing, which is exactly what the chip is for. Promoted here from a
 * bare literal in `ExerciseBreakdown` now that the logger, the ledger and the
 * session header all read the same tag table.
 */
export const DROPSET = '#9A6DD7'
export const PLATINUM = '#C9CDD6'
export const STEEL = '#8E9AAC'
export const OXIDE = '#C4514E'
/** Wine — skeletal muscle. Promoted from BodyMap's local `ROSE #E0567A`, which
 *  was a candy pink with no place on the jewel ramp and sat too close to OXIDE. */
export const GARNET = '#B4526B'
/** Bone / mineral. Promoted from BodyMap's local orphan, value unchanged. */
export const BONE = '#E6EAF0'
/** The travel/deload tone. Promoted from `PPL_RGB.maintenance`, which was a
 *  nameless triple in phases.ts. It is a deliberate "away" colour, not a mistake. */
export const SAND = '#E6C68C'
/**
 * The muscle atlas's own blue — the default tint for a worked muscle.
 *
 * Brighter and cooler than SAPPHIRE, which is a UI accent and reads as muted
 * navy against the greyscale body. This one has to survive being laid over
 * shaded grey at 20% alpha on a 24px thumbnail and still say "lit".
 *
 * It is a DEFAULT, not a law: `MuscleFocus` still passes the session's own day
 * colour, which is what makes an Upper B report gold from the title to the body.
 */
export const ATLAS_BLUE = '#3FA9F5'

// ── Semantic ─────────────────────────────────────────────────────────────────
export const TEXT = '#ECEEF2'
export const MUTED = '#79808C'
export const DIM = '#5A6472'
// SUCCESS (= EMERALD) and WARN (= GOLD) removed 2026-08-12: zero importers.
// Semantic aliases only earn their keep when call sites actually use them, and
// every one of these reached for the jewel tone directly. DANGER survives
// because SetEditorRow does use it.
export const DANGER = OXIDE

/**
 * Apply an alpha to a palette hex.
 *
 * The codebase is full of `${EMBER}1a` — correct, but it makes you do hex in
 * your head and it silently produces garbage if the base ever gains an alpha of
 * its own. Prefer this in new code; existing suffixes are fine where they are.
 */
export function alpha(hex: string, a: number): string {
  const clamped = Math.max(0, Math.min(1, a))
  return `${hex}${Math.round(clamped * 255).toString(16).padStart(2, '0')}`
}

/**
 * `#E0703C` → `'224,112,60'`, for the `rgba(${triple}, 0.12)` idiom.
 *
 * Hand-transcribing a hex into decimals is how `PHASE_RGB.cut` came to be
 * `224,101,60` — eleven units of green off EMBER, a phantom second orange that
 * nobody chose and no eye would catch. Derive the triple; never type it.
 */
export function rgbTriple(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

/**
 * Macros — four distinct jewel tones so the rings read instantly apart.
 * Calories lead with the signature ember; protein is emerald (growth), carbs
 * sapphire (glycogen/fuel), fat antique gold.
 */
export const MACRO = {
  calories: EMBER,
  protein: EMERALD,
  carbs: SAPPHIRE,
  fat: GOLD,
} as const

/**
 * Sleep stages — ONE MONOTONIC DEPTH RAMP, surfacing dark to light.
 *
 * The stages used to borrow four unrelated tones: AMETHYST for deep, SAPPHIRE
 * for REM, STEEL for core, OXIDE for awake. Two problems, both visible on every
 * night's arc.
 *
 * STEEL (#8E9AAC) and SAPPHIRE (#3D7AB8) are neighbours in hue AND close in
 * value, and Core and REM are the two largest segments of a typical night — so
 * more than half the arc rendered as one indistinct band. A stage split you
 * cannot separate is not a stage split.
 *
 * And awake was OXIDE, the danger colour, the same red an over-target day gets.
 * Waking up in the night is not an error; it is a fact about the night. Warm
 * sand pulls it clean out of the blue ramp on hue alone, which is a separation
 * that survives greyscale and colour-blindness both.
 *
 * Ordered deep → core → rem → awake so the gradient walks a single continuous
 * ascent out of sleep rather than zig-zagging in value. `SleepStages.STAGES`
 * must stay in this order for the arc to read as one ramp.
 */
export const SLEEP = {
  deep: '#4C3F82',    // indigo — the floor of the night
  core: '#3D7AB8',    // sapphire — the bulk of it
  rem: '#5FA8C7',     // cyan — dreaming, nearer the surface
  awake: '#C98A5E',   // warm sand — an interruption, not a failure
} as const

/** Training splits — one jewel tone each, no collisions. */
export const SPLIT = {
  push: EMBER,
  pull: SAPPHIRE,
  legs: AMETHYST,
  upper: GOLD,
  lower: EMERALD,
} as const

/**
 * Workout-day identity — ONE colour per program day key, globally.
 *
 * This is the plan's own `ProgramDay.color` (programs.ts reads it from here, so
 * there is a single definition). It was a local `C` map inside programs.ts where
 * `arms` and `legs_b` were BOTH emerald: a Delts & Arms report and a Legs & Core
 * B report were the same colour, which is precisely the distinction the colour
 * exists to make. Within one plan every day is now distinguishable; a key
 * repeats across plans only where the day means the same thing (Helix-5 `cb_a`
 * and Helix-4 `upper_a` are the same session under two names).
 */
export const DAY_COLOR: Record<string, string> = {
  // Helix-5 (active)
  cb_a: STEEL,        // Upper A · Chest + Back
  legs_a: SAPPHIRE,   // Legs & Core A · Quad focus
  arms: AMETHYST,     // Delts & Arms
  cb_b: GOLD,         // Upper B · Chest + Back
  legs_b: EMERALD,    // Legs & Core B · Posterior focus
  // Helix-4 (drawer) — mirrors its Helix-5 counterpart
  upper_a: STEEL,
  lower_a: SAPPHIRE,
  upper_b: GOLD,
  lower_b: EMERALD,
  // PPL legacy — the split colours, since the day IS the split
  ppl_push_sun: EMBER,
  ppl_push_thu: EMBER,
  ppl_pull_mon: SAPPHIRE,
  ppl_pull_fri: SAPPHIRE,
  ppl_legs_tue: AMETHYST,
}

/**
 * The colour for a logged session: its `day_key` first, then `split_day` as a
 * fallback for rows imported before day keys existed, then steel.
 */
export function dayColor(dayKey?: string | null, splitDay?: string | null): string {
  if (dayKey && DAY_COLOR[dayKey]) return DAY_COLOR[dayKey]
  const s = splitDay?.toLowerCase()
  if (s && s in SPLIT) return SPLIT[s as keyof typeof SPLIT]
  return STEEL
}

/**
 * Split accent for a `split_day` string, with no day key available.
 *
 * The same lookup `dayColor` falls back to. It lived in types/workout.ts and
 * VolumeChart had a private THIRD copy over five local hexes where Upper A and
 * Legs B were both steel — a visible collision in a chart whose entire job is
 * telling those two apart. One implementation now; workout.ts re-exports this
 * so its call sites do not have to move in the same commit that changes values.
 */
export function splitColor(split?: string | null): string {
  return dayColor(null, split)
}

/**
 * ── MUSCLE COLOUR: SIX FAMILIES, ONE SYSTEM ──────────────────────────────────
 *
 * These two maps used to contradict each other. `GROUP` painted Legs AMETHYST
 * while `MUSCLE` painted Quads EMBER_DEEP, Hamstrings EMERALD_DEEP and Glutes
 * SAPPHIRE_DEEP — three unrelated hues inside one violet family. A radar chart
 * and a volume chart of the same workout shared no visual language, because the
 * 13 landmarks had been chosen for mutual distinguishability alone, with no
 * reference to the 6 groups above them.
 *
 * `GROUP.Shoulders` was also GOLD, which `WEEK_STATE.pr` reserves app-wide for a
 * personal record. Gold now means that and nothing else.
 *
 * The system is three levels:
 *   1. six FAMILY hues, spread across the wheel so no two neighbour each other
 *   2. each landmark is a STEP inside its family's ramp, light → dark
 *   3. an exercise nudges one step within its landmark (see `muscleHue.ts`)
 *
 * Ramp steps are literal hexes rather than computed, because recharts needs a
 * real string for the `${EMBER}1a` alpha idiom and a lookup table is testable in
 * a way a colour-space conversion is not.
 */

/** Broad muscle display groups — the six family hues. */
export const GROUP = {
  Chest: EMBER,        // the signature hue keeps the signature muscle
  Back: EMERALD,
  Shoulders: AMETHYST, // frees GOLD for records
  Arms: COPPER,        // warm, adjacent to Chest, still clearly separable
  Legs: SAPPHIRE,
  Core: STEEL,         // neutral substrate
} as const

/**
 * The 16 landmark muscles as ramp positions inside their family.
 *
 * A family with one landmark sits on the base hue. A family with several ramps
 * light → dark, deepest for the biggest muscle, so the ORDER carries meaning
 * rather than just separating the cells.
 */
export const MUSCLE = {
  // Chest · Core — one landmark each, so each is its family base.
  Chest: EMBER,
  'Abs/core': STEEL,

  // Back — emerald, three steps. It used to be ONE landmark called `Back`,
  // which meant a pulldown and a rack pull scored against the same weekly
  // number and Hevy's own breakdown could not be compared to ours line by line.
  // The atlas already drew the trapezius, the lats and the erector column as
  // separate shapes; now they are separate muscles as well. Lats keeps the old
  // emerald because it is the one that carries most of the week's back volume.
  Lats: EMERALD,
  'Upper back': '#5FBF9B',
  'Lower back': EMERALD_DEEP,

  // Shoulders — amethyst, three steps. Front delts is the lightest because it
  // is the most assisted head: almost all of its weekly volume arrives as
  // pressing assistance rather than direct work, and the ramp reads that way.
  'Front delts': '#BFA6D4',
  'Side delts': '#A085BC',
  'Rear delts': '#6E5589',

  // Arms — copper, three steps.
  Forearms: '#DB9A6E',
  Biceps: COPPER,
  Triceps: '#A6602F',

  // Legs — sapphire, five steps. Calves deepest, adductors lightest.
  Adductors: '#7FA9D4',
  Quads: '#5B93CC',
  Hamstrings: SAPPHIRE,
  Glutes: SAPPHIRE_DEEP,
  Calves: '#24486B',
} as const

/** Ordered series for charts with N arbitrary categories. */
/**
 * Per-plan chip colour — which PROGRAMME a week belongs to.
 *
 * Helix-5 gets a premium iridescent violet of its own, Helix-4 an aqua, and the
 * PPL legacy era a deliberate muted grey so a week from before the rebuild
 * cannot be mistaken for a current one.
 *
 * Lives here rather than in `BrandHeader` because the dashboard is no longer
 * the only surface that names a plan: the session report tags itself the same
 * way, and two copies of a colour table is how one of them ends up a release
 * behind.
 */
export const PLAN_CHIP: Record<string, string> = {
  apex51: '#8B7CF6', // Helix-5 — premium violet
  axis4: '#5FB8E8',  // Helix-4 — aqua
  ppl: '#79808C',    // legacy — muted
}

export const SERIES = [EMBER, SAPPHIRE, GOLD, EMERALD, AMETHYST, COPPER, PLATINUM, PLUM] as const

/**
 * Body composition — ONE HUE PER SUBSTANCE.
 *
 * Percent and mass of the same substance deliberately share a hue: muscle mass
 * and muscle % are the same thing measured two ways, and colouring them apart
 * would imply they are not. What must differ is substances that CO-OCCUR:
 *
 *   mass family    weight · lean · muscle · fat        → 4 distinct ✓
 *   percent family fat% · muscle% · water%             → 3 distinct ✓
 *   BodyMap strata water · protein · mineral · fat     → 4 distinct ✓
 *
 * This replaces four unreconciled schemes: BodyCompositionChart's local COLORS
 * (where lean/musclePct were BOTH emerald and fatMass/fatPct BOTH gold — two
 * real collisions), BodyMap's five local hexes, InBody's verdict tones, and the
 * dashboard's BODY_TILES where nine of ten metrics had no colour at all.
 */
export const BODY = {
  /** The total that everything else partitions. */
  weight: PLATINUM,
  /** Fat-free mass. */
  lean: EMERALD,
  /** Skeletal muscle — mass AND percent. */
  muscle: GARNET,
  /** Fat mass AND body-fat percent. */
  fat: GOLD,
  water: SAPPHIRE,
  protein: EMERALD_DEEP,
  mineral: BONE,
  /** An index, not a tissue — so it takes the neutral data tone. */
  bmi: STEEL,
  bmr: COPPER,
} as const

/**
 * Visceral fat is deliberately NOT in BODY.
 *
 * It is the only body metric where high is bad, and it is a 1–20 rating rather
 * than a tissue you can weigh — so it is coloured by verdict, reusing the
 * convention InBody already uses for its good/bad/neutral tiles. Keeping OXIDE
 * out of the body domain is also what keeps GARNET (wine) legible beside it
 * (brick): the two never appear together.
 */
export function visceralColor(v: number | null | undefined): string {
  if (v == null) return MUTED
  return v <= 9 ? EMERALD : v <= 14 ? GOLD : OXIDE
}

/**
 * Timeline week states — one channel per meaning.
 *
 * Gold used to signal three different things on the same capsule at the same
 * time: a ready week, a week containing PRs, and a calendar-complete week —
 * plus the report link. Three meanings in one colour is no signal at all.
 *
 * Now each has its own channel as well as its own colour: `ready` is the aura,
 * `pr` is the trophy chip, `complete` is a flat chip with no glow. The spine dot
 * is not in this map on purpose — it carries the week's own split colour,
 * because a dot on a timeline is IDENTITY, never status.
 */
export const WEEK_STATE = {
  /** Every scheduled session done. Can fire mid-week. */
  ready: EMERALD,
  /** A record was set. Gold means this and nothing else, app-wide. */
  pr: GOLD,
  /** The calendar week is over. A statement about time, not merit — so it recedes. */
  complete: STEEL,
  /** A document to read, not an award. */
  report: SAPPHIRE,
} as const
