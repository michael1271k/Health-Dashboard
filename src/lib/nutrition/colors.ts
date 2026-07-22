/**
 * The global macro color system — ONE source of truth used by every
 * ring, bar, chart, tile, and tag in the app. Gym-neon mapping: molten fuel,
 * power red, electric glycogen, amber — masculine + premium on the dark Aurora.
 */
export const MACRO_COLORS = {
  calories: '#A3E635', // electric lime — sleek gym energy (not orange/purple)
  protein:  '#FF2D95', // magenta / pink — muscle
  carbs:    '#22D3EE', // electric cyan — glycogen / energy
  fat:      '#FBBF24', // amber
} as const

export type MacroKey = keyof typeof MACRO_COLORS
