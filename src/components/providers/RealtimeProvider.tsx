'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Pure client Supabase WebSocket → scoped React Query invalidation. A DB change
 * only invalidates the query keys that actually depend on that table (no global
 * `invalidateQueries()` refetch storm). The result: the battery + top stats
 * update live the instant the ingest writes, without a tab switch, and other
 * panels don't needlessly refetch. Zero Netlify serverless cost.
 */
const TABLE_KEYS: Record<string, string[][]> = {
  daily_logs: [['daily_logs'], ['daily_scores'], ['coach'], ['trends']],
  daily_metrics: [['daily_metrics'], ['daily_scores']],
  nutrition_entries: [['nutrition_entries'], ['daily_logs'], ['daily_scores'], ['coach']],
  body_composition: [['body_composition'], ['trends'], ['coach']],
  sleep_sessions: [['sleep_sessions'], ['daily_scores'], ['trends'], ['weekly_review']],
  workout_sessions: [['workout_sessions'], ['gym_reports'], ['trends'], ['weekly_review'], ['coach']],
  daily_scores: [['daily_scores'], ['weekly_review'], ['trends'], ['coach']],
}
const TABLES = Object.keys(TABLE_KEYS)

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const pending = new Set<string>()

    const flush = () => {
      const keys = new Set<string>()
      for (const t of pending) for (const k of TABLE_KEYS[t] ?? []) keys.add(JSON.stringify(k))
      pending.clear()
      for (const k of keys) queryClient.invalidateQueries({ queryKey: JSON.parse(k) as string[] })
    }
    const onChange = (table: string) => {
      pending.add(table)
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, 400)
    }
    const refreshAll = () => { for (const t of TABLES) pending.add(t); flush() }

    let channel = supabase.channel('apex-realtime')
    for (const table of TABLES) {
      channel = channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        () => onChange(table),
      )
    }
    channel.subscribe()

    // Safety net (still zero serverless cost): refresh on return-to-visible /
    // reconnect in case a scheduled-sync event was missed while backgrounded.
    const onVisible = () => { try { if (document.visibilityState === 'visible') refreshAll() } catch { /* never crash on foreground */ } }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refreshAll)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refreshAll)
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return <>{children}</>
}
