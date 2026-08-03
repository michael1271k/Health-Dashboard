/**
 * HELIX palette — "Obsidian & Ember, Refined".
 *
 * ONE source of truth for every colour in the app. Nothing should hardcode a hex
 * outside this file; components import these constants (hex strings, so the
 * `${color}1a` alpha-suffix pattern keeps working) and CSS reads the mirrored
 * custom properties declared in globals.css.
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
export const GOLD = '#D4AF37'
export const GOLD_DEEP = '#A88722'
export const AMETHYST = '#8A6FA8'
export const PLUM = '#6B4E7D'
export const PLATINUM = '#C9CDD6'
export const STEEL = '#8E9AAC'
export const OXIDE = '#C4514E'

// ── Semantic ─────────────────────────────────────────────────────────────────
export const TEXT = '#ECEEF2'
export const MUTED = '#79808C'
export const DIM = '#5A6472'
export const SUCCESS = EMERALD
export const DANGER = OXIDE
export const WARN = GOLD

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

/** Broad muscle display groups. */
export const GROUP = {
  Chest: EMBER,
  Back: SAPPHIRE,
  Shoulders: GOLD,
  Arms: PLATINUM,
  Legs: AMETHYST,
  Core: EMERALD,
} as const

/** The 13 landmark muscles — a full jewel ramp, all distinguishable. */
export const MUSCLE = {
  Chest: EMBER,
  Back: SAPPHIRE,
  'Side delts': GOLD,
  'Rear delts': BRONZE,
  Biceps: AMETHYST,
  Triceps: COPPER,
  Forearms: PLUM,
  Quads: EMBER_DEEP,
  Hamstrings: EMERALD_DEEP,
  Glutes: SAPPHIRE_DEEP,
  Adductors: STEEL,
  Calves: EMERALD,
  'Abs/core': PLATINUM,
} as const

/** Ordered series for charts with N arbitrary categories. */
export const SERIES = [EMBER, SAPPHIRE, GOLD, EMERALD, AMETHYST, COPPER, PLATINUM, PLUM] as const
