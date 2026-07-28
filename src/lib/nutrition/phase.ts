/**
 * Daily nutrition phase, derived from the day's calories — current bands:
 *   CUT DAY      ≤ 2,050 kcal
 *   MAINTENANCE  2,051 – 2,449 kcal
 *   BULK         ≥ 2,450 kcal
 * (Re-derive bands manually after any bodyweight change > 2 kg.)
 * Computed at write time and stored on nutrition_entries.phase (the DB is the
 * source of truth), with this function as a client-side fallback for old rows.
 */
import { HELIX_CUT_START } from '@/lib/programs'

export type Phase = 'cut' | 'maintenance' | 'bulk'

export function derivePhase(calories: number | null | undefined): Phase | null {
  if (calories == null || !Number.isFinite(calories) || calories <= 0) return null
  if (calories <= 2050) return 'cut'
  if (calories < 2450) return 'maintenance'
  return 'bulk'
}

// GLOBAL phase colours — standardized across dashboard, settings, day chips and
// analytics, independent of the active plan: Cut is always red/orange, Bulk always
// green, Maintenance steel. Import PHASE_COLORS anywhere a phase needs a colour.
export const PHASE_COLORS: Record<Phase, string> = {
  cut:         '#E0653C', // red/orange — deficit
  maintenance: '#8E9AAC', // steel — balanced
  bulk:        '#3E9E7A', // green — surplus
}

export const PHASE_META: Record<Phase, { label: string; color: string }> = {
  cut:         { label: 'Cut',   color: PHASE_COLORS.cut },
  maintenance: { label: 'Maint', color: PHASE_COLORS.maintenance },
  bulk:        { label: 'Bulk',  color: PHASE_COLORS.bulk },
}

/**
 * Era-aware phase tag: cut days on/after HELIX_CUT_START (2026-07-15) belong to
 * the Helix Cut block and are labeled accordingly; everything earlier keeps
 * the plain PHASE_META label. Use this wherever a per-day phase chip renders.
 */
export function phaseDisplay(phase: Phase, dateISO: string): { label: string; color: string } {
  const meta = PHASE_META[phase]
  if (phase === 'cut' && dateISO >= HELIX_CUT_START) return { ...meta, label: 'Cut' }
  return meta
}
