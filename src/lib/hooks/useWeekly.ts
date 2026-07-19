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

/** Earliest logged session date — anchors the "Week N" program counter. */
export function useProgramStart() {
  return useQuery({
    queryKey: ['program_start'],
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('workout_sessions')
        .select('started_at')
        .order('started_at', { ascending: true })
        .limit(1)
      const rows = (data ?? []) as Array<{ started_at: string }>
      return rows.length ? rows[0].started_at.slice(0, 10) : null
    },
    staleTime: 10 * 60_000,
  })
}

export interface MonthActivity {
  workoutDates: Set<string>
  dataDates: Set<string>
}

/** Dates (YYYY-MM-DD) in [from,to] that have a workout / any logged score. */
export function useMonthActivity(from: string, to: string) {
  return useQuery({
    queryKey: ['month_activity', from, to],
    queryFn: async (): Promise<MonthActivity> => {
      const [{ data: sessions }, { data: scores }] = await Promise.all([
        supabase.from('workout_sessions').select('started_at')
          .gte('started_at', `${from}T00:00:00Z`).lt('started_at', `${to}T23:59:59Z`),
        supabase.from('daily_scores').select('date').gte('date', from).lte('date', to),
      ])
      const workoutDates = new Set<string>(
        ((sessions ?? []) as Array<{ started_at: string }>).map((s) => s.started_at.slice(0, 10)),
      )
      const dataDates = new Set<string>(
        ((scores ?? []) as Array<{ date: string }>).map((s) => s.date),
      )
      return { workoutDates, dataDates }
    },
    staleTime: 60_000,
  })
}
