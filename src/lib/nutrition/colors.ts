/**
 * Macro colours — re-exported from the single palette source of truth.
 * Never hardcode a macro hex; import MACRO_COLORS (or `MACRO` from the palette).
 */
import { MACRO } from '@/lib/theme/palette'

export const MACRO_COLORS = MACRO

export type MacroKey = keyof typeof MACRO_COLORS
