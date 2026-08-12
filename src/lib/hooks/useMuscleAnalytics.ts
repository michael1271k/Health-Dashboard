'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { eraForDate } from '@/lib/programs'
import { GROUP } from '@/lib/theme/palette'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import {
  aggregateMuscleSets, MUSCLE_MAP, MUSCLE_GROUPS, type MuscleStat, type MuscleAggregate,
} from '@/lib/charts/muscleAggregate'

// Re-exported so every existing importer keeps working; the definitions and the
// aggregation itself moved to a PURE module so the maths can be unit-tested.
export { MUSCLE_MAP, MUSCLE_GROUPS }
export type { MuscleStat }

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
        .select('id, weight_kg, reps, pair_id, exercises!inner(name, muscle_groups), workout_sessions!inner(started_at)')
        .gte('workout_sessions.started_at', from)
        .limit(4000) // ceiling so a long history never scans unbounded
      if (error) throw error

      const rows = ((data ?? []) as unknown as Array<{
        id: string; weight_kg: number; reps: number; pair_id: string | null
        exercises: { name: string; muscle_groups: string[] | null }
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
          // Primary AND secondary, flat and unweighted — DELIBERATELY different
          // from the volume accumulators. This drives FRESHNESS, which asks "when
          // was this muscle last under load", and a half set of assistance still
          // costs recovery in full. Dose belongs in the MEV/MAV counters, not here.
          //
          // Resolved from the NAME, not the stored column: `muscle_groups` is a
          // seeded cache that has drifted (Face Pull still reads `shoulders,
          // biceps` there, which is neither of the heads it trains).
          groups: (() => {
            const m = resolveMovers(r.exercises.name, r.exercises.muscle_groups)
            return [...new Set([...m.primary, ...m.secondary]
              .map((t) => MUSCLE_MAP[t.toLowerCase()]).filter(Boolean))]
          })(),
          date: r.workout_sessions.started_at.slice(0, 10),
        })),
        today,
      )
    },
  })
}
