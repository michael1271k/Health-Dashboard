'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

// Weekly reports live in `@/lib/hooks/useReports` (unified week_start/payload
// schema). This module keeps the session-level and calendar queries.

export interface GymReportRow {
  id: string
  date: string
  split: string
  reportMd: string
  durationMin: number | null
  avgBpm: number | null
  volumeKg: number | null
  setCount: number | null
  prCount: number | null
  dayKey?: string | null
  calories?: number | null
}

/** Gym session reports (workout_sessions that have an AI-generated report). */
export function useGymReports(limit = 30) {
  return useQuery({
    queryKey: ['gym_reports', limit],
    queryFn: async (): Promise<GymReportRow[]> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, started_at, split_day, report_md, duration_min, avg_bpm, total_volume_kg, set_count, pr_count')
        .not('report_md', 'is', null)
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return ((data ?? []) as Array<{
        id: string; started_at: string; split_day: string; report_md: string | null
        duration_min: number | null; avg_bpm: number | null; total_volume_kg: number | null
        set_count: number | null; pr_count: number | null
      }>)
        .filter((r) => r.report_md)
        .map((r) => ({
          id: r.id, date: r.started_at.slice(0, 10), split: r.split_day, reportMd: r.report_md as string,
          durationMin: r.duration_min, avgBpm: r.avg_bpm, volumeKg: r.total_volume_kg,
          setCount: r.set_count, prCount: r.pr_count,
        }))
    },
    staleTime: 60_000,
  })
}

/**
 * ARRAYS, NOT SETS — deliberately.
 *
 * This payload is persisted to localStorage by the query persister, and JSON has
 * no Set: a `Set` dehydrates to `{}` and rehydrates as a plain object with no
 * `.has()`. That is exactly what crashed the Momentum calendar on cold open —
 * `T.workoutDates.has is not a function`. QueryProvider's `isJsonSafe` guard only
 * looked at the TOP-level value, so an object *containing* Sets sailed through it.
 *
 * Callers build their own `Set` from these arrays (see `monthActivitySets`), which
 * keeps the cached blob honest AND keeps lookups O(1).
 */
export interface MonthActivity {
  workoutDates: string[]
  dataDates: string[]
}

/**
 * Dates (YYYY-MM-DD) in [from,to] that have a workout / any logged score.
 * `enabled` lets a caller hold the query until the calendar is actually opened,
 * so a screen that only *contains* a calendar doesn't pay for it on mount.
 */
export function useMonthActivity(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['month_activity', from, to],
    enabled,
    queryFn: async (): Promise<MonthActivity> => {
      const [{ data: sessions }, { data: scores }] = await Promise.all([
        supabase.from('workout_sessions').select('started_at')
          .gte('started_at', `${from}T00:00:00Z`).lt('started_at', `${to}T23:59:59Z`),
        supabase.from('daily_scores').select('date').gte('date', from).lte('date', to),
      ])
      return {
        workoutDates: [...new Set(((sessions ?? []) as Array<{ started_at: string }>).map((s) => s.started_at.slice(0, 10)))],
        dataDates: [...new Set(((scores ?? []) as Array<{ date: string }>).map((s) => s.date))],
      }
    },
    staleTime: 60_000,
  })
}

/**
 * Lookup sets for a MonthActivity payload. `Array.isArray` guards a cache blob
 * written by an older build, where these fields were serialized Sets (`{}`) —
 * `new Set({})` would throw "object is not iterable" and re-crash the calendar
 * on the one launch that matters, the first one after the update.
 */
export function monthActivitySets(a: MonthActivity | undefined): { workouts: Set<string>; data: Set<string> } {
  return {
    workouts: new Set(Array.isArray(a?.workoutDates) ? a.workoutDates : []),
    data: new Set(Array.isArray(a?.dataDates) ? a.dataDates : []),
  }
}
