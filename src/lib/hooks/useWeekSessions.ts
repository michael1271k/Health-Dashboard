'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Calendar-week session aggregation (Sun→Sat, matching program weeks) — the
 * deterministic data layer behind the Weekly Session Summary. No LLM.
 */
export interface WeekSessionRow {
  id: string
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

export interface WeekSummary {
  weekStart: string
  sessions: WeekSessionRow[]
  totals: {
    volumeKg: number
    sets: number
    prs: number
    durationMin: number
    avgBpm: number | null
    calories: number
  }
}

/** Sunday of the week containing dateISO. */
export function weekStartOf(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

export function isoAddDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function useWeekSessions(weekStart: string | null) {
  return useQuery({
    queryKey: ['workout_sessions', 'week', weekStart],
    enabled: !!weekStart,
    staleTime: 60_000,
    queryFn: async (): Promise<WeekSummary> => {
      const start = weekStart as string
      const end = isoAddDays(start, 7)
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, started_at, day_key, split_day, total_volume_kg, set_count, pr_count, duration_min, avg_bpm, calories_burned, notes')
        .gte('started_at', `${start}T00:00:00Z`)
        .lt('started_at', `${end}T00:00:00Z`)
        .order('started_at', { ascending: true })
      if (error) throw error

      const sessions: WeekSessionRow[] = ((data ?? []) as Array<{
        id: string; started_at: string; day_key: string | null; split_day: string
        total_volume_kg: number | null; set_count: number | null; pr_count: number | null
        duration_min: number | null; avg_bpm: number | null; calories_burned: number | null
        notes: string | null
      }>)
        .filter((r) => !r.notes?.startsWith('__seed_'))
        .map((r) => ({
          id: r.id,
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

      const bpms = sessions.map((s) => s.avgBpm).filter((v): v is number => v != null)
      return {
        weekStart: start,
        sessions,
        totals: {
          volumeKg: Math.round(sessions.reduce((n, s) => n + (s.volumeKg ?? 0), 0)),
          sets: sessions.reduce((n, s) => n + (s.setCount ?? 0), 0),
          prs: sessions.reduce((n, s) => n + (s.prCount ?? 0), 0),
          durationMin: sessions.reduce((n, s) => n + (s.durationMin ?? 0), 0),
          avgBpm: bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null,
          calories: Math.round(sessions.reduce((n, s) => n + (s.calories ?? 0), 0)),
        },
      }
    },
  })
}
