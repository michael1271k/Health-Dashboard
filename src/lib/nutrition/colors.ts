/**
 * The global macro color system (Phase 15) — ONE source of truth used by every
 * ring, bar, chart, tile, and tag in the app. Bioluminescent mapping:
 */
export const MACRO_COLORS = {
  calories: '#16F5C3', // living teal — the brand hero
  protein:  '#3EE0FF', // plankton cyan
  carbs:    '#8B7CFF', // abyss violet
  fat:      '#FFB86B', // ember
} as const

export type MacroKey = keyof typeof MACRO_COLORS
