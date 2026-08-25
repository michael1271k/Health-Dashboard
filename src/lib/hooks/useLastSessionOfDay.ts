'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'

export interface LastSessionOfDay {
  id: string
  date: string
  volumeKg: number | null
  setCount: number | null
  prCount: number | null
  durationMin: number | null
}

/**
 * The last time this exact workout was run.
 *
 * ── WHY `day_key` AND NEVER THE WEEKDAY ──────────────────────────────────────
 * The Train tile wants to say "last Upper A: 12,480 kg, 22 sets, 1 record"
 * before you have lifted anything today, and the only honest way to find that
 * session is the key the plan stamped on it. Inferring it from the weekday is
 * the exact mistake `session-attribution-by-day-key` documents: one swapped rest
 * day and a Wednesday "Delts & Arms" lands in the Upper A history, where it
 * quietly corrupts every comparison drawn from it.
 *
 * ── AND WHY IT SKIPS TODAY ───────────────────────────────────────────────────
 * The tile shows "last time" specifically while today's session does NOT exist
 * yet, as the thing to beat. Once it does exist the tile switches to today's own
 * numbers, so a row dated today is never the answer to this question — and
 * without the filter, finishing a session would make the motivator quote the
 * session you just finished back at you.
 *
 * `__seed_` rows are the Notion-era placeholders every other reader filters
 * (`useWeekSessions`, `useInsights`, `useCharts`); a seed carries no real
 * tonnage and would show up as a session with nothing in it.
 */
export function useLastSessionOfDay(dayKey: string | null | undefined) {
  const today = logicalTodayISO()
  return useQuery({
    queryKey: ['workout_sessions', 'last_of_day', dayKey ?? null, today],
    enabled: !!dayKey,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LastSessionOfDay | null> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, started_at, total_volume_kg, set_count, pr_count, duration_min, notes')
        .eq('day_key', dayKey as string)
        .lt('started_at', `${today}T00:00:00`)
        .order('started_at', { ascending: false })
        .limit(5)
      if (error) return null

      const rows = (data ?? []) as Array<{
        id: string; started_at: string; total_volume_kg: number | null
        set_count: number | null; pr_count: number | null; duration_min: number | null
        notes: string | null
      }>
      const row = rows.find((r) => !r.notes?.startsWith('__seed_'))
      if (!row) return null
      return {
        id: row.id,
        date: row.started_at.slice(0, 10),
        volumeKg: row.total_volume_kg,
        setCount: row.set_count,
        prCount: row.pr_count,
        durationMin: row.duration_min,
      }
    },
  })
}
