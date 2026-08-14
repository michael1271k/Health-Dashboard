'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { activeProgram, getActiveProgramId, scheduleDayFor, type ScheduleDay } from '@/lib/programs'
import { getProgramLayout, setProgramLayoutLocal, hydrateProgramLayouts } from '@/lib/schedule/layoutStore'
import { effectiveWeekday, type DayLayout } from '@/lib/schedule/layout'
import {
  planPermanentMove, dateForWeekday,
  type LoggedDay, type PermanentMovePlan,
} from '@/lib/schedule/swap'
import { getScheduleOverride, REST_OVERRIDE } from '@/lib/schedule/overrides'
import { logicalTodayISO } from '@/lib/utils/day'
import { applyScheduleWrites } from '@/lib/hooks/useScheduleOverrides'

interface LayoutRow { program_id: string; layout: unknown }

/**
 * Load the user's permanent weekday layouts and hydrate the synchronous store.
 *
 * Degrades to empty when `program_day_layout` is not migrated — the same
 * contract `useScheduleOverrides` and `useRoutineTemplate` honour. A missing
 * table means "runs the plan exactly as authored", which is a correct answer,
 * not an error state.
 */
export function useProgramLayouts() {
  return useQuery({
    queryKey: ['program_day_layout'],
    // Same reasoning as `useScheduleOverrides`: this is the state most likely to
    // have been changed on ANOTHER device since this tab last looked, and a
    // stale one doesn't just look wrong, it tells you to do the wrong workout.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<LayoutRow[]> => {
      try {
        const { data, error } = await supabase.from('program_day_layout').select('program_id, layout')
        if (error) return []
        const rows = (data ?? []) as LayoutRow[]
        hydrateProgramLayouts(rows)
        return rows
      } catch {
        return []
      }
    },
  })
}

/**
 * Resolve a date's schedule under a HYPOTHETICAL layout.
 *
 * `scheduleDayFor` reads the live store, which is exactly wrong for planning a
 * change you have not made yet — `planPermanentMove` has to compare each day's
 * meaning before and after. Per-date overrides still win, because they do in the
 * real resolver and a plan that ignored them would pin days that were already
 * pinned.
 */
function resolveWithLayout(dateISO: string, layout: DayLayout): ScheduleDay | 'rest' {
  const override = getScheduleOverride(dateISO)
  if (override != null) return scheduleDayFor(dateISO)   // the override decides; layout is irrelevant
  const program = activeProgram()
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay()
  const day = program.days.find((d) => effectiveWeekday(d, layout) === weekday)
  return day ? { label: day.label, sub: day.sub, dayKey: day.key } : 'rest'
}

/** Plan a permanent move without committing it, so the UI can state the consequence first. */
export function previewPermanentMove(dayKey: string, weekday: number, logged: readonly LoggedDay[]): PermanentMovePlan {
  const program = activeProgram()
  return planPermanentMove({
    program,
    layout: getProgramLayout(program.id),
    dayKey,
    weekday,
    todayISO: logicalTodayISO(),
    logged,
    resolveWith: resolveWithLayout,
  })
}

/** Where a day sits this week under the CURRENT layout — the drag's origin. */
export function currentDateForDay(dayKey: string, todayISO = logicalTodayISO()): string | null {
  const program = activeProgram()
  const layout = getProgramLayout(program.id)
  const day = program.days.find((d) => d.key === dayKey)
  return day ? dateForWeekday(todayISO, effectiveWeekday(day, layout)) : null
}

/**
 * Commit a permanent move: store the layout, then pin the spent days.
 *
 * ORDER MATTERS. The pins are computed against the OLD layout (that is what
 * "what it was" means), but they are written as ordinary per-date overrides,
 * which win over any layout. So storing the layout first and pinning second is
 * safe in either order for correctness — but the local layout write cascades
 * instantly through `useScheduleVersion`, and a render between the two would
 * briefly show the retro-relabelled past. Pins first, layout second.
 */
export function usePermanentMove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ dayKey, weekday, logged }: {
      dayKey: string
      weekday: number
      logged: readonly LoggedDay[]
    }): Promise<PermanentMovePlan> => {
      const plan = previewPermanentMove(dayKey, weekday, logged)
      if (plan.block || !plan.layout) return plan

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const programId = getActiveProgramId()

      // The pins go through the SHARED writer, so they inherit the supplement
      // cascade. A permanent change that moved training days without moving the
      // pre-workout stimulants would be the exact bug the per-date swap already
      // solved, reintroduced one tier up.
      await applyScheduleWrites(user.id, plan.writes)

      const { error } = await supabase.from('program_day_layout').upsert(
        { user_id: user.id, program_id: programId, layout: plan.layout, updated_at: new Date().toISOString() } as never,
        { onConflict: 'user_id,program_id' },
      )
      if (error) throw new Error(error.message)
      setProgramLayoutLocal(programId, plan.layout)
      return plan
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['program_day_layout'] })
      qc.invalidateQueries({ queryKey: ['schedule_overrides'] })
      qc.invalidateQueries({ queryKey: ['day_vault'] })
      qc.invalidateQueries({ queryKey: ['daily_logs'] })
      qc.invalidateQueries({ queryKey: ['supplement_log'] })
      qc.invalidateQueries({ queryKey: ['workout_sessions'] })
    },
  })
}

/**
 * Restore the plan exactly as authored.
 *
 * Deletes the row rather than storing an identity layout, so "no row" keeps its
 * single meaning — there is no second way to say "unchanged" that a future
 * reader would have to learn about. The pins it created are NOT removed: they
 * describe days that actually happened, and reverting the plan does not un-live
 * them.
 */
export function useResetProgramLayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const programId = getActiveProgramId()
      const { error } = await supabase.from('program_day_layout')
        .delete().eq('user_id', user.id).eq('program_id', programId)
      if (error) throw new Error(error.message)
      setProgramLayoutLocal(programId, null)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['program_day_layout'] })
      qc.invalidateQueries({ queryKey: ['day_vault'] })
      qc.invalidateQueries({ queryKey: ['supplement_log'] })
    },
  })
}

/** True when the active plan is running somewhere other than as authored. */
export function isLayoutCustomised(): boolean {
  const program = activeProgram()
  const layout = getProgramLayout(program.id)
  return program.days.some((d) => effectiveWeekday(d, layout) !== d.weekday)
}

export { REST_OVERRIDE }
