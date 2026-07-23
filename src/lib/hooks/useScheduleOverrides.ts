'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId } from '@/lib/programs'
import { hydrateScheduleOverrides, setScheduleOverrideLocal, REST_OVERRIDE } from '@/lib/schedule/overrides'
import { SUPPLEMENT_PROTOCOL, slotTimePassed } from '@/lib/supplements'
import { logicalTodayISO } from '@/lib/utils/day'

interface OverrideRow { date: string; day_key: string }

// The training-only pre-workout stimulants (L-Citrulline + Caffeine) that a
// Rest↔Train swap adds/removes from the pill tracker.
const PRE_SLOT = SUPPLEMENT_PROTOCOL.find((s) => s.key === 'pre')
const PRE_KEYS = (PRE_SLOT?.items ?? []).filter((i) => i.trainingOnly).map((i) => i.key)

/** Sunday-anchored date for a weekday within the week containing dateISO. */
function dateForWeekday(dateISO: string, weekday: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  const sunday = new Date(d)
  sunday.setUTCDate(d.getUTCDate() - d.getUTCDay() + weekday)
  return sunday.toISOString().slice(0, 10)
}

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

/**
 * Swap a workout onto `date`: places `dayKey` there and vacates that day's
 * natural weekday slot in the same week (it becomes rest). Cascades everywhere
 * (Log shortcuts move) via the schedule cache + query invalidation.
 */
export function useSwapDay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ date, dayKey }: { date: string; dayKey: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
      const day = program.days.find((d) => d.key === dayKey)
      const rows: Array<{ user_id: string; date: string; day_key: string }> = [{ user_id: user.id, date, day_key: dayKey }]
      if (day) {
        const src = dateForWeekday(date, day.weekday)
        if (src !== date) rows.push({ user_id: user.id, date: src, day_key: REST_OVERRIDE })
      }
      const { error } = await supabase.from('schedule_overrides')
        .upsert(rows as unknown as never, { onConflict: 'user_id,date' })
      if (error) throw new Error(error.message)
      for (const r of rows) setScheduleOverrideLocal(r.date, r.day_key) // optimistic cascade

      // ── Supplement cascade ──────────────────────────────────────────────
      // Rest→Train adds the pre-workout stimulants (auto-checked if it's today
      // and past their 11:45 slot); Train→Rest removes them entirely. The
      // checklist DISPLAY already follows the swap via isTrainingDay; this keeps
      // supplement_log (score + history) consistent with it.
      const today = logicalTodayISO()
      for (const r of rows) {
        const isTrain = r.day_key !== REST_OVERRIDE
        if (isTrain) {
          // Only auto-tick when it's today and the 11:45 slot has passed;
          // otherwise the items simply show unchecked in the tracker.
          if (r.date === today && PRE_SLOT && slotTimePassed(PRE_SLOT.time)) {
            const nowIso = new Date().toISOString()
            const supRows = PRE_KEYS.map((item_key) => ({ user_id: user.id, date: r.date, item_key, taken: true, taken_at: nowIso }))
            await supabase.from('supplement_log').upsert(supRows as never, { onConflict: 'user_id,date,item_key' })
          }
        } else if (PRE_KEYS.length) {
          // Train→Rest: strip the stimulant rows so they stop counting.
          await supabase.from('supplement_log').delete().eq('user_id', user.id).eq('date', r.date).in('item_key', PRE_KEYS)
        }
      }
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

/** Revert a date to its default weekday schedule. */
export function useClearScheduleOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (date: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('schedule_overrides').delete().eq('user_id', user.id).eq('date', date)
      if (error) throw new Error(error.message)
      setScheduleOverrideLocal(date, null)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule_overrides'] })
      qc.invalidateQueries({ queryKey: ['day_vault'] })
      qc.invalidateQueries({ queryKey: ['daily_logs'] })
    },
  })
}
