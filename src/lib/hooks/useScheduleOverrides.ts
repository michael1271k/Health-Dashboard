'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { activeProgram, scheduleDayFor } from '@/lib/programs'
import { hydrateScheduleOverrides, setScheduleOverrideLocal, REST_OVERRIDE } from '@/lib/schedule/overrides'
import {
  planRestDay, planDaySwap, dateForWeekday,
  type ScheduleWrite, type RestDayPlan,
} from '@/lib/schedule/swap'
import { SUPPLEMENT_PROTOCOL, slotTimePassed } from '@/lib/supplements'
import { logicalTodayISO } from '@/lib/utils/day'

interface OverrideRow { date: string; day_key: string }

// The training-only pre-workout stimulants (L-Citrulline + Caffeine) that a
// Rest↔Train swap adds/removes from the pill tracker.
const PRE_SLOT = SUPPLEMENT_PROTOCOL.find((s) => s.key === 'pre')
const PRE_KEYS = (PRE_SLOT?.items ?? []).filter((i) => i.trainingOnly).map((i) => i.key)

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
    staleTime: 5 * 60 * 1000,
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

/** Persist a set of schedule writes and cascade the side effects. */
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
  const today = logicalTodayISO()
  for (const w of writes) {
    if (w.dayKey !== REST_OVERRIDE) {
      // Only auto-tick when it's today and the 11:45 slot has passed;
      // otherwise the items simply show unchecked in the tracker.
      if (w.date === today && PRE_SLOT && slotTimePassed(PRE_SLOT.time)) {
        const nowIso = new Date().toISOString()
        const supRows = PRE_KEYS.map((item_key) => ({ user_id: userId, date: w.date, item_key, taken: true, taken_at: nowIso }))
        await supabase.from('supplement_log').upsert(supRows as never, { onConflict: 'user_id,date,item_key' })
      }
    } else if (PRE_KEYS.length) {
      // Train→Rest: strip the stimulant rows so they stop counting.
      await supabase.from('supplement_log').delete().eq('user_id', userId).eq('date', w.date).in('item_key', PRE_KEYS)
    }
  }
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
      for (const d of dates) setScheduleOverrideLocal(d, null)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule_overrides'] })
      qc.invalidateQueries({ queryKey: ['day_vault'] })
      qc.invalidateQueries({ queryKey: ['daily_logs'] })
    },
  })
}
