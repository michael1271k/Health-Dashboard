'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Pure client Supabase WebSocket → scoped React Query invalidation. A DB change
 * only invalidates the query keys that actually depend on that table (no global
 * refetch storm), so a Shortcut push updates the open UI live — zero serverless
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
  workout_sessions: [['workout_sessions'], ['gym_reports'], ['trends'], ['weekly_review'], ['coach'], ['continuum'], ['day_vault'], ['muscle_analytics'], ['fuel_force_session'], ['month_activity'], ['session_intel']],
  daily_scores: [['daily_scores'], ['weekly_review'], ['trends'], ['coach'], ['continuum'], ['day_vault'], ['month_activity']],
  supplement_log: [['supplement_log'], ['day_vault']],
  water_intake: [['daily_scores'], ['day_vault']],
  reports: [['reports'], ['weekly_review']],
}
const TABLES = Object.keys(TABLE_KEYS)

/** Payload detail for the Sync Pulse toast — the freshest synced values. */
export interface SyncDetail {
  tables: string[]
  steps?: number | null
  sleepMinutes?: number | null
  calories?: number | null
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const pending = new Set<string>()
    // Freshest row values captured from the change payloads (for Sync Pulse).
    let latest: SyncDetail = { tables: [] }

    const flush = () => {
      const keys = new Set<string>()
      for (const t of pending) for (const k of TABLE_KEYS[t] ?? []) keys.add(JSON.stringify(k))
      const detail: SyncDetail = { ...latest, tables: [...pending] }
      pending.clear()
      latest = { tables: [] }
      for (const k of keys) queryClient.invalidateQueries({ queryKey: JSON.parse(k) as string[] })
      // One announcement per debounce window — the Sync Pulse toast listens.
      if (detail.tables.length) window.dispatchEvent(new CustomEvent('helix-sync', { detail }))
    }
    const onChange = (table: string, row?: Record<string, unknown>) => {
      pending.add(table)
      if (row) {
        if (table === 'daily_logs') {
          if (typeof row.steps === 'number') latest.steps = row.steps
          if (typeof row.sleep_minutes === 'number') latest.sleepMinutes = row.sleep_minutes
        }
        if (table === 'nutrition_entries' && typeof row.calories === 'number') latest.calories = row.calories
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, 400)
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
          (payload: { new?: Record<string, unknown> }) => onChange(table, payload?.new),
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
