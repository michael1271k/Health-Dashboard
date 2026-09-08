'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'

/**
 * Two booleans about one night: "it took a long time to fall asleep", and "the
 * watch got this wrong".
 *
 * ── WHY A COLUMN AND NOT A KEY/VALUE ROW ─────────────────────────────────────
 * `fatigue_logs` and `doms_logs` earn their tables: both are per-day AND
 * per-key, four slots and sixteen muscle groups, and a fifth of either is a row
 * rather than a migration. These are single facts about one night, which is the
 * exact shape `daily_logs.nutrition_estimated` already has — a day-scoped
 * boolean that qualifies a reading the day already carries. Copying that is one
 * column, one upsert and no join; a table would be a second way to say the same
 * kind of thing.
 *
 * ── WHY EACH IS READ IN ITS OWN QUERY ────────────────────────────────────────
 * Same reason `weighin_skip_reason` and `estimated_waist_to_hip_ratio` are:
 * these are the newest columns on the widest table in the schema, and folding
 * one into a select beside twenty live columns means one un-run paste-SQL 400s
 * the whole statement and costs the day page every vital it was going to show.
 * Alone, an absent column costs exactly that flag, and it reads `false`.
 *
 * ── AND NEITHER MOVES THE SCORE ──────────────────────────────────────────────
 * Deliberately, and for the reason `useFatigue` states at length: readiness is
 * computed from sleep, battery and recovery, every historical night has no value
 * here to compare against, and a self-report that moved the number would be one
 * you could talk yourself into. They are records — and columns in the export.
 *
 * ── WHY THE TWO READ HOOKS ARE WRITTEN OUT RATHER THAN SHARED ────────────────
 * They were briefly one parameterised `useDayFlag(column, key, date)`, which is
 * the obvious de-duplication and is wrong here. `query-key-coverage.test.ts`
 * proves that every invalidated key prefix has a consumer by SCANNING for
 * `queryKey: ['literal'`, and a key assembled from a parameter is invisible to
 * it — so the abstraction silently turned `['sleep_onset']` into an orphaned
 * prefix and took a real guard down with it. The writes below are still shared,
 * because a mutation registers nothing.
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
 * Whether the wearer says HealthKit got this night WRONG.
 *
 * The one reading on the Sleep drawer with nothing to check it against: a phone
 * left on the bed reads as a night, a nap folds into one, and the figure lands
 * with the authority of a measurement. It marks the night in the weekly export
 * and changes no number anywhere, because correcting a measurement by
 * self-report is how a log turns into a wish.
 */
export function useSleepInaccurate(date = logicalTodayISO()) {
  return useQuery({
    queryKey: ['sleep_inaccurate', date],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 30_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from('daily_logs')
        .select('sleep_inaccurate').eq('date', date).maybeSingle()
      // `docs/sql/dashboard-polish.sql` adds the column and is run by hand.
      // Until it has been, this is the absent-column case above and reads false.
      if (error) return false
      return (data as { sleep_inaccurate?: boolean | null } | null)?.sleep_inaccurate === true
    },
  })
}

/**
 * Set (or clear) one day-scoped boolean for `date`, retroactively.
 *
 * An UPSERT on `(user_id, date)` rather than an update: the day page is a
 * retroactive surface, and a night you slept badly on before the phone ever
 * synced has no `daily_logs` row to update. `daily_logs_user_id_date_key` is the
 * conflict target, so the write is the same statement whether the day exists.
 *
 * Shared by both flags — unlike the reads above, a mutation registers no query
 * key and the coverage guard has nothing to see here.
 */
function useSetDayFlag(column: string, key: string, date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (on: boolean) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('daily_logs').upsert(
        { user_id: user.id, date, [column]: on } as never,
        { onConflict: 'user_id,date' },
      )
      if (error) throw new Error(error.message)
    },
    // Optimistic: a switch that waits for a round trip before it moves reads as
    // broken, and the value is one boolean to put back if the write fails.
    onMutate: async (on) => {
      await qc.cancelQueries({ queryKey: [key, date] })
      const prev = qc.getQueryData<boolean>([key, date])
      qc.setQueryData<boolean>([key, date], on)
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData([key, date], ctx.prev)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [key, date] })
      // The day page's master record selects from the same table; leaving it
      // stale would make a second surface disagree about the day it just wrote.
      void qc.invalidateQueries({ queryKey: ['day_vault', date] })
    },
  })
}

export function useSetSleepOnset(date = logicalTodayISO()) {
  return useSetDayFlag('sleep_onset_trouble', 'sleep_onset', date)
}

/**
 * NOTE: `daily_logs.sleep_inaccurate` is added by
 * `docs/sql/dashboard-polish.sql`, run by hand. Until it has been, this write
 * fails with the column error and the switch snaps back — which is the honest
 * outcome, and the reason the read above never throws.
 */
export function useSetSleepInaccurate(date = logicalTodayISO()) {
  return useSetDayFlag('sleep_inaccurate', 'sleep_inaccurate', date)
}
