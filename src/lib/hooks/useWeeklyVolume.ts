'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { weekStartOf } from '@/lib/utils/week'
import { eraForDate } from '@/lib/programs'
import { lookupMuscles } from '@/lib/exercises/muscleMap'
import { weeklyVolumeByMuscle, type MuscleVolume, type Program } from '@/lib/training/landmarks'

export interface WeeklyVolume {
  weekStart: string
  program: Program
  muscles: MuscleVolume[]
}

/** Program tag from the active calorie goal (cut ≤2050 · bulk ≥2450 · else cut floor). */
function programFromGoal(calorieGoal: number | null | undefined): Program {
  return calorieGoal != null && calorieGoal >= 2450 ? 'bulk' : 'cut'
}

/**
 * Committed sets per landmark muscle for the CURRENT week (Sunday 00:00 → now),
 * graded against the active program's MEV/MAV targets. Resets automatically every
 * Sunday because the query window is anchored to this week's Sunday. Unilateral
 * L/R sub-sets (shared pair_id) count once.
 */
export function useWeeklyVolume() {
  const today = logicalTodayISO()
  const weekStart = weekStartOf(today)
  return useQuery({
    queryKey: ['weekly_volume', weekStart],
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyVolume> => {
      // STRICT Sunday-00:00 LOCAL reset. `${weekStart}T00:00:00Z` is UTC
      // midnight, which in any non-UTC timezone clips or leaks the first hours
      // of the week; this converts the user's local Sunday midnight to the
      // correct absolute instant.
      const weekStartInstant = new Date(`${weekStart}T00:00:00`).toISOString()
      const [{ data: setsData, error }, { data: goals }] = await Promise.all([
        supabase
          .from('workout_sets')
          .select('id, pair_id, exercises!inner(name, muscle_groups), workout_sessions!inner(started_at)')
          .gte('workout_sessions.started_at', weekStartInstant)
          .limit(2000),
        supabase.from('user_goals').select('calorie_goal').maybeSingle(),
      ])
      if (error) throw error
      const program = programFromGoal((goals as { calorie_goal?: number } | null)?.calorie_goal)

      const rows = ((setsData ?? []) as unknown as Array<{
        id: string
        pair_id: string | null
        exercises: { name: string; muscle_groups: string[] | null }
        workout_sessions: { started_at: string }
      }>)
        // Stay within the active program's era (this week is one era, but guard anyway).
        .filter((r) => eraForDate(r.workout_sessions.started_at.slice(0, 10)) === eraForDate(today))
        .map((r) => ({
          // DIRECT SETS ONLY. `muscle_groups` is [...primary, ...secondary], so
          // counting all of it credited biceps for every back row (Biceps 22/8).
          // Resolve the PRIMARY mover from the exercise name; fall back to the
          // first tag, which is primary by construction of muscleGroupsFor().
          muscleTokens: lookupMuscles(r.exercises.name)?.primary
            ?? (r.exercises.muscle_groups ?? []).slice(0, 1),
          dedupeKey: r.pair_id ?? r.id, // L/R sub-sets (shared pair_id) count once
        }))

      return { weekStart, program, muscles: weeklyVolumeByMuscle(rows, program) }
    },
  })
}
