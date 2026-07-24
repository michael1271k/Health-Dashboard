/**
 * The global macro color system — ONE source of truth used by every ring, bar,
 * chart, tile and tag. Obsidian & Ember: molten ember leads (calories are the
 * hero), then brass / slate / olive — four clearly distinguishable tones that
 * stay muted and premium. No neon.
 */
export const MACRO_COLORS = {
  calories: '#E2683A', // molten ember — the hero ring
  protein:  '#C9A227', // brass — the muscle macro
  carbs:    '#6E8CA0', // slate blue — glycogen
  fat:      '#8A9A5B', // olive — fats
} as const

export type MacroKey = keyof typeof MACRO_COLORS
