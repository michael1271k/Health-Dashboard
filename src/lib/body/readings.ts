/**
 * Body readings, joined and judged — PURE, extracted from
 * `BodyCompositionChart` and `InBody` so the merge can be vectored and ported.
 */
import type { BodyTrendRow, BodyDetailRow } from '@/lib/hooks/useCharts'

export interface BodyCompositionPoint {
  date: string
  weight: number | null
  /** Weight × muscle% — skeletal muscle only. Null when muscle% wasn't measured. */
  muscleMass: number | null
  /** Weight − fat mass. Includes bone, water and organs, so it always runs higher. */
  fatFreeMass: number | null
  fatMass: number | null
  fatPct: number | null
  water: number | null
  musclePct: number | null
  visceral: number | null
}

/**
 * Join the two body-composition sources by date.
 *
 * `useWeightTrend` carries weight / fat% / muscle mass (unioned from the
 * `body_composition` ledger and `daily_logs`); `useBodyDetailTrend` carries the
 * scale's extra readings. Both are read-only here — nothing is derived except
 * fat mass and lean mass, which are simple products of numbers already present.
 *
 * TWO series, never one: `fatFreeMass` (weight − fat) and `muscleMass` are ~2.6 kg
 * apart, and a single line that switched definitions stepped up 2.6 kg on the
 * day HealthKit began filling body fat. Each stays null where its inputs are
 * missing rather than borrowing the other one's value.
 */
export function mergeBodyComposition(
  trend: BodyTrendRow[],
  detail: BodyDetailRow[],
  toDisplay: (kg: number | null) => number | null,
): BodyCompositionPoint[] {
  const byDate = new Map<string, BodyCompositionPoint>()
  const blank = (date: string): BodyCompositionPoint => ({
    date, weight: null, muscleMass: null, fatFreeMass: null, fatMass: null,
    fatPct: null, water: null, musclePct: null, visceral: null,
  })

  for (const r of trend) {
    const p = byDate.get(r.date) ?? blank(r.date)
    p.weight = toDisplay(r.weight_kg)
    p.fatPct = r.body_fat_pct ?? p.fatPct
    if (r.weight_kg != null && r.body_fat_pct != null) {
      const fatKg = (r.weight_kg * r.body_fat_pct) / 100
      p.fatMass = toDisplay(fatKg)
      p.fatFreeMass = toDisplay(r.weight_kg - fatKg)
    } else if (r.fat_free_mass_kg != null) {
      p.fatFreeMass = toDisplay(r.fat_free_mass_kg)
    }
    if (r.muscle_mass_kg != null) p.muscleMass = toDisplay(r.muscle_mass_kg)
    byDate.set(r.date, p)
  }

  for (const r of detail) {
    const p = byDate.get(r.date) ?? blank(r.date)
    p.water = r.water_percent ?? p.water
    p.musclePct = r.muscle_percent ?? p.musclePct
    p.visceral = r.visceral_fat ?? p.visceral
    p.fatPct = p.fatPct ?? r.body_fat_pct ?? null
    byDate.set(r.date, p)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** The columns a smart scale can fill — any one of them makes the day a weigh-in. */
export const SCALE_METRIC_KEYS = [
  'weight_kg', 'body_fat_pct', 'muscle_percent', 'water_percent', 'muscle_mass_kg',
  'fat_free_mass_kg', 'bone_mineral', 'visceral_fat', 'bmr', 'bmi',
  'skeletal_muscle_mass_kg', 'estimated_waist_to_hip_ratio',
] as const

/**
 * Does this day have ANY scale reading at all? Decides which face the Body
 * panel wears, so it has to agree with what the InBody form writes.
 */
export function hasScaleMetrics(log: Record<string, unknown> | null | undefined): boolean {
  if (!log) return false
  return SCALE_METRIC_KEYS.some((k) => log[k] != null)
}
