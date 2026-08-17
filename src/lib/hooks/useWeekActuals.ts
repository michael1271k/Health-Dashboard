'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { WeekActuals } from '@/lib/reports/targetVerdict'

/**
 * This week's daily averages for the metrics a report can prescribe.
 *
 * ── AVERAGED OVER DAYS WITH DATA, NOT OVER THE WEEK ──────────────────────────
 * A week in progress has days that have not happened yet, and a HealthKit sync
 * that has not run leaves a real day with no row at all. Dividing by seven — or
 * by "days elapsed" — turns both of those into a shortfall you did not have, and
 * the comparison table would spend every Monday and Tuesday reporting that you
 * are failing targets you have had one day to meet.
 *
 * So each metric averages over the days that actually carry it, INDEPENDENTLY:
 * water is logged in the app and lands immediately, steps arrive from a device
 * sync, and calories only exist on days something was logged. They routinely
 * cover different day counts, and averaging them together would let a missing
 * step sync move your protein average.
 */
export function useWeekActuals(weekStart: string, today: string) {
  return useQuery({
    queryKey: ['week_actuals', weekStart, today],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<WeekActuals> => {
      const [logs, food] = await Promise.all([
        supabase.from('daily_logs').select('date, steps, water_ml')
          .gte('date', weekStart).lte('date', today),
        // Nutrition is one row per meal type, so it sums per DATE first and only
        // then averages — otherwise a four-meal day counts four times against a
        // one-meal day in the same mean.
        supabase.from('nutrition_entries').select('date, calories, protein_g')
          .gte('date', weekStart).lte('date', today),
      ])

      const L = (logs.data ?? []) as Array<{ date: string; steps: number | null; water_ml: number | null }>
      const F = (food.data ?? []) as Array<{ date: string; calories: number | null; protein_g: number | null }>

      const byDate = new Map<string, { kcal: number; protein: number }>()
      for (const r of F) {
        const cur = byDate.get(r.date) ?? { kcal: 0, protein: 0 }
        byDate.set(r.date, {
          kcal: cur.kcal + (r.calories ?? 0),
          protein: cur.protein + (r.protein_g ?? 0),
        })
      }
      const days = [...byDate.values()]

      return {
        waterL: mean(L.map((r) => (r.water_ml != null ? Number(r.water_ml) / 1000 : null))),
        steps: mean(L.map((r) => r.steps)),
        kcal: mean(days.map((d) => (d.kcal > 0 ? d.kcal : null))),
        proteinG: mean(days.map((d) => (d.protein > 0 ? d.protein : null))),
      }
    },
  })
}

/** Mean of the values that exist. Null — not zero — when none do. */
function mean(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}
