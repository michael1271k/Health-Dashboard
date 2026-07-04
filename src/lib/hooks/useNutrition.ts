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
}

function todayISO() {
  return logicalTodayISO()
}
function daysAgoISO(n: number) {
  return logicalDaysAgoISO(n)
}

export function useDailyLogs(days = 30) {
  return useQuery({
    queryKey: ['daily_logs', days],
    queryFn: async (): Promise<DailyLog[]> => {
      const from = daysAgoISO(days)
      const to   = todayISO()

      const [nutritionRes, metricsRes, scoresRes] = await Promise.all([
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

      // Build date → row map, keyed by date string
      const dateSet = new Set([
        ...nutrition.map(r => r.date),
        ...metrics.map(r => r.date),
        ...scores.map(r => r.date),
      ])

      const metMap   = new Map(metrics.map(r => [r.date, r]))
      const scoreMap = new Map(scores.map(r => [r.date, r]))
      const nutMap   = new Map(nutrition.map(r => [r.date, r]))

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
          }
        })
    },
    staleTime: 5 * 60_000,
  })
}
