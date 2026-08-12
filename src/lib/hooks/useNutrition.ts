'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { derivePhase, type Phase } from '@/lib/nutrition/phase'
import { logicalTodayISO, logicalDaysAgoISO } from '@/lib/utils/day'

export interface DailyLog {
  date: string
  calories:  number | null
  proteinG:  number | null
  carbsG:    number | null
  fatG:      number | null
  steps:     number | null
  activeCal: number | null
  score:     number | null
  batteryPct: number | null
  phase:     Phase | null
  /** Declared nutrition exception, or null for an ordinary day. The day was
   *  ALLOWED to miss its calorie target — see `lib/nutrition/exceptionDay.ts`. */
  exception: string | null
  /** The intake figures are a best guess (ate out, could not weigh). Orthogonal
   *  to `exception` and forgives nothing — see `estimatedTag`'s note. */
  estimated: boolean
}

function todayISO() {
  return logicalTodayISO()
}
function daysAgoISO(n: number) {
  return logicalDaysAgoISO(n)
}

/**
 * Daily fuel/score rows. Accepts either a rolling window in days (legacy
 * callers: home fuel widget) or an explicit inclusive {from,to} range — the
 * era filter passes `eraDateRange(era)` so historical eras are never clipped.
 */
export function useDailyLogs(daysOrRange: number | { from: string; to: string } = 30) {
  return useQuery({
    queryKey: ['daily_logs', typeof daysOrRange === 'number' ? daysOrRange : `${daysOrRange.from}_${daysOrRange.to}`],
    queryFn: async (): Promise<DailyLog[]> => {
      const from = typeof daysOrRange === 'number' ? daysAgoISO(daysOrRange) : daysOrRange.from
      const to   = typeof daysOrRange === 'number' ? todayISO() : daysOrRange.to

      const [nutritionRes, metricsRes, scoresRes, exceptionsRes] = await Promise.all([
        supabase
          .from('nutrition_entries')
          .select('date, calories, protein_g, carbs_g, fat_g, phase')
          .eq('meal_type', 'daily')
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: false }),

        supabase
          .from('daily_metrics')
          .select('date, steps, active_cal')
          .gte('date', from)
          .lte('date', to),

        supabase
          .from('daily_scores')
          .select('date, score, battery_pct')
          .gte('date', from)
          .lte('date', to),

        // Declared context. Its own read because both flags live on
        // `daily_logs` while every macro here comes from `nutrition_entries`.
        supabase
          .from('daily_logs')
          .select('date, nutrition_exception, nutrition_estimated')
          .gte('date', from)
          .lte('date', to),
      ])

      const nutrition = (nutritionRes.data ?? []) as Array<{
        date: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; phase: string | null
      }>
      const metrics = (metricsRes.data ?? []) as Array<{
        date: string; steps: number | null; active_cal: number | null
      }>
      const scores = (scoresRes.data ?? []) as Array<{
        date: string; score: number | null; battery_pct: number | null
      }>
      // `.error` rather than `.data ?? []`: PostgREST 400s the whole select when
      // `nutrition_exception` is not migrated yet, and an unflagged history is
      // the correct reading of that — never a thrown query.
      const exceptions = (exceptionsRes.error ? [] : (exceptionsRes.data ?? [])) as Array<{
        date: string; nutrition_exception: string | null; nutrition_estimated: boolean | null
      }>

      // Build date → row map, keyed by date string.
      // Exception dates are deliberately NOT unioned in: flagging tonight before
      // eating would otherwise mint an all-null row in the history list. The flag
      // decorates a day that exists; it does not conjure one.
      const dateSet = new Set([
        ...nutrition.map(r => r.date),
        ...metrics.map(r => r.date),
        ...scores.map(r => r.date),
      ])

      const metMap   = new Map(metrics.map(r => [r.date, r]))
      const scoreMap = new Map(scores.map(r => [r.date, r]))
      const nutMap   = new Map(nutrition.map(r => [r.date, r]))
      const excMap   = new Map(exceptions.map(r => [r.date, r.nutrition_exception]))
      const estMap   = new Map(exceptions.map(r => [r.date, r.nutrition_estimated ?? false]))

      return [...dateSet]
        .sort((a, b) => b.localeCompare(a))   // newest first
        .map((date): DailyLog => {
          const n = nutMap.get(date)
          const m = metMap.get(date)
          const s = scoreMap.get(date)
          return {
            date,
            calories:   n?.calories  ?? null,
            proteinG:   n?.protein_g ?? null,
            carbsG:     n?.carbs_g   ?? null,
            fatG:       n?.fat_g     ?? null,
            steps:      m?.steps     ?? null,
            activeCal:  m?.active_cal ?? null,
            score:      s?.score      ?? null,
            batteryPct: s?.battery_pct ?? null,
            phase:      (n?.phase as Phase | null) ?? derivePhase(n?.calories ?? null),
            exception:  excMap.get(date) ?? null,
            estimated:  estMap.get(date) ?? false,
          }
        })
    },
    staleTime: 5 * 60_000,
  })
}
