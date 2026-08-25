'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalDaysAgoISO } from '@/lib/utils/day'

export interface SessionHistoryRow {
  date: string
  dayKey: string | null
  splitDay: string
  volumeKg: number | null
  setCount: number | null
  prCount: number | null
  durationMin: number | null
  avgBpm: number | null
  calories: number | null
}

/**
 * A year of finished sessions, dated, with the numbers each one produced.
 *
 * ── ONE WINDOW, TWO CHARTS, ONE QUERY ────────────────────────────────────────
 * The Consistency grid needs a year of "did a session happen on this date"; the
 * Tonnage tile needs a month of "how much did each session move". Those are the
 * same rows at two resolutions, so they are one query with one cache entry —
 * the second consumer is a cache read, not a second round-trip. The window is
 * fixed at 365 rather than parameterised for exactly that reason: a `days`
 * argument would give every caller its own key and quietly turn one query into
 * three.
 *
 * ── THE SEED FILTER IS NOT OPTIONAL ──────────────────────────────────────────
 * `__seed_` sessions are placeholder rows minted to carry historical metrics
 * that predate the set-level history. They are real rows with real dates and no
 * real work, so a consistency grid that counted them would light up months the
 * athlete did not train, and a tonnage chart would draw their nulls as zeroes.
 * Every other session reader in the app applies the same filter; this is the
 * same rule, not a new one.
 */
export function useSessionHistory() {
  return useQuery({
    queryKey: ['workout_sessions', 'history_365'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SessionHistoryRow[]> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('started_at, day_key, split_day, total_volume_kg, set_count, pr_count, duration_min, avg_bpm, calories_burned, notes')
        .gte('started_at', `${logicalDaysAgoISO(365)}T00:00:00Z`)
        .order('started_at', { ascending: true })
      if (error) return []
      return ((data ?? []) as Array<{
        started_at: string; day_key: string | null; split_day: string
        total_volume_kg: number | null; set_count: number | null; pr_count: number | null
        duration_min: number | null; avg_bpm: number | null; calories_burned: number | null
        notes: string | null
      }>)
        .filter((r) => !r.notes?.startsWith('__seed_'))
        .map((r) => ({
          date: r.started_at.slice(0, 10),
          dayKey: r.day_key,
          splitDay: r.split_day,
          volumeKg: r.total_volume_kg,
          setCount: r.set_count,
          prCount: r.pr_count,
          durationMin: r.duration_min,
          avgBpm: r.avg_bpm,
          calories: r.calories_burned,
        }))
    },
  })
}
