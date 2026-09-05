'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { hydratePrefsFromDb } from '@/lib/utils/prefsSync'
import { useScheduleOverrides } from '@/lib/hooks/useScheduleOverrides'

/**
 * Pure client Supabase WebSocket → scoped React Query invalidation. A DB change
 * only invalidates the query keys that actually depend on that table (no global
 * refetch storm), so a new health push updates the open UI live — zero serverless
 * cost, zero taps.
 *
 * iOS resilience: a backgrounded PWA's socket is suspended and may never
 * silently rejoin — on return-to-visible we check the channel state and
 * resubscribe from scratch when it isn't joined.
 *
 * The catch-up refresh is deliberately narrow. It used to run on EVERY
 * return-to-visible and on the first join, invalidating all 13 tables' key
 * lists — a full-app refetch on every foreground, regardless of staleTime,
 * which is what made the app feel like it was permanently syncing. Events can
 * only be missed while the socket is DOWN, so the catch-up now runs exactly
 * when the socket comes back up after having been lost, and never on the
 * initial join (those queries are already fetching on mount).
 */
/**
 * ── WHY `['today']` IS ON FIVE OF THESE AND `['daily_scores']` IS ON NONE ─────
 * `['daily_scores']` used to sit in seven of these lists. It matches nothing:
 * no `useQuery` is keyed on it. Every read of that table happens inside another
 * query — and the big one is the bundled `['today', date]` (useDashboard.ts:52),
 * which fetches score + daily_log + metrics + nutrition + sleep in ONE request.
 *
 * So the five tables feeding that bundle each have to invalidate `['today']`,
 * and until now only `user_goals` did. A sleep sync or a macro edit on the
 * desktop left the phone's dashboard painting the previous values for the full
 * 90 s staleTime — longer from a cold open, since that key is persisted. The
 * dead key looked like it covered this, which is precisely why nobody noticed.
 *
 * `['readiness_today']` gets the same treatment: it reads battery + sleep score
 * and nothing invalidated it at all.
 */
import { TABLE_KEYS, REALTIME_TABLES as TABLES } from '@/lib/query/realtimeKeys'

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  // Hydrate the day-swap cache app-wide so schedule shortcuts cascade everywhere.
  useScheduleOverrides()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retry = 0
    let cancelled = false
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

    // The socket has been up and healthy since the last catch-up, so no events
    // were missed and there is nothing to catch up ON. Flipped to false the
    // moment the channel drops.
    let socketHealthy = false
    // Distinguishes the first join (nothing to catch up on) from a re-join.
    let joinedOnce = false

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
      // Surface the join result. A silently-dead socket is the difference
      // between "cross-device sync works" and "the laptop never updates", so a
      // failed/timed-out join retries with backoff instead of going quiet.
      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          retry = 0
          // Catch up ONLY when re-joining after a drop. On the very first join
          // every mounted query is already in flight, so refreshing here would
          // just duplicate the entire cold-start fetch.
          if (!socketHealthy) {
            if (joinedOnce) refreshAll()
            joinedOnce = true
            socketHealthy = true
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          socketHealthy = false
          if (cancelled) return
          const delay = Math.min(30_000, 1000 * 2 ** retry++)
          console.warn(`[realtime] channel ${status} — retrying in ${delay}ms`)
          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = setTimeout(() => { if (!cancelled) subscribe() }, delay)
        }
      })
      channel = ch
    }
    // DEFERRED TO IDLE. Opening a WebSocket and registering fifteen
    // `postgres_changes` handlers is real main-thread and network work, and it
    // was happening before the first pixel — to deliver events about data the
    // user cannot see yet. Nothing on a cold start depends on the socket being
    // up: the initial render comes from the persisted cache and the route's own
    // queries. A second's delay in cross-device sync is not observable; a
    // second's delay in first paint is the whole complaint.
    //
    // `cancelled` is already checked by the retry path, so an unmount before
    // the callback fires cannot leave a channel behind.
    const startSocket = () => { if (!cancelled) subscribe() }
    const ric = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(startSocket, { timeout: 2000 })
      : window.setTimeout(startSocket, 600)

    // Return-to-visible: rejoin a suspended socket. The rejoin's SUBSCRIBED
    // handler does the catch-up refresh. A socket that is STILL joined never
    // missed an event, so foregrounding it costs nothing — which is the whole
    // point: coming back to the app must not re-fetch the world.
    const onVisible = () => {
      try {
        if (document.visibilityState !== 'visible') return
        if (channel?.state !== 'joined') { socketHealthy = false; subscribe() }
      } catch { /* never crash on foreground */ }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)

    return () => {
      cancelled = true
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(ric as number)
      else window.clearTimeout(ric as number)
      if (timer) clearTimeout(timer)
      if (retryTimer) clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [queryClient])

  return <>{children}</>
}
