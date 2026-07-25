'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { epley1RM } from '@/lib/utils/epley'
import { eraForDate, HELIX_CUT_START } from '@/lib/programs'
import { isTimedExercise } from '@/lib/exercises/timed'
import {
  repWindowFor, holdTargetFor, progressionVerdict, timedProgressionVerdict,
  LOAD_STEP_KG, type ProgressionVerdict, type WorkingSet,
} from '@/lib/training/ceilings'

export { LOAD_STEP_KG }

export interface ExerciseTrend {
  /**
   * Per-session headline, oldest → newest (one point per session). For a loaded
   * lift this is the best est-1RM (kg); for a TIMED hold it is the best hold
   * (seconds) — `timed` says which axis, so the graph never plots a plank as 0 kg.
   */
  points: number[]
  /** % change from the previous session's headline to this one. */
  pctChange: number | null
  /** All-time best within the era (kg for loaded, seconds for timed). */
  best: number
  /** Latest session's total working volume (kg loaded · seconds under tension timed). */
  tonnage: number
  /** Tonnage change vs the previous session. */
  tonnageDelta: number | null
  /** Best set of the latest session (its `reps` is seconds for a timed hold). */
  topSet: WorkingSet | null
  /** How many of the latest session's working sets reached the ceiling / hold target. */
  setsAtCeiling: number
  /** Double progression, judged against the PROGRAMMED rep window or hold target. */
  progression: ProgressionVerdict
  /** True when the movement is scored on time (seconds), not load. */
  timed: boolean
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
      const era = eraForDate(eraDate)
      // Bound the query to the era SERVER-side. It used to pull every set ever
      // logged for these exercises (limit 4000, no date filter) and throw away
      // the out-of-era rows in JS — the single heaviest request behind opening
      // the Session Report.
      let q = supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, est_1rm_kg, set_type, exercises!inner(name), workout_sessions!inner(started_at)')
        .in('exercise_id', exerciseIds)
      q = era === 'axis'
        ? q.gte('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
        : q.lt('workout_sessions.started_at', `${HELIX_CUT_START}T00:00:00Z`)
      const { data, error } = await q.limit(2000)
      if (error) throw error

      const rows = ((data ?? []) as unknown as Array<{
        exercise_id: string; weight_kg: number; reps: number
        est_1rm_kg: number | null; set_type: string | null
        exercises: { name: string }
        workout_sessions: { started_at: string }
      }>).filter((r) => eraForDate(r.workout_sessions.started_at.slice(0, 10)) === era)

      // exercise → session instant → working sets (est carried per set so a
      // stored est-1RM wins over the Epley fallback for loaded lifts).
      type SetRow = { weightKg: number; reps: number; est: number | null }
      const byExercise = new Map<string, Map<string, SetRow[]>>()
      const nameOf = new Map<string, string>()

      for (const r of rows) {
        if (r.set_type === 'warmup') continue
        nameOf.set(r.exercise_id, r.exercises.name)
        const at = r.workout_sessions.started_at
        const perEx = byExercise.get(r.exercise_id) ?? new Map<string, SetRow[]>()
        const bucket = perEx.get(at) ?? []
        bucket.push({ weightKg: r.weight_kg, reps: r.reps, est: r.est_1rm_kg })
        perEx.set(at, bucket)
        byExercise.set(r.exercise_id, perEx)
      }

      const out: Record<string, ExerciseTrend> = {}
      for (const id of exerciseIds) {
        const perEx = byExercise.get(id)
        if (!perEx) continue
        const name = nameOf.get(id) ?? ''
        // Timed holds record SECONDS in `reps` (weight 0). Scoring them by
        // weight collapses every session to est-1RM 0 — the plank graph must
        // track the hold, and its PR is a longer hold, not a heavier one.
        const timed = isTimedExercise(name)

        // Per-set headline: seconds for a hold, best est-1RM for a loaded lift.
        const headline = (s: SetRow) => (timed ? s.reps : (s.est ?? epley1RM(s.weightKg, s.reps)))
        const bestOf = (sets: SetRow[]) => sets.reduce((m, s) => Math.max(m, headline(s)), 0)
        const tonnageOf = (sets: SetRow[]) =>
          Math.round(sets.reduce((s, x) => s + (timed ? x.reps : x.weightKg * x.reps), 0))

        const ordered = [...perEx.entries()].sort(([a], [b]) => a.localeCompare(b))
        const points = ordered.map(([, sets]) => timed ? bestOf(sets) : Math.round(bestOf(sets) * 10) / 10)
        const cur = points[points.length - 1]
        const prev = points.length >= 2 ? points[points.length - 2] : null

        const latestSets = ordered[ordered.length - 1][1]
        const prevSets = ordered.length >= 2 ? ordered[ordered.length - 2][1] : null
        const asWorking = (sets: SetRow[]): WorkingSet[] => sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps }))

        // Loaded → programmed rep ceiling; timed → programmed hold target.
        const ceiling = timed ? holdTargetFor(name, dayKey) : (repWindowFor(name, dayKey)?.ceiling ?? null)

        const topSet = latestSets.reduce<SetRow | null>(
          (best, s) => (!best || headline(s) > headline(best) ? s : best), null,
        )
        const tonnage = tonnageOf(latestSets)

        out[id] = {
          points,
          pctChange: prev && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null,
          best: Math.max(...points),
          tonnage,
          tonnageDelta: prevSets ? tonnage - tonnageOf(prevSets) : null,
          topSet: topSet ? { weightKg: topSet.weightKg, reps: topSet.reps } : null,
          setsAtCeiling: ceiling == null ? 0 : latestSets.filter((s) => s.reps >= ceiling).length,
          progression: (timed ? timedProgressionVerdict : progressionVerdict)(
            prevSets ? [asWorking(prevSets), asWorking(latestSets)] : [asWorking(latestSets)],
            ceiling,
          ),
          timed,
        }
      }
      return out
    },
  })
}
