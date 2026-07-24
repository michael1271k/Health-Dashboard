'use client'

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { normalizeSpO2 } from '@/lib/utils/units'
import { nightWindow } from '@/lib/sleep/nightWindow'
import { authedFetch } from '@/lib/utils/authedFetch'
import type { Tables } from '@/lib/supabase/types'
import { logicalTodayISO, hoursAwakeToday } from '@/lib/utils/day'

// Today's date — device-local calendar day, boundary hardcoded to midnight.
function todayLocal(): string {
  return logicalTodayISO()
}

// Last 30 days for trend charts (used by Task 5 Charts hooks)
export function last30Days(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toLocaleDateString('en-CA')
}

/** Newest sync timestamp across scores + logs — for the header "Last Updated" stamp. */
export function useLastUpdated() {
  return useQuery({
    queryKey: ['last_updated'],
    staleTime: 30_000,
    queryFn: async (): Promise<string | null> => {
      const [s, l] = await Promise.all([
        supabase.from('daily_scores').select('computed_at').order('computed_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('daily_logs').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      const times = [
        (s.data as { computed_at?: string } | null)?.computed_at,
        (l.data as { updated_at?: string } | null)?.updated_at,
      ].filter(Boolean).map((t) => new Date(t as string).getTime())
      return times.length ? new Date(Math.max(...times)).toISOString() : null
    },
  })
}

export function useTodayScore() {
  return useQuery({
    queryKey: ['daily_scores', 'today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select('*')
        .eq('date', todayLocal())
        .maybeSingle()
      if (error) throw error
      return data as Tables<'daily_scores'> | null
    },
  })
}

/**
 * Recompute today's score/battery on mount and whenever the tab becomes visible
 * or comes back online. The battery is time-of-day aware, so it must be recomputed
 * as the day advances (the old "compute once when null" froze it for the whole day).
 * The first run also backfills the last 7 days so weekly averages aren't empty.
 * Throttled to once per 30s.
 */
export function useEnsureTodayScore(enabled = true) {
  const qc = useQueryClient()
  const lastRun = useRef(0)
  useEffect(() => {
    if (!enabled) return
    const recompute = (backfillDays = 0) => {
      const now = Date.now()
      if (now - lastRun.current < 30_000) return
      lastRun.current = now
      authedFetch('/api/compute-score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // Send the DEVICE's logical date + hours awake — the server has no idea
        // what timezone the user is in (local ≠ server clock).
        //
        // `isToday: true` is REQUIRED, not cosmetic. Without it the route falls
        // back to `date === todayISO()` using its own UTC clock; between local
        // midnight and UTC midnight the client's date is a day ahead, so today's
        // row was written `finalized: true` and every later recompute that day
        // was skipped by the freeze — the score stuck at its 00:00 value.
        body: JSON.stringify({
          backfillDays, date: logicalTodayISO(), hoursAwake: hoursAwakeToday(), isToday: true,
        }),
      })
        .then((r) => (r.ok ? qc.invalidateQueries({ queryKey: ['daily_scores'] }).then(() => qc.invalidateQueries({ queryKey: ['weekly_review'] })) : null))
        .catch(() => {})
    }
    // Backfill the week only ONCE per browser session (8 days of server compute
    // is too heavy to run on every dashboard mount — that was a big tab-lag source).
    let backfilled = false
    try { backfilled = sessionStorage.getItem('helix_backfilled') === '1' } catch {}
    if (!backfilled) {
      try { sessionStorage.setItem('helix_backfilled', '1') } catch {}
      recompute(7)
    } else {
      recompute(0)
    }
    const onVisible = () => { try { if (document.visibilityState === 'visible') recompute(0) } catch { /* never crash on foreground */ } }
    const onOnline = () => recompute(0)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [enabled, qc])
}

export function useTodayDailyLog() {
  return useQuery({
    queryKey: ['daily_logs', 'today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('date', todayLocal())
        .maybeSingle()
      if (error) throw error
      const row = data as Tables<'daily_logs'> | null
      // Coerce mixed-unit blood oxygen (0.982 fraction vs 97.79 percent) once,
      // at the data layer, so no render site can show "1%".
      return row ? { ...row, blood_oxygen: normalizeSpO2(row.blood_oxygen) } : null
    },
  })
}

export function useTodayMetrics() {
  return useQuery({
    queryKey: ['daily_metrics', 'today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_metrics')
        .select('*')
        .eq('date', todayLocal())
        .maybeSingle()
      if (error) throw error
      return data as Tables<'daily_metrics'> | null
    },
  })
}

export function useTodayNutrition() {
  return useQuery({
    queryKey: ['nutrition_entries', 'today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nutrition_entries')
        .select('*')
        .eq('date', todayLocal())
        .eq('meal_type', 'daily')
        .maybeSingle()
      if (error) throw error
      return data as Tables<'nutrition_entries'> | null
    },
  })
}

export function useTodaySleep() {
  return useQuery({
    queryKey: ['sleep_sessions', 'today'],
    queryFn: async () => {
      // `start_time` is BEDTIME (the previous evening), so the night is a window,
      // not a calendar day. Shared with the ingest writer and compute-score via
      // nightWindow() so a reader can never drift from the writer again.
      const night = nightWindow(todayLocal())
      const { data, error } = await supabase
        .from('sleep_sessions')
        .select('*')
        .gte('start_time', night.from)
        .lt('start_time', night.to)
        .order('duration_min', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Tables<'sleep_sessions'> | null
    },
  })
}

export function useUserGoals() {
  return useQuery({
    queryKey: ['user_goals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data as Tables<'user_goals'> | null
    },
    staleTime: 5 * 60 * 1000, // Goals rarely change — 5 min cache
  })
}

export function useRecentSessions(limit = 5) {
  return useQuery({
    queryKey: ['workout_sessions', 'recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as Tables<'workout_sessions'>[]
    },
  })
}
