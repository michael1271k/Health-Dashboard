/**
 * Daily nutrition phase, derived from the day's calories with safe non-overlapping
 * margins. Hardcoded per spec:
 *   Cut         ~1935 kcal (180P/180C/55F)   → < 2150
 *   Maintenance  2300–2450 kcal               → 2150–2549
 *   Bulk         2600+ kcal                    → ≥ 2550
 * This is computed at write time and stored on nutrition_entries.phase (the DB is
 * the source of truth), with this function as a client-side fallback for old rows.
 */
export type Phase = 'cut' | 'maintenance' | 'bulk'

export function derivePhase(calories: number | null | undefined): Phase | null {
  if (calories == null || !Number.isFinite(calories) || calories <= 0) return null
  if (calories < 2150) return 'cut'
  if (calories < 2550) return 'maintenance'
  return 'bulk'
}

export const PHASE_META: Record<Phase, { label: string; color: string }> = {
  cut:         { label: 'Cut',   color: '#38E1FF' }, // cyan — lean/cool
  maintenance: { label: 'Maint', color: '#43F59B' }, // mint — balanced
  bulk:        { label: 'Bulk',  color: '#FFB020' }, // amber — surplus
}
