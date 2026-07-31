'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { eraForDate, activePhase, getActiveProgramId } from '@/lib/programs'
import { lookupMuscles } from '@/lib/exercises/muscleMap'
import { weeklyVolumeByMuscle, type MuscleVolume, type ProgramPhase } from '@/lib/training/landmarks'
import { usePlanPhaseGoals } from '@/lib/hooks/usePlanPhaseGoals'

export interface WeeklyVolume {
  weekStart: string
  /** The ACTIVE phase, read from the plan — not inferred from calories. */
  program: ProgramPhase
  muscles: MuscleVolume[]
}

/**
 * Committed sets per landmark muscle across a WHOLE week (Sunday 00:00 local →
 * the following Sunday), graded against the active program's MEV/MAV targets.
 * Unilateral L/R sub-sets (shared pair_id) count once.
 *
 * `weekStart` defaults to the current week, so the card resets every Sunday.
 * Pass a Sunday to accumulate a past week — the Session Report needs the week
 * that contains the session, not today's.
 *
 * `upTo` (inclusive date) clamps the upper bound to the END of that day. The
 * Session Report uses it so a session shows the week accumulated UP TO the day
 * it happened, not totals that include work done after it.
 */
export function useWeeklyVolume(
  weekStart: string = weekStartOf(logicalTodayISO()),
  upTo?: string,
) {
  // The phase comes from the ACTIVE PLAN. It used to be sniffed from
  // calorie_goal (>= 2450 meant bulk), which had no way to express maintenance —
  // a maintenance block silently trained to cut volume.
  const { resolveVolume } = usePlanPhaseGoals()
  const phase = activePhase() as ProgramPhase
  const planId = getActiveProgramId()
  const volumeTargets = resolveVolume(planId, phase)

  return useQuery({
    queryKey: ['weekly_volume', weekStart, upTo ?? null, planId, phase],
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyVolume> => {
      // STRICT Sunday-00:00 LOCAL bounds. `${weekStart}T00:00:00Z` is UTC
      // midnight, which in any non-UTC timezone clips or leaks the first hours
      // of the week; this converts the user's local Sunday midnight to the
      // correct absolute instant. The upper bound matters for past weeks —
      // without it a historical week accumulated everything logged since.
      const weekStartInstant = new Date(`${weekStart}T00:00:00`).toISOString()
      const endExclusiveDate = upTo && upTo < isoAddDays(weekStart, 6)
        ? isoAddDays(upTo, 1)
        : isoAddDays(weekStart, 7)
      const weekEndInstant = new Date(`${endExclusiveDate}T00:00:00`).toISOString()
      const [{ data: setsData, error }] = await Promise.all([
        supabase
          .from('workout_sets')
          .select('id, pair_id, exercises!inner(name, muscle_groups), workout_sessions!inner(started_at)')
          .gte('workout_sessions.started_at', weekStartInstant)
          .lt('workout_sessions.started_at', weekEndInstant)
          // WORKING sets only. Warm-ups aren't training volume — the per-session
          // card already excludes them (useSessionDetail `if (!isWarmup)`); this
          // accumulator used to count them, silently inflating every muscle.
          // 'failure' stays (still a working set). NULL set_type is legacy
          // 'normal' data, so it must survive — `neq` alone would drop it
          // (SQL `NULL <> 'warmup'` is NULL, not true).
          .or('set_type.is.null,set_type.neq.warmup')
          .limit(2000),
      ])
      if (error) throw error

      const rows = ((setsData ?? []) as unknown as Array<{
        id: string
        pair_id: string | null
        exercises: { name: string; muscle_groups: string[] | null }
        workout_sessions: { started_at: string }
      }>)
        // Stay within the week's own era (a week is one era, but the boundary
        // week would otherwise mix PPL-legacy sets into a HELIX total).
        .filter((r) => eraForDate(r.workout_sessions.started_at.slice(0, 10)) === eraForDate(weekStart))
        .map((r) => ({
          // DIRECT SETS ONLY. `muscle_groups` is [...primary, ...secondary], so
          // counting all of it credited biceps for every back row (Biceps 22/8).
          // Resolve the PRIMARY mover from the exercise name; fall back to the
          // first tag, which is primary by construction of muscleGroupsFor().
          muscleTokens: lookupMuscles(r.exercises.name)?.primary
            ?? (r.exercises.muscle_groups ?? []).slice(0, 1),
          dedupeKey: r.pair_id ?? r.id, // L/R sub-sets (shared pair_id) count once
        }))

      return { weekStart, program: phase, muscles: weeklyVolumeByMuscle(rows, phase, volumeTargets) }
    },
  })
}
