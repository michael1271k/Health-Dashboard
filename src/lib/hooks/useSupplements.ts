'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'

/**
 * Which of today's scheduled supplements were SKIPPED.
 *
 * ── THE RULE INVERTED, AND WHY IT HAD TO ─────────────────────────────────────
 * This used to answer the opposite question — which ones were taken — and a row
 * had to exist for each one before it counted. Nothing wrote those rows except
 * a tap, or an "auto-log" pass that ran only while the app happened to be OPEN
 * after the slot's clock time. The bedtime slot is 22:00. Any night the phone
 * stayed down, three supplements that were actually swallowed left no trace, and
 * the weekly export reported them as skipped.
 *
 * That was not an edge case. Eight days in August 2026 alone carry zero bedtime
 * rows — the 5th, 7th, 9th, 10th, 11th, 19th, 26th and 30th — every one of them
 * a night the app was not opened late, none of them a dose actually missed.
 *
 * So the default flipped. A supplement on the schedule is assumed taken; the
 * only thing worth recording is the exception:
 *
 *     no row          → taken     (was: not taken)
 *     taken = true    → taken     (every historical row still reads correctly)
 *     taken = false   → SKIPPED, deliberately, and reported as such
 *
 * The read heals the whole backlog at once and costs no writes, because absence
 * now carries the meaning that used to require a row.
 *
 * ── AND THE MIDNIGHT RACE WENT WITH IT ───────────────────────────────────────
 * `date` came from `logicalTodayISO()` captured when the hook rendered, so a
 * page left open across midnight wrote yesterday's key. Skipping is an explicit
 * same-day act, which is a much smaller window, and the auto-log pass that used
 * to write rows unattended is gone entirely.
 */
export function useSupplements() {
  const date = logicalTodayISO()
  return useQuery({
    queryKey: ['supplement_log', date],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('supplement_log').select('item_key, taken').eq('date', date)
      if (error) throw error
      const rows = (data ?? []) as Array<{ item_key: string; taken: boolean }>
      return new Set(rows.filter((r) => r.taken === false).map((r) => r.item_key))
    },
    staleTime: 60_000,
  })
}

/**
 * Mark one of today's supplements skipped, or take the skip back.
 *
 * `taken_at` is the SCHEDULED time, never `now()`. The old write stamped the
 * moment of the tap, which read as precision it never had: half the timestamps
 * in the table were auto-log writes already stamped with the slot's own clock
 * time, so the column mixed "when you actually swallowed it" with "when it was
 * meant to be swallowed" and the export printed both as though they were the
 * first. The scheduled time is the honest one, and it is the one the protocol
 * is judged against.
 */
export function useSkipSupplement() {
  const qc = useQueryClient()
  const date = logicalTodayISO()
  const key = ['supplement_log', date] as const
  return useMutation({
    mutationFn: async ({ itemKey, skipped, scheduledTime }: {
      itemKey: string
      skipped: boolean
      /** The slot's own `HH:MM`, so the stamp says when the dose was DUE. */
      scheduledTime?: string | null
    }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      if (!skipped) {
        // Un-skipping deletes the row rather than writing `taken = true`.
        // Absence is now the normal state for a dose that was taken, so leaving
        // a row behind would be a second way of saying the same thing — and the
        // two would drift the first time the schedule changed underneath it.
        const { error } = await supabase.from('supplement_log')
          .delete().eq('user_id', session.user.id).eq('date', date).eq('item_key', itemKey)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('supplement_log').upsert(
        {
          user_id: session.user.id, date, item_key: itemKey, taken: false,
          taken_at: scheduledTime ? new Date(`${date}T${scheduledTime}:00`).toISOString() : null,
        } as never,
        { onConflict: 'user_id,date,item_key' },
      )
      if (error) throw error
    },
    // Optimistic — the row dims instantly, reverts on error.
    onMutate: async ({ itemKey, skipped }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Set<string>>(key)
      const next = new Set(prev ?? [])
      if (skipped) next.add(itemKey); else next.delete(itemKey)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev) },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['weekly_export'] })
      // `['micros']` used to be invalidated here and matched nothing: there is
      // no query keyed on it anywhere. The micro totals are DERIVED at render
      // by `useStackNutrients` from this hook's own data plus
      // `useTodayNutrition`, so invalidating `key` above already moves them.
      // An invalidation that matches nothing is worse than a missing one,
      // because it reads like coverage.
    },
  })
}
