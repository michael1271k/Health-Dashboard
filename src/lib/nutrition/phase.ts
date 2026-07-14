/**
 * Daily nutrition phase, derived from the day's calories — current bands:
 *   CUT DAY      ≤ 2,050 kcal
 *   MAINTENANCE  2,051 – 2,449 kcal
 *   BULK         ≥ 2,450 kcal
 * (Re-derive bands manually after any bodyweight change > 2 kg.)
 * Computed at write time and stored on nutrition_entries.phase (the DB is the
 * source of truth), with this function as a client-side fallback for old rows.
 */
export type Phase = 'cut' | 'maintenance' | 'bulk'

export function derivePhase(calories: number | null | undefined): Phase | null {
  if (calories == null || !Number.isFinite(calories) || calories <= 0) return null
  if (calories <= 2050) return 'cut'
  if (calories < 2450) return 'maintenance'
  return 'bulk'
}

export const PHASE_META: Record<Phase, { label: string; color: string }> = {
  cut:         { label: 'Cut',   color: '#38E1FF' }, // cyan — lean/cool
  maintenance: { label: 'Maint', color: '#43F59B' }, // mint — balanced
  bulk:        { label: 'Bulk',  color: '#FFB020' }, // amber — surplus
}
