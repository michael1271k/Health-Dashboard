'use client'

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/lib/supabase/types'
import { logicalTodayISO } from '@/lib/utils/day'

// Today's LOGICAL date (rolls over at the 04:00 cutoff, not midnight)
function todayLocal(): string {
  return logicalTodayISO()
}

// Last 30 days for trend charts (used by Task 5 Charts hooks)
export function last30Days(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toLocaleDateString('en-CA')
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
      fetch('/api/compute-score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfillDays }),
      })
        .then((r) => (r.ok ? qc.invalidateQueries({ queryKey: ['daily_scores'] }).then(() => qc.invalidateQueries({ queryKey: ['weekly_review'] })) : null))
        .catch(() => {})
    }
    // Backfill the week only ONCE per browser session (8 days of server compute
    // is too heavy to run on every dashboard mount — that was a big tab-lag source).
    let backfilled = false
    try { backfilled = sessionStorage.getItem('apex_backfilled') === '1' } catch {}
    if (!backfilled) {
      try { sessionStorage.setItem('apex_backfilled', '1') } catch {}
      recompute(7)
    } else {
      recompute(0)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') recompute(0) }
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
      return data as Tables<'daily_logs'> | null
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
      const today = todayLocal()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toLocaleDateString('en-CA')

      // Sleep can be keyed to yesterday's date (HealthKit convention)
      const { data, error } = await supabase
        .from('sleep_sessions')
        .select('*')
        .gte('start_time', `${yesterdayStr}T12:00:00Z`)
        .lt('start_time', `${today}T12:00:00Z`)
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
