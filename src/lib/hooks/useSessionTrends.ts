'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { epley1RM } from '@/lib/utils/epley'
import { eraForDate, HELIX_CUT_START } from '@/lib/programs'
import { isTimedExercise } from '@/lib/exercises/timed'
import {
  repWindowFor, holdTargetFor, progressionVerdict, timedProgressionVerdict, workLoads,
  LOAD_STEP_KG, type ProgressionVerdict, type WorkingSet,
} from '@/lib/training/ceilings'

export { LOAD_STEP_KG }

/**
 * How many sets AT THE TOP LOAD reached the ceiling — the "2/3 @ 12" chip.
 *
 * It used to count every set whose reps met the number, which credits back-off
 * and drop sets — deliberately lighter work — as if they were at the load being
 * chased. A session could read "3/3 @ 12" beside a progression verdict that
 * (correctly, via `topLoadCleared`) said the load had not cleared. Two answers
 * to one question, on the same line.
 */
export function setsAtCeilingOf(sets: WorkingSet[], ceiling: number | null): number {
  if (ceiling == null) return 0
  const work = workLoads(sets)
  if (!work.length) return 0
  const top = Math.max(...work.map((s) => s.weightKg))
  return work.filter((s) => s.weightKg === top && s.reps >= ceiling).length
}

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
  /**
   * True when `points`/`tonnage` are REPS OR SECONDS rather than kg — a timed
   * hold, or any exercise that has never carried load. Callers must not append
   * a weight unit to those numbers.
   */
  byReps: boolean
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
      type SetRow = { weightKg: number; reps: number; est: number | null; side: string | null; pairId: string | null }
      const byExercise = new Map<string, Map<string, SetRow[]>>()
      const nameOf = new Map<string, string>()

      for (const r of rows) {
        if (r.set_type === 'warmup') continue
        nameOf.set(r.exercise_id, r.exercises.name)
        const at = r.workout_sessions.started_at
        const perEx = byExercise.get(r.exercise_id) ?? new Map<string, SetRow[]>()
        const bucket = perEx.get(at) ?? []
        bucket.push({ weightKg: r.weight_kg, reps: r.reps, est: r.est_1rm_kg, side: r.side ?? null, pairId: r.pair_id ?? null })
        perEx.set(at, bucket)
        byExercise.set(r.exercise_id, perEx)
      }

      // A unilateral exercise logs L + R as two rows sharing a pair_id. For
      // progression they are ONE set: differing L/R loads would otherwise trip the
      // "single top weight" gate and never clear. Collapse each pair to a single
      // representative — the RIGHT side leads (it sets the rep count; left matches
      // but never exceeds), falling back to the higher-rep side.
      const collapsePairs = (sets: SetRow[]): SetRow[] => {
        const pairs = new Map<string, SetRow[]>()
        const out: SetRow[] = []
        for (const s of sets) {
          if (!s.pairId) { out.push(s); continue }
          const g = pairs.get(s.pairId) ?? []
          g.push(s); pairs.set(s.pairId, g)
        }
        for (const g of pairs.values()) {
          const rep = g.find((s) => s.side === 'R') ?? g.reduce((m, s) => (s.reps > m.reps ? s : m), g[0])
          out.push(rep)
        }
        return out
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

        // The same trap catches UNLOADED work that isn't a hold. Reverse Crunch
        // and Hanging Knee Raise carry no load, so their est-1RM is 0 in every
        // session ever logged: the sparkline was a dead flat line at zero, the
        // percentage change was permanently null, and a genuine 15 → 17 rep
        // progression rendered as nothing happening. Score them on reps, the
        // axis they actually progress on — the same `weight 0` test the PR
        // engine uses for its reps axis (`repsAxisEligible`). Checked across the
        // WHOLE history so an exercise that later gets loaded (weighted dips)
        // switches to est-1RM rather than plotting two units on one axis.
        const unloaded = !timed
          && [...perEx.values()].every((sets) => sets.every((s) => !(s.weightKg > 0)))
        const byReps = timed || unloaded

        // Per-set headline: reps/seconds for unloaded work, best est-1RM loaded.
        const headline = (s: SetRow) => (byReps ? s.reps : (s.est || epley1RM(s.weightKg, s.reps) || 0))
        const bestOf = (sets: SetRow[]) => sets.reduce((m, s) => Math.max(m, headline(s)), 0)
        const tonnageOf = (sets: SetRow[]) =>
          Math.round(sets.reduce((s, x) => s + (byReps ? x.reps : x.weightKg * x.reps), 0))

        const ordered = [...perEx.entries()].sort(([a], [b]) => a.localeCompare(b))
        // Reps and seconds are whole; est-1RM keeps a decimal.
        const points = ordered.map(([, sets]) => byReps ? bestOf(sets) : Math.round(bestOf(sets) * 10) / 10)
        const cur = points[points.length - 1]
        const prev = points.length >= 2 ? points[points.length - 2] : null

        const latestSets = ordered[ordered.length - 1][1]
        const prevSets = ordered.length >= 2 ? ordered[ordered.length - 2][1] : null
        const asWorking = (sets: SetRow[]): WorkingSet[] =>
          collapsePairs(sets).map((s) => ({ weightKg: s.weightKg, reps: s.reps }))

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
          setsAtCeiling: setsAtCeilingOf(asWorking(latestSets), ceiling),
          progression: (timed ? timedProgressionVerdict : progressionVerdict)(
            prevSets ? [asWorking(prevSets), asWorking(latestSets)] : [asWorking(latestSets)],
            ceiling,
          ),
          timed,
          byReps,
        }
      }
      return out
    },
  })
}
