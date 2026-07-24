'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { epley1RM } from '@/lib/utils/epley'
import { eraForDate } from '@/lib/programs'

/** Rep ceiling for double progression — clear it on every working set and add load. */
export const REP_CEILING = 12
/** Recommended jump once the ceiling is cleared. */
export const LOAD_STEP_KG = 2.5

export interface ExerciseTrend {
  /** Best est-1RM per session, oldest → newest (one point per session). */
  points: number[]
  /** % change from the previous session's best est-1RM to this one. */
  pctChange: number | null
  /** All-time best est-1RM within the era. */
  best: number
  /** Every working set cleared the rep ceiling at a single load → add weight. */
  doubleProgression: boolean
}

/**
 * Per-exercise progression for one session's exercises, in ONE query.
 *
 * est-1RM is collapsed to the BEST set per session (plotting every set made a
 * single session's top-set-then-back-off read as a strength drop). The trend is
 * era-scoped so a new program never inherits the old block's history.
 */
export function useSessionTrends(exerciseIds: string[], eraDate: string) {
  const key = [...exerciseIds].sort().join(',')
  return useQuery({
    queryKey: ['session_trends', key, eraDate],
    enabled: exerciseIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ExerciseTrend>> => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, est_1rm_kg, set_type, workout_sessions!inner(started_at)')
        .in('exercise_id', exerciseIds)
        .limit(4000)
      if (error) throw error

      const era = eraForDate(eraDate)
      const rows = ((data ?? []) as unknown as Array<{
        exercise_id: string; weight_kg: number; reps: number
        est_1rm_kg: number | null; set_type: string | null
        workout_sessions: { started_at: string }
      }>).filter((r) => eraForDate(r.workout_sessions.started_at.slice(0, 10)) === era)

      // exercise → session instant → best est-1RM (+ the working sets of the
      // most recent session, for the double-progression check).
      const bySession = new Map<string, Map<string, number>>()
      const latestSets = new Map<string, { at: string; sets: Array<{ w: number; reps: number }> }>()

      for (const r of rows) {
        if (r.set_type === 'warmup') continue
        const est = r.est_1rm_kg ?? epley1RM(r.weight_kg, r.reps)
        const at = r.workout_sessions.started_at
        const perEx = bySession.get(r.exercise_id) ?? new Map<string, number>()
        perEx.set(at, Math.max(perEx.get(at) ?? 0, est))
        bySession.set(r.exercise_id, perEx)

        const cur = latestSets.get(r.exercise_id)
        if (!cur || at > cur.at) latestSets.set(r.exercise_id, { at, sets: [{ w: r.weight_kg, reps: r.reps }] })
        else if (at === cur.at) cur.sets.push({ w: r.weight_kg, reps: r.reps })
      }

      const out: Record<string, ExerciseTrend> = {}
      for (const id of exerciseIds) {
        const perEx = bySession.get(id)
        if (!perEx) continue
        const points = [...perEx.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => Math.round(v * 10) / 10)
        const cur = points[points.length - 1]
        const prev = points.length >= 2 ? points[points.length - 2] : null
        const last = latestSets.get(id)
        // Double progression: every working set of the latest session cleared the
        // rep ceiling at ONE consistent load → the load is no longer limiting.
        const dp = !!last && last.sets.length > 0
          && last.sets.every((s) => s.reps >= REP_CEILING)
          && new Set(last.sets.map((s) => s.w)).size === 1
          && last.sets[0].w > 0
        out[id] = {
          points,
          pctChange: prev && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null,
          best: Math.max(...points),
          doubleProgression: dp,
        }
      }
      return out
    },
  })
}
