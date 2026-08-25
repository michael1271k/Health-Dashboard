'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalDaysAgoISO } from '@/lib/utils/day'
import { validWeight } from '@/lib/utils/units'
import { tdeeKcal } from '@/lib/nutrition/energy'

export interface EnergyDay {
  date: string
  intake: number | null
  tdee: number | null
  /** `intake − tdee`. Negative is a deficit. Null unless BOTH sides are known. */
  balance: number | null
  weightKg: number | null
}

/** 7,700 kcal per kilogram of body fat — the standard energy-density figure. */
export const KCAL_PER_KG = 7700

/**
 * Intake against expenditure, day by day, and what the scale said.
 *
 * ── WHY THE BALANCE IS ALL-OR-NOTHING ────────────────────────────────────────
 * `tdeeKcal` returns null unless BMR, active energy and intake are all present,
 * deliberately: a missing active-energy sync treated as zero would report a
 * ~400 kcal larger deficit than the day earned, and a ledger that runs one
 * direction wrong on the days a sync failed accumulates that error rather than
 * averaging it out. So a day with a hole in it contributes NOTHING to the
 * ledger and is drawn as a gap, and the tile says how many days it is actually
 * summing rather than implying it has the whole window.
 *
 * ── AND WHY THE SCALE RIDES ALONG ────────────────────────────────────────────
 * The energy ledger predicts a rate. The scale measures one. They disagree —
 * always, because water, glycogen and gut content move faster than fat does —
 * and the honest thing for a widget to do is show both rather than pick the one
 * that flatters the week. `weight_kg` here is the stored daily reading, run
 * through `validWeight` so a carried-forward zero cannot enter the regression.
 */
export function useEnergyBalance(days = 30) {
  return useQuery({
    queryKey: ['energy_balance', days],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EnergyDay[]> => {
      const from = logicalDaysAgoISO(days)
      const [logsRes, nutritionRes] = await Promise.all([
        supabase.from('daily_logs').select('date, bmr, active_energy, weight_kg').gte('date', from).order('date', { ascending: true }),
        supabase.from('nutrition_entries').select('date, calories').eq('meal_type', 'daily').gte('date', from),
      ])

      const logs = (logsRes.data ?? []) as Array<{
        date: string; bmr: number | null; active_energy: number | null; weight_kg: number | null
      }>
      const intake = new Map(
        ((nutritionRes.data ?? []) as Array<{ date: string; calories: number | null }>)
          .map((r) => [r.date, r.calories]),
      )

      return logs.map((r) => {
        const kcal = intake.get(r.date) ?? null
        const tdee = tdeeKcal(r.bmr, r.active_energy, kcal)
        return {
          date: r.date,
          intake: kcal,
          tdee,
          balance: kcal != null && tdee != null ? Math.round(kcal - tdee) : null,
          weightKg: validWeight(r.weight_kg),
        }
      })
    },
  })
}

/**
 * The slope of a weight series, in kg per week, by least squares.
 *
 * ── A SLOPE, NOT FIRST-MINUS-LAST ────────────────────────────────────────────
 * Two readings a fortnight apart can differ by a kilo of water and nothing else,
 * so "latest minus earliest ÷ weeks" is a rate computed from precisely the two
 * noisiest numbers in the window. A regression uses every reading there is,
 * which is the whole point of having weighed yourself twenty times.
 *
 * Returns null under three readings: a line through two points is not a trend,
 * it is a line through two points.
 */
export function weeklyRateKg(rows: Array<{ date: string; weightKg: number | null }>): number | null {
  const pts = rows
    .filter((r): r is { date: string; weightKg: number } => r.weightKg != null)
    .map((r) => ({ t: Date.parse(`${r.date}T12:00:00Z`) / 86_400_000, w: r.weightKg }))
  if (pts.length < 3) return null
  const n = pts.length
  const mt = pts.reduce((a, p) => a + p.t, 0) / n
  const mw = pts.reduce((a, p) => a + p.w, 0) / n
  let num = 0
  let den = 0
  for (const p of pts) {
    num += (p.t - mt) * (p.w - mw)
    den += (p.t - mt) ** 2
  }
  if (den === 0) return null
  return Math.round((num / den) * 7 * 100) / 100
}
