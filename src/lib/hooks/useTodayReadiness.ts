'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Today's recovery signals — the three numbers, nothing else.
 *
 * Deliberately NOT `useInsights`, which is the right hook for the coach and the
 * wrong one here: it pulls sixty days of logs, nutrition and sessions across
 * five round trips to run the correlation engine. Asking "did you sleep?" on the
 * Command Center should not cost that, so this is one query for one date.
 */
export interface TodayReadiness {
  batteryPct: number | null
  sleepScore: number | null
  sleepMin: number | null
}

/** Below this the day's charge is spent before it starts. */
export const LOW_BATTERY_PCT = 45
/** 5h30 — under it, a heavy session is a withdrawal, not a deposit. */
export const LOW_SLEEP_MIN = 330

export function useTodayReadiness(date: string) {
  return useQuery({
    queryKey: ['readiness_today', date],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TodayReadiness> => {
      const [scoreRes, logRes] = await Promise.all([
        supabase.from('daily_scores').select('battery_pct, sleep_score').eq('date', date).maybeSingle(),
        supabase.from('daily_logs').select('sleep_minutes').eq('date', date).maybeSingle(),
      ])
      const s = scoreRes.data as { battery_pct: number | null; sleep_score: number | null } | null
      const l = logRes.data as { sleep_minutes: number | null } | null
      return {
        batteryPct: s?.battery_pct ?? null,
        sleepScore: s?.sleep_score ?? null,
        sleepMin: l?.sleep_minutes ?? null,
      }
    },
  })
}

/** Is today's charge low enough that the plan is worth questioning? */
export function isUnderRecovered(r: TodayReadiness | undefined): boolean {
  if (!r) return false
  return (r.batteryPct != null && r.batteryPct < LOW_BATTERY_PCT)
    || (r.sleepMin != null && r.sleepMin < LOW_SLEEP_MIN)
}

/** "Battery 38% · slept 4h12" — only the signals that actually fired. */
export function readinessReason(r: TodayReadiness | undefined): string | null {
  if (!r) return null
  const parts: string[] = []
  if (r.batteryPct != null && r.batteryPct < LOW_BATTERY_PCT) parts.push(`Battery ${Math.round(r.batteryPct)}%`)
  if (r.sleepMin != null && r.sleepMin < LOW_SLEEP_MIN) {
    parts.push(`slept ${Math.floor(r.sleepMin / 60)}h${String(Math.round(r.sleepMin % 60)).padStart(2, '0')}`)
  }
  return parts.length ? parts.join(' · ') : null
}
