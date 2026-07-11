'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { PHASES } from '@/lib/phases'
import { logicalTodayISO } from '@/lib/utils/day'
import type { Phase } from '@/lib/nutrition/phase'

/** One day on the Continuum — everything a day card needs, pre-joined. */
export interface ContinuumDay {
  date: string
  score: number | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  phase: Phase | null
  sleepOk: boolean
  waterOk: boolean
  foodOk: boolean
  session: { split: string; volumeKg: number | null; prCount: number | null } | null
}

const isoAddDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10)
}

/**
 * The Continuum (Phase 16) — every logged day from program start to today as
 * one pre-joined, newest-first list. One fetch, four range queries; day cards
 * virtualize via content-visibility so the list stays light no matter how
 * long the history grows.
 */
export function useContinuum() {
  return useQuery({
    queryKey: ['continuum'],
    queryFn: async (): Promise<ContinuumDay[]> => {
      const from = PHASES[0].start           // program dawn (2026-03-08)
      const to = logicalTodayISO()
      const [logsRes, scoresRes, nutritionRes, sessionsRes] = await Promise.all([
        supabase.from('daily_logs').select('date, sleep_minutes, water_ml')
          .gte('date', from).lte('date', to),
        supabase.from('daily_scores').select('date, score')
          .gte('date', from).lte('date', to),
        supabase.from('nutrition_entries').select('date, calories, protein_g, carbs_g, fat_g, phase')
          .eq('meal_type', 'daily').gte('date', from).lte('date', to),
        supabase.from('workout_sessions').select('started_at, split_day, total_volume_kg, pr_count')
          .gte('started_at', `${from}T00:00:00Z`).lt('started_at', `${isoAddDays(to, 1)}T00:00:00Z`),
      ])

      const logs = new Map(((logsRes.data ?? []) as Array<{ date: string; sleep_minutes: number | null; water_ml: number | null }>).map((r) => [r.date, r]))
      const scores = new Map(((scoresRes.data ?? []) as Array<{ date: string; score: number | null }>).map((r) => [r.date, r.score]))
      const nutrition = new Map(((nutritionRes.data ?? []) as Array<{ date: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; phase: string | null }>).map((r) => [r.date, r]))
      const sessions = new Map<string, { split: string; volumeKg: number | null; prCount: number | null }>()
      for (const s of (sessionsRes.data ?? []) as Array<{ started_at: string; split_day: string; total_volume_kg: number | null; pr_count: number | null }>) {
        const d = s.started_at.slice(0, 10)
        if (!sessions.has(d)) sessions.set(d, { split: s.split_day, volumeKg: s.total_volume_kg, prCount: s.pr_count })
      }

      // Enumerate to → from (newest first); keep only days with ANY data so the
      // pre-tracking gap doesn't render hundreds of hollow cards.
      const out: ContinuumDay[] = []
      for (let d = to; d >= from; d = isoAddDays(d, -1)) {
        const log = logs.get(d)
        const n = nutrition.get(d)
        const session = sessions.get(d) ?? null
        const score = scores.get(d) ?? null
        if (!log && !n && !session && score == null) continue
        out.push({
          date: d,
          score,
          calories: n?.calories ?? null,
          proteinG: n?.protein_g ?? null,
          carbsG: n?.carbs_g ?? null,
          fatG: n?.fat_g ?? null,
          phase: (n?.phase ?? null) as Phase | null,
          sleepOk: (log?.sleep_minutes ?? 0) > 0,
          waterOk: (log?.water_ml ?? 0) > 0,
          foodOk: n != null,
          session,
        })
      }
      return out
    },
    staleTime: 5 * 60_000,
  })
}
