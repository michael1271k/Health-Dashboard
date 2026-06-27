'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Subscribes to postgres_changes on every metric table and, on any insert/
 * update/delete, debounce-invalidates the whole React Query cache (~400ms).
 * The result: ingesting from the iOS Shortcut — or editing a row in Supabase —
 * refreshes all open APEX tabs instantly, with no manual reload.
 *
 * Must be mounted inside QueryProvider so `useQueryClient` resolves the client.
 */
const TABLES = [
  'daily_logs', 'daily_metrics', 'nutrition_entries',
  'body_composition', 'sleep_sessions', 'workout_sessions', 'daily_scores',
] as const

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { queryClient.invalidateQueries() }, 400)
    }

    let channel = supabase.channel('apex-realtime')
    for (const table of TABLES) {
      channel = channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        refresh,
      )
    }
    channel.subscribe()

    // Safety net (still zero serverless cost — pure client refetch against
    // Supabase): if the tab was backgrounded or offline during one of the
    // scheduled 10/12/14/16/18/20/22 Shortcut syncs and missed the socket
    // event, refresh on return-to-visible / reconnect.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return <>{children}</>
}
