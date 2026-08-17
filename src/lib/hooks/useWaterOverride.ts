'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { authedFetch } from '@/lib/utils/authedFetch'
import { logicalTodayISO } from '@/lib/utils/day'
import { recomputeAndPaint } from '@/lib/scoring/applyComputedScore'
import { DAY_KINDS } from '@/lib/native/widgetKinds'
import { manualWaterHkUuid, isManualWaterHkUuid } from '@/lib/nutrition/manualWater'

/**
 * The smallest override worth storing, in ml.
 *
 * NOT arbitrary: `computeHydrationScore` (scoring/score.ts) returns null when
 * `waterMl <= 0`, because "nothing logged yet" and "drank nothing" are different
 * claims and an unlogged morning must not be graded as a failure. So a stored 0
 * would read as UNTRACKED rather than as the deliberate zero the user typed. If
 * you actually drank nothing, the honest action is to clear the override and let
 * the day stay blank — which is what {@link useClearWaterOverride} is for.
 */
export const MIN_WATER_ML = 100

/** Surfaces that must refresh after hydration changes. */
const CASCADE_KEYS: string[][] = [
  // ['today'] carries the recomputed score (workoutKeys.ts) — no ['daily_scores'].
  ['today'], ['daily_logs'], ['day_vault'], ['continuum'], ['weekly_review'],
  ['trends'], ['coach'],
  // The weekly export prints hydration per day and caches its markdown for 60s;
  // without this, correcting water and immediately exporting the week produces a
  // brief built from the number the correction just replaced.
  ['weekly_export'],
]

async function cascade(qc: ReturnType<typeof useQueryClient>, date: string): Promise<void> {
  // Recompute BEFORE invalidating: `['today']` is in the fan-out, and a refetch
  // fired first would read the pre-recompute score and then mark it fresh for
  // the full staleTime — the exact race applyComputedScore.ts documents.
  // DAY_KINDS, not all of them: hydration moves the score, the battery and the
  // Fuel face, and touches nothing the Training widget draws. Reloading
  // Training here would spend its per-kind budget on a glass of water.
  await recomputeAndPaint(
    qc, date, { force: true, isToday: date === logicalTodayISO() }, authedFetch, DAY_KINDS)
  for (const k of CASCADE_KEYS) qc.invalidateQueries({ queryKey: k })
  qc.invalidateQueries({ queryKey: ['water_intake'] })
}

/**
 * Is this day's hydration hand-corrected?
 *
 * Only used to decide whether to OFFER the hand-back-to-Apple-Health action.
 * Showing that button unconditionally would let a tap clear a perfectly good
 * synced reading, so the affordance has to know the day's provenance — a control
 * whose effect depends on invisible state is the thing to avoid, not the extra
 * query.
 */
export function useHasWaterOverride(date: string) {
  return useQuery({
    queryKey: ['water_intake', date],
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from('water_intake').select('hk_uuid').eq('date', date)
      if (error) return false
      return ((data ?? []) as Array<{ hk_uuid: string | null }>).some((r) => isManualWaterHkUuid(r.hk_uuid))
    },
  })
}

/**
 * Hand-correct one day's hydration.
 *
 * ── IT HAS TO BE TWO WRITES ──────────────────────────────────────────────────
 * `daily_logs.water_ml` is what every surface RENDERS; `water_intake` is what
 * `/api/compute-score` SUMS. Writing only the first changes the number and not
 * the score; writing only the second changes the score and not the number. The
 * two are kept in step by `ingestDailyLog` writing both from one payload field,
 * and an override that broke that invariant would be indistinguishable from a
 * bug in the scorer.
 *
 * `water_intake` is replaced rather than added to, because that is what the user
 * asked for — "overwrite all existing water data for that day". HealthKit's own
 * rows for the date go with it, and the replacement carries the per-day sentinel
 * so the next sync declines to touch either store (see manualWater.ts).
 *
 * The score is then recomputed and PAINTED from the returned row, so the battery
 * and the daily score move on the same frame as the litres — no refetch, no lag.
 */
export function useWaterOverride(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ml: number) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const amount = Math.max(MIN_WATER_ML, Math.round(ml))

      // daily_logs first: it is the row the UI reads, and a merge-upsert on
      // (user_id, date) leaves every other metric for the day untouched.
      const { error: logErr } = await supabase.from('daily_logs').upsert(
        { user_id: user.id, date, water_ml: amount } as never,
        { onConflict: 'user_id,date' },
      )
      if (logErr) throw new Error(logErr.message)

      // Then the ledger the scorer reads. Delete-then-insert, unfiltered: the
      // whole day is being replaced, HealthKit's rows and any earlier override
      // included, so this lands on exactly ONE row.
      await supabase.from('water_intake').delete().eq('user_id', user.id).eq('date', date)
      const { error: intakeErr } = await supabase.from('water_intake').insert({
        user_id: user.id,
        hk_uuid: manualWaterHkUuid(date),
        logged_at: `${date}T12:00:00Z`,
        date,
        amount_ml: amount,
      } as never)
      if (intakeErr) throw new Error(intakeErr.message)

      await cascade(qc, date)
    },
  })
}

/**
 * Hand back to Apple Health.
 *
 * Clears BOTH stores rather than trying to restore the synced value — the synced
 * value is not held anywhere locally, and inventing one would be worse than a
 * blank day. The next HealthKit push repopulates it; until then the day reads as
 * untracked, which is true.
 */
export function useClearWaterOverride(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      await supabase.from('water_intake').delete().eq('user_id', user.id).eq('date', date)
      const { error } = await supabase.from('daily_logs').upsert(
        { user_id: user.id, date, water_ml: null } as never,
        { onConflict: 'user_id,date' },
      )
      if (error) throw new Error(error.message)
      await cascade(qc, date)
    },
  })
}
