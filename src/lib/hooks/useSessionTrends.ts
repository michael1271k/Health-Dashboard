'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { epley1RM } from '@/lib/utils/epley'
import { eraForDate } from '@/lib/programs'
import { repWindowFor, progressionVerdict, LOAD_STEP_KG, type ProgressionVerdict, type WorkingSet } from '@/lib/training/ceilings'

export { LOAD_STEP_KG }

export interface ExerciseTrend {
  /** Best est-1RM per session, oldest → newest (one point per session). */
  points: number[]
  /** % change from the previous session's best est-1RM to this one. */
  pctChange: number | null
  /** All-time best est-1RM within the era. */
  best: number
  /** Total working volume (kg) of the most recent session. */
  tonnage: number
  /** Tonnage change vs the previous session, in kg. */
  tonnageDelta: number | null
  /** Best set of the latest session. */
  topSet: WorkingSet | null
  /** How many of the latest session's working sets reached the rep ceiling. */
  setsAtCeiling: number
  /** Double progression, judged against the PROGRAMMED rep window. */
  progression: ProgressionVerdict
}

/**
 * Per-exercise progression for one session's exercises, in ONE query.
 *
 * est-1RM is collapsed to the BEST set per session (plotting every set made a
 * single session's top-set-then-back-off read as a strength drop). The trend is
 * era-scoped so a new program never inherits the old block's history.
 *
 * Double progression follows the program's own rule — all working sets at the
 * exercise's PROGRAMMED ceiling, at one load, in TWO CONSECUTIVE sessions. The
 * ceiling used to be a global constant of 12, which fired on Calf Press at
 * 15/14/13 even though its window is 10–15.
 */
export function useSessionTrends(exerciseIds: string[], eraDate: string, dayKey?: string | null) {
  const key = [...exerciseIds].sort().join(',')
  return useQuery({
    queryKey: ['session_trends', key, eraDate, dayKey ?? 'any'],
    enabled: exerciseIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ExerciseTrend>> => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, est_1rm_kg, set_type, exercises!inner(name), workout_sessions!inner(started_at)')
        .in('exercise_id', exerciseIds)
        .limit(4000)
      if (error) throw error

      const era = eraForDate(eraDate)
      const rows = ((data ?? []) as unknown as Array<{
        exercise_id: string; weight_kg: number; reps: number
        est_1rm_kg: number | null; set_type: string | null
        exercises: { name: string }
        workout_sessions: { started_at: string }
      }>).filter((r) => eraForDate(r.workout_sessions.started_at.slice(0, 10)) === era)

      // exercise → session instant → { best est-1RM, working sets, tonnage }
      const byExercise = new Map<string, Map<string, { best: number; sets: WorkingSet[] }>>()
      const nameOf = new Map<string, string>()

      for (const r of rows) {
        if (r.set_type === 'warmup') continue
        nameOf.set(r.exercise_id, r.exercises.name)
        const at = r.workout_sessions.started_at
        const perEx = byExercise.get(r.exercise_id) ?? new Map<string, { best: number; sets: WorkingSet[] }>()
        const bucket = perEx.get(at) ?? { best: 0, sets: [] }
        bucket.best = Math.max(bucket.best, r.est_1rm_kg ?? epley1RM(r.weight_kg, r.reps))
        bucket.sets.push({ weightKg: r.weight_kg, reps: r.reps })
        perEx.set(at, bucket)
        byExercise.set(r.exercise_id, perEx)
      }

      const tonnageOf = (sets: WorkingSet[]) =>
        Math.round(sets.reduce((s, x) => s + x.weightKg * x.reps, 0))

      const out: Record<string, ExerciseTrend> = {}
      for (const id of exerciseIds) {
        const perEx = byExercise.get(id)
        if (!perEx) continue
        const ordered = [...perEx.entries()].sort(([a], [b]) => a.localeCompare(b))
        const points = ordered.map(([, v]) => Math.round(v.best * 10) / 10)
        const cur = points[points.length - 1]
        const prev = points.length >= 2 ? points[points.length - 2] : null

        const latestSets = ordered[ordered.length - 1][1].sets
        const prevSets = ordered.length >= 2 ? ordered[ordered.length - 2][1].sets : null
        const window = repWindowFor(nameOf.get(id) ?? '', dayKey)
        const ceiling = window?.ceiling ?? null

        const topSet = latestSets.reduce<WorkingSet | null>(
          (best, s) => (!best || epley1RM(s.weightKg, s.reps) > epley1RM(best.weightKg, best.reps) ? s : best),
          null,
        )
        const tonnage = tonnageOf(latestSets)

        out[id] = {
          points,
          pctChange: prev && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null,
          best: Math.max(...points),
          tonnage,
          tonnageDelta: prevSets ? tonnage - tonnageOf(prevSets) : null,
          topSet,
          setsAtCeiling: ceiling == null ? 0 : latestSets.filter((s) => s.reps >= ceiling).length,
          progression: progressionVerdict(
            prevSets ? [prevSets, latestSets] : [latestSets],
            ceiling,
          ),
        }
      }
      return out
    },
  })
}
