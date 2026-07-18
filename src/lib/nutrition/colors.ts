/**
 * The global macro color system — ONE source of truth used by every
 * ring, bar, chart, tile, and tag in the app. Bioluminescent mapping:
 */
export const MACRO_COLORS = {
  calories: '#8B5CF6', // living teal — the brand hero
  protein:  '#22D3EE', // plankton cyan
  carbs:    '#EC4899', // abyss violet
  fat:      '#FBBF24', // ember
} as const

export type MacroKey = keyof typeof MACRO_COLORS
