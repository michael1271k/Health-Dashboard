'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { authedFetch } from '@/lib/utils/authedFetch'
import { logicalTodayISO, hoursAwakeToday } from '@/lib/utils/day'
import { todayBundleKey, type TodayBundle } from '@/lib/hooks/useToday'

/**
 * Declare (or withdraw) a day's nutrition exception.
 *
 * Writes ONE text column on `daily_logs` and touches nothing else — the day's
 * intake, weight, steps and sleep are all left exactly as they were, because an
 * exception changes how the day is JUDGED and never what it contains.
 *
 * The row may not exist yet. Today's `daily_logs` row typically arrives with the
 * morning HealthKit sync, and the whole point of this control is to flag an
 * evening BEFORE it happens, so the write is an upsert on `(user_id, date)`. A
 * row created this way is entirely null apart from the flag, which is the same
 * shape every other "no data yet" day already has.
 */
export function useSetNutritionException(date: string) {
  const qc = useQueryClient()
  const key = todayBundleKey(date)

  return useMutation({
    mutationFn: async (reason: string | null) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const { error } = await supabase.from('daily_logs')
        // The generated types lag Supabase (schema-of-record), so this column is
        // not in `Tables<'daily_logs'>` yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ user_id: user.id, date, nutrition_exception: reason } as any,
          { onConflict: 'user_id,date' })
      if (error) throw new Error(error.message)

      // The flag only reaches the score through a recompute, and the nutrition
      // component is weight 0.30 — without `force` the day's existing row would
      // stand and the banner would claim a forgiveness the score never applied.
      try {
        await authedFetch('/api/compute-score', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date, force: true, isToday: date === logicalTodayISO(),
            backfillDays: 0, hoursAwake: hoursAwakeToday(),
          }),
        })
      } catch { /* score recompute is best-effort; the flag itself is saved */ }
    },

    // Optimistic: the chip is a toggle, and a toggle that waits for a round trip
    // plus a score recompute before it moves reads as broken.
    onMutate: async (reason) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<TodayBundle>(key)
      if (previous?.dailyLog) {
        qc.setQueryData<TodayBundle>(key, {
          ...previous,
          dailyLog: { ...previous.dailyLog, nutrition_exception: reason } as TodayBundle['dailyLog'],
        })
      }
      return { previous }
    },
    onError: (_e, _reason, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => {
      // The same cascade a `daily_logs` realtime event fires, minus the keys a
      // one-column nutrition flag cannot move (sleep_debt, trends).
      for (const k of [['daily_logs'], ['today'], ['readiness_today'], ['coach'],
        ['continuum'], ['day_vault'], ['month_activity']]) {
        void qc.invalidateQueries({ queryKey: k })
      }
    },
  })
}
