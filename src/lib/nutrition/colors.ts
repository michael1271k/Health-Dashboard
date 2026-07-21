/**
 * The global macro color system — ONE source of truth used by every
 * ring, bar, chart, tile, and tag in the app. Gym-neon mapping: molten fuel,
 * power red, electric glycogen, amber — masculine + premium on the dark Aurora.
 */
export const MACRO_COLORS = {
  calories: '#FF6A3D', // molten fuel — the energetic hero (was a weak violet)
  protein:  '#FF2D55', // power red — muscle
  carbs:    '#22D3EE', // electric cyan — glycogen / energy
  fat:      '#FFB020', // amber gold
} as const

export type MacroKey = keyof typeof MACRO_COLORS
