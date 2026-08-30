'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { activeProgram, scheduleDayFor } from '@/lib/programs'
import { hydrateScheduleOverrides, setScheduleOverrideLocal, REST_OVERRIDE } from '@/lib/schedule/overrides'
import {
  planRestDay, planDaySwap, dateForWeekday,
  type ScheduleWrite, type RestDayPlan,
} from '@/lib/schedule/swap'
import { SUPPLEMENT_PROTOCOL } from '@/lib/supplements'

interface OverrideRow { date: string; day_key: string }

// The SEED's training-only pre-workout stimulants (L-Citrulline + Caffeine).
// Only the fallback — see `trainingOnlyKeys`.
const PRE_SLOT = SUPPLEMENT_PROTOCOL.find((s) => s.key === 'pre')
const SEED_PRE_KEYS = (PRE_SLOT?.items ?? []).filter((i) => i.trainingOnly).map((i) => i.key)

/**
 * Which supplements move when a training day moves.
 *
 * ── WHY THIS IS NOT A CONSTANT ANY MORE ──────────────────────────────────────
 * It was `SEED_PRE_KEYS` — derived from `SUPPLEMENT_PROTOCOL`, the hardcoded
 * SEED. But the stack lives in `custom_supplements` and has been editable since
 * the day supplements.ts stopped being the source of truth (see its header). So
 * a third training-only item added in the app would render on training days,
 * count toward the day's score, and then silently NOT follow a swap — present on
 * the rest day it moved away from, absent on the day it moved to.
 *
 * The user's own rows win; the seed is the fallback for an unseeded or
 * unreachable table. A stack that HAS rows but names no training-only item
 * returns an empty list, deliberately: that is a real answer ("nothing is
 * training-gated"), not a missing one, and substituting the seed there would
 * resurrect two items the user had removed.
 */
async function trainingOnlyKeys(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('custom_supplements').select('schedule')
    if (error) return SEED_PRE_KEYS
    const rows = (data ?? []) as Array<{ schedule: { key?: string; trainingOnly?: boolean } | null }>
    if (!rows.length) return SEED_PRE_KEYS
    return rows
      .filter((r) => r.schedule?.trainingOnly && r.schedule.key)
      .map((r) => r.schedule!.key as string)
  } catch {
    return SEED_PRE_KEYS
  }
}

/** What a swap did, so the UI can say where the session went. */
export type SwapOutcome =
  | { kind: 'rest'; plan: RestDayPlan }
  | { kind: 'day'; writes: ScheduleWrite[] }

/**
 * Load the user's day-swaps and hydrate the synchronous schedule cache so the
 * whole app cascades. Degrades to empty if the table isn't created yet (before
 * the schedule_overrides SQL is run) — never throws the app into an error state.
 */
export function useScheduleOverrides() {
  return useQuery({
    queryKey: ['schedule_overrides'],
    // ── Deliberately the app's ONE focus-refetching query ─────────────────────
    // The global default is `refetchOnWindowFocus: false`, because refetching
    // every mounted query each time iOS foregrounds the PWA was the old
    // "permanently syncing" problem. This table is the exception and earns it:
    // it is a handful of rows, and it is the one piece of state most likely to
    // have been changed on a DIFFERENT device since this tab last looked —
    // swapping a day on the phone and then opening the laptop is the normal
    // way to use it. A stale schedule doesn't just look wrong, it tells you to
    // do the wrong workout.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<OverrideRow[]> => {
      try {
        const { data, error } = await supabase.from('schedule_overrides').select('date, day_key')
        if (error) return []
        const rows = (data ?? []) as OverrideRow[]
        hydrateScheduleOverrides(rows)
        return rows
      } catch {
        return []
      }
    },
  })
}

/**
 * Persist a set of schedule writes and cascade the side effects.
 *
 * Exported because the PERMANENT tier (`usePermanentMove`) writes the same kind
 * of row — the pins that protect the spent part of the current week — and going
 * through this rather than `supabase.upsert` directly is what makes it inherit
 * the supplement cascade. A second writer would be a second place for the pills
 * and the plan to drift apart.
 */
export async function applyScheduleWrites(userId: string, writes: ScheduleWrite[]): Promise<void> {
  return applyWrites(userId, writes)
}

async function applyWrites(userId: string, writes: ScheduleWrite[]): Promise<void> {
  if (!writes.length) return
  const rows = writes.map((w) => ({ user_id: userId, date: w.date, day_key: w.dayKey }))
  const { error } = await supabase.from('schedule_overrides')
    .upsert(rows as unknown as never, { onConflict: 'user_id,date' })
  if (error) throw new Error(error.message)
  for (const w of writes) setScheduleOverrideLocal(w.date, w.dayKey) // optimistic cascade

  // ── Supplement cascade ────────────────────────────────────────────────────
  // Rest→Train adds the pre-workout stimulants (auto-checked if it's today and
  // past their 11:45 slot); Train→Rest removes them entirely. The checklist
  // DISPLAY already follows the swap via isTrainingDay; this keeps
  // supplement_log (score + history) consistent with it.
  const keys = await trainingOnlyKeys()
  for (const w of writes) await syncPreWorkoutSupps(userId, w.date, w.dayKey !== REST_OVERRIDE, keys)
}

/**
 * Bring `supplement_log` into line with whether `date` is a training day.
 *
 * Shared by the swap and the UNDO, which is the point: the checklist DISPLAY is
 * driven by `isTrainingDay`, so undoing a Train→Rest swap redrew the
 * L-Citrulline and Caffeine pills while their rows stayed deleted — the day
 * then scored as if the user had skipped two supplements they were never asked
 * about. One writer, both directions.
 *
 * ── WHAT IT DOES NOW THAT ABSENCE MEANS TAKEN ────────────────────────────────
 * Both directions collapse to the same thing: DELETE the rows.
 *
 *   · Train→Rest — a training-only stimulant is not scheduled on a rest day at
 *     all, so `customSlotsForDate` drops it from the denominator. Deleting the
 *     rows leaves nothing claiming it was either taken or skipped, which is
 *     right. Crucially it also clears any explicit `taken = false`, which under
 *     the new rule is the ONE row that would otherwise keep reporting a skip for
 *     a dose that stopped being asked for.
 *   · Rest→Train — the item is scheduled again, and absence now means taken. The
 *     row that used to have to be written for it to count is exactly what is no
 *     longer needed, so the auto-tick is gone with the rest of the auto-log.
 *
 * `keys` is passed in rather than read here so a multi-date swap resolves the
 * user's stack ONCE instead of per date — and so the two directions provably
 * operate on the same list.
 */
async function syncPreWorkoutSupps(
  userId: string, date: string, _training: boolean, keys: string[],
): Promise<void> {
  if (!keys.length) return
  await supabase.from('supplement_log').delete().eq('user_id', userId).eq('date', date).in('item_key', keys)
}

/**
 * Place a day onto `date`. Two shapes, one mutation:
 *
 *  · a program `dayKey` — a genuine exchange with wherever that day currently
 *    sits, so nothing is destroyed by pulling a session forward;
 *  · `REST_OVERRIDE` — a rest day, which MOVES the displaced workout to the
 *    plan's next free rest slot rather than deleting it (see planRestDay).
 *
 * Returns what happened so the caller can state where the session went; a swap
 * that silently rearranges the week is a swap you can't trust.
 */
export function useSwapDay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ date, dayKey }: { date: string; dayKey: string }): Promise<SwapOutcome> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      if (dayKey === REST_OVERRIDE) {
        const plan = planRestDay(date, (d) => scheduleDayFor(d))
        await applyWrites(user.id, plan.writes)
        return { kind: 'rest', plan }
      }

      const day = activeProgram().days.find((d) => d.key === dayKey)
      const natural = day ? dateForWeekday(date, day.weekday) : null
      const writes = planDaySwap(date, dayKey, (d) => scheduleDayFor(d), natural)
      await applyWrites(user.id, writes)
      return { kind: 'day', writes }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule_overrides'] })
      qc.invalidateQueries({ queryKey: ['day_vault'] })
      qc.invalidateQueries({ queryKey: ['daily_logs'] })
      qc.invalidateQueries({ queryKey: ['workout_sessions'] })
      qc.invalidateQueries({ queryKey: ['supplement_log'] })
    },
  })
}

/**
 * Revert one or more dates to their default weekday schedule.
 *
 * Takes a LIST because a rest-day swap touches two dates — undoing it one date
 * at a time would leave the week half-rearranged, which is worse than either
 * state.
 */
export function useClearScheduleOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: string | string[]) => {
      const dates = Array.isArray(input) ? input : [input]
      if (!dates.length) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('schedule_overrides').delete().eq('user_id', user.id).in('date', dates)
      if (error) throw new Error(error.message)
      // Clear the local cache FIRST so `scheduleDayFor` answers with the
      // restored default weekday, then re-run the supplement cascade against
      // it — otherwise undo left the pills drawn but their rows deleted.
      for (const d of dates) setScheduleOverrideLocal(d, null)
      const keys = await trainingOnlyKeys()
      for (const d of dates) {
        await syncPreWorkoutSupps(user.id, d, scheduleDayFor(d) !== REST_OVERRIDE, keys)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule_overrides'] })
      qc.invalidateQueries({ queryKey: ['day_vault'] })
      qc.invalidateQueries({ queryKey: ['daily_logs'] })
      // Undo is a schedule write like any other — same fan-out as useSwapDay,
      // or the checklist and the score disagree with the day it just restored.
      qc.invalidateQueries({ queryKey: ['supplement_log'] })
      qc.invalidateQueries({ queryKey: ['workout_sessions'] })
    },
  })
}
