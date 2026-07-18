'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId } from '@/lib/programs'
import { hydrateScheduleOverrides, setScheduleOverrideLocal, REST_OVERRIDE } from '@/lib/schedule/overrides'

interface OverrideRow { date: string; day_key: string }

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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule_overrides'] })
      qc.invalidateQueries({ queryKey: ['day_vault'] })
      qc.invalidateQueries({ queryKey: ['daily_logs'] })
      qc.invalidateQueries({ queryKey: ['workout_sessions'] })
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
