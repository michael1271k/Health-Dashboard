'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { eraForDate, HELIX_CUT_START } from '@/lib/programs'
import { isTimedExercise } from '@/lib/exercises/timed'
import { isWorkingSet } from '@/lib/training/setTags'
import { repWindowFor, holdTargetFor, LOAD_STEP_KG } from '@/lib/training/ceilings'
import { exerciseTrend, type ExerciseTrend, type TrendSetRow } from '@/lib/charts/series'

export { LOAD_STEP_KG }

// The arithmetic lives in `charts/series` (the Swift twin replays it); these
// re-exports keep the existing import paths working.
export { setsAtCeilingOf, type ExerciseTrend } from '@/lib/charts/series'

/**
 * Per-exercise progression for one session's exercises, in ONE query — the
 * era-scoped fetch, bucketed by (exercise, session), handed to
 * `exerciseTrend` for the headline, the best, the tonnage and the verdict.
 * See that module for why the headline is the session MEAN and not its best
 * set, and why unloaded work is scored on reps.
 */
export function useSessionTrends(exerciseIds: string[], eraDate: string, dayKey?: string | null) {
  const key = [...exerciseIds].sort().join(',')
  return useQuery({
    queryKey: ['session_trends', key, eraDate, dayKey ?? 'any'],
    enabled: exerciseIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ExerciseTrend>> => {
      const era = eraForDate(eraDate)
      // Bound the query to the era SERVER-side. It used to pull every set ever
      // logged for these exercises (limit 4000, no date filter) and throw away
      // the out-of-era rows in JS — the single heaviest request behind opening
      // the Session Report.
      let q = supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, est_1rm_kg, set_type, side, pair_id, exercises!inner(name), workout_sessions!inner(started_at)')
        .in('exercise_id', exerciseIds)
      q = era === 'axis'
        ? q.gte('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
        : q.lt('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
      const { data, error } = await q.limit(2000)
      if (error) throw error

      const rows = ((data ?? []) as unknown as Array<{
        exercise_id: string; weight_kg: number; reps: number
        est_1rm_kg: number | null; set_type: string | null
        side: string | null; pair_id: string | null
        exercises: { name: string }
        workout_sessions: { started_at: string }
      }>).filter((r) => eraForDate(r.workout_sessions.started_at.slice(0, 10)) === era)

      // exercise → session instant → working sets (est carried per set so a
      // stored est-1RM wins over the Epley fallback for loaded lifts).
      const byExercise = new Map<string, Map<string, TrendSetRow[]>>()
      const nameOf = new Map<string, string>()

      for (const r of rows) {
        if (!isWorkingSet(r.set_type)) continue
        nameOf.set(r.exercise_id, r.exercises.name)
        const at = r.workout_sessions.started_at
        const perEx = byExercise.get(r.exercise_id) ?? new Map<string, TrendSetRow[]>()
        const bucket = perEx.get(at) ?? []
        bucket.push({ weightKg: r.weight_kg, reps: r.reps, est: r.est_1rm_kg, side: r.side ?? null, pairId: r.pair_id ?? null })
        perEx.set(at, bucket)
        byExercise.set(r.exercise_id, perEx)
      }

      const out: Record<string, ExerciseTrend> = {}
      for (const id of exerciseIds) {
        const perEx = byExercise.get(id)
        if (!perEx) continue
        const name = nameOf.get(id) ?? ''
        // Timed holds record SECONDS in `reps` (weight 0); their PR is a
        // longer hold, not a heavier one.
        const timed = isTimedExercise(name)
        // Loaded → programmed rep ceiling; timed → programmed hold target.
        const ceiling = timed ? holdTargetFor(name, dayKey) : (repWindowFor(name, dayKey)?.ceiling ?? null)
        const ordered = [...perEx.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, sets]) => sets)
        const trend = exerciseTrend(ordered, timed, ceiling)
        if (trend) out[id] = trend
      }
      return out
    },
  })
}
