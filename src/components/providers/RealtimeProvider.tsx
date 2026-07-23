'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { hydratePrefsFromDb } from '@/lib/utils/prefsSync'
import { useScheduleOverrides } from '@/lib/hooks/useScheduleOverrides'
import { WORKOUT_QUERY_KEYS } from '@/lib/query/workoutKeys'

/**
 * Pure client Supabase WebSocket → scoped React Query invalidation. A DB change
 * only invalidates the query keys that actually depend on that table (no global
 * refetch storm), so a new health push updates the open UI live — zero serverless
 * cost, zero taps.
 *
 * iOS resilience: a backgrounded PWA's socket is suspended and may never
 * silently rejoin — on return-to-visible we check the channel state and
 * resubscribe from scratch when it isn't joined, then refresh everything once
 * to cover events missed while suspended.
 */
const TABLE_KEYS: Record<string, string[][]> = {
  daily_logs: [['daily_logs'], ['daily_scores'], ['coach'], ['trends'], ['continuum'], ['day_vault'], ['sleep_debt']],
  daily_metrics: [['daily_metrics'], ['daily_scores'], ['day_vault']],
  nutrition_entries: [['nutrition_entries'], ['daily_logs'], ['daily_scores'], ['coach'], ['continuum'], ['day_vault'], ['fuel_force_session']],
  body_composition: [['body_composition'], ['trends'], ['coach']],
  sleep_sessions: [['sleep_sessions'], ['daily_scores'], ['trends'], ['weekly_review'], ['sleep_debt']],
  // Shares the canonical workout-derived key list with the commit/delete
  // mutations so a session change from ANY device refreshes the same surfaces.
  workout_sessions: WORKOUT_QUERY_KEYS,
  daily_scores: [['daily_scores'], ['weekly_review'], ['trends'], ['coach'], ['continuum'], ['day_vault'], ['month_activity'], ['week_recovery']],
  supplement_log: [['supplement_log'], ['day_vault']],
  water_intake: [['daily_scores'], ['day_vault']],
  reports: [['reports'], ['weekly_review']],
  // Settings live-sync across devices: a change on desktop invalidates the phone.
  user_goals: [['user_goals']],
}
const TABLES = Object.keys(TABLE_KEYS)

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  // Hydrate the day-swap cache app-wide so schedule shortcuts cascade everywhere.
  useScheduleOverrides()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const pending = new Set<string>()

    // Scoped React Query invalidation only — no user-facing toast. (The old
    // "Sync Pulse" purple stats toast was removed; the pull-to-refresh pill is
    // now the single sync indicator.)
    const flush = () => {
      const keys = new Set<string>()
      for (const t of pending) for (const k of TABLE_KEYS[t] ?? []) keys.add(JSON.stringify(k))
      pending.clear()
      for (const k of keys) queryClient.invalidateQueries({ queryKey: JSON.parse(k) as string[] })
    }
    const onChange = (table: string) => {
      pending.add(table)
      // A settings change on ANY device re-hydrates local preferences here live.
      if (table === 'user_goals') void hydratePrefsFromDb()
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => flush(), 400)
    }
    const refreshAll = () => { for (const t of TABLES) pending.add(t); flush() }

    let channel: ReturnType<typeof supabase.channel> | null = null
    const subscribe = () => {
      if (channel) supabase.removeChannel(channel)
      let ch = supabase.channel(`helix-realtime-${Date.now()}`)
      for (const table of TABLES) {
        ch = ch.on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any,
          { event: '*', schema: 'public', table },
          () => onChange(table),
        )
      }
      ch.subscribe()
      channel = ch
    }
    subscribe()

    // Return-to-visible: rejoin a suspended socket, then refresh once for
    // anything missed while backgrounded.
    const onVisible = () => {
      try {
        if (document.visibilityState !== 'visible') return
        if (channel?.state !== 'joined') subscribe()
        refreshAll()
      } catch { /* never crash on foreground */ }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [queryClient])

  return <>{children}</>
}
