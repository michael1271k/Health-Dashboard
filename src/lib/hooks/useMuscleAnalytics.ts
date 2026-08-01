'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { eraForDate } from '@/lib/programs'
import { GROUP } from '@/lib/theme/palette'
import {
  aggregateMuscleSets, MUSCLE_MAP, MUSCLE_GROUPS, type MuscleStat, type MuscleAggregate,
} from '@/lib/charts/muscleAggregate'

// Re-exported so every existing importer keeps working; the definitions and the
// aggregation itself moved to a PURE module so the maths can be unit-tested.
export { MUSCLE_MAP, MUSCLE_GROUPS }
export type { MuscleStat }

/** v5.1 exercise-name → muscle tags (parser aliases). Used by the catalog updater. */
export const V51_EXERCISE_ALIASES: Record<string, string[]> = {
  'Calf Press': ['calves'],
  'Hack Squat': ['quads', 'glutes'],
  'Smith Squat': ['quads', 'glutes'],
  'Reverse EZ-Bar Curl': ['forearms', 'biceps'],
  'Hanging Knee Raise': ['abs'],
  'Cross-Body Cable Extension': ['triceps'],
}
export const GROUP_COLOR: Record<string, string> = GROUP

export type MuscleAnalytics = MuscleAggregate

export function useMuscleAnalytics(days = 30, era: 'all' | 'ppl' | 'axis' = 'all') {
  // logicalTodayISO in the key: freshness (daysSince) must DECAY at the 04:00
  // day boundary even when the persisted cache still holds yesterday's result.
  const today = logicalTodayISO()
  return useQuery({
    queryKey: ['muscle_analytics', days, era, today],
    staleTime: 60_000,
    queryFn: async (): Promise<MuscleAnalytics> => {
      const from = new Date(Date.now() - days * 86400000).toISOString()
      const { data, error } = await supabase
        .from('workout_sets')
        .select('id, weight_kg, reps, pair_id, exercises!inner(muscle_groups), workout_sessions!inner(started_at)')
        .gte('workout_sessions.started_at', from)
        .limit(4000) // ceiling so a long history never scans unbounded
      if (error) throw error

      const rows = ((data ?? []) as unknown as Array<{
        id: string; weight_kg: number; reps: number; pair_id: string | null
        exercises: { muscle_groups: string[] | null }
        workout_sessions: { started_at: string }
      }>)
        // STRICT ERA BOUNDARY: workouts never mix eras in analytics.
        .filter((r) => era === 'all' || eraForDate(r.workout_sessions.started_at.slice(0, 10)) === era)

      return aggregateMuscleSets(
        rows.map((r) => ({
          id: r.id,
          weightKg: r.weight_kg,
          reps: r.reps,
          pairId: r.pair_id,
          groups: [...new Set((r.exercises.muscle_groups ?? []).map((m) => MUSCLE_MAP[m.toLowerCase()]).filter(Boolean))],
          date: r.workout_sessions.started_at.slice(0, 10),
        })),
        today,
      )
    },
  })
}
