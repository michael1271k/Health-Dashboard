'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'

/**
 * "Trouble falling asleep", one boolean per logical night.
 *
 * ── WHY A COLUMN AND NOT A KEY/VALUE ROW ─────────────────────────────────────
 * `fatigue_logs` and `doms_logs` earn their tables: both are per-day AND
 * per-key, four slots and sixteen muscle groups, and a fifth of either is a row
 * rather than a migration. This is one fact about one night, which is the exact
 * shape `daily_logs.nutrition_estimated` already has — a day-scoped boolean that
 * qualifies a reading the day already carries. Copying that is one column, one
 * upsert and no join; a table would be a second way to say the same kind of
 * thing.
 *
 * ── WHY IT IS READ IN ITS OWN QUERY ──────────────────────────────────────────
 * Same reason `weighin_skip_reason` and `estimated_waist_to_hip_ratio` are: this
 * is the newest column on the widest table in the schema, and folding it into a
 * select beside twenty live columns means one un-run paste-SQL 400s the whole
 * statement and costs the day page every vital it was going to show. Alone, an
 * absent column costs exactly this flag, and it reads `false`.
 *
 * ── AND IT DOES NOT MOVE THE SCORE ───────────────────────────────────────────
 * Deliberately, and for the reason `useFatigue` states at length: readiness is
 * computed from sleep, battery and recovery, every historical night has no value
 * here to compare against, and a self-report that moved the number would be one
 * you could talk yourself into. It is a record — and a column in the export.
 */

/** Whether the night at `date` was reported as hard to fall asleep on. */
export function useSleepOnset(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['sleep_onset', date],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 30_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from('daily_logs')
        .select('sleep_onset_trouble').eq('date', date).maybeSingle()
      // Absent column, absent row, absent day — all three mean the same thing to
      // a reader: nothing was reported. Never throws; a tracker that takes the
      // Sleep drawer down with it is worse than a tracker that reads false.
      if (error) return false
      return (data as { sleep_onset_trouble?: boolean | null } | null)?.sleep_onset_trouble === true
    },
  })
}

/**
 * Set (or clear) the flag for `date`, retroactively.
 *
 * An UPSERT on `(user_id, date)` rather than an update: the day page is a
 * retroactive surface, and a night you slept badly on before the phone ever
 * synced has no `daily_logs` row to update. `daily_logs_user_id_date_key` is the
 * conflict target, so the write is the same statement whether the day exists.
 */
export function useSetSleepOnset(date = logicalTodayISO()) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (on: boolean) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('daily_logs').upsert(
        { user_id: user.id, date, sleep_onset_trouble: on } as never,
        { onConflict: 'user_id,date' },
      )
      if (error) throw new Error(error.message)
    },
    // Optimistic: a switch that waits for a round trip before it moves reads as
    // broken, and the value is one boolean to put back if the write fails.
    onMutate: async (on) => {
      await qc.cancelQueries({ queryKey: ['sleep_onset', date] })
      const prev = qc.getQueryData<boolean>(['sleep_onset', date])
      qc.setQueryData<boolean>(['sleep_onset', date], on)
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['sleep_onset', date], ctx.prev)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['sleep_onset', date] })
      // The day page's master record selects from the same table; leaving it
      // stale would make a second surface disagree about the day it just wrote.
      void qc.invalidateQueries({ queryKey: ['day_vault', date] })
    },
  })
}
