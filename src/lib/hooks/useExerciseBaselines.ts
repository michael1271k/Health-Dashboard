'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { isTimedExercise } from '@/lib/exercises/timed'
import { buildBaselines, EMPTY_BASELINES, type PrBaselines } from '@/lib/training/prEngine'
import { prFloorFor } from '@/lib/training/prTruth'
import { canonicalExerciseName } from '@/lib/exercises/aliases'

/**
 * All-time PR baselines for the exercises in the live deck, keyed by exercise
 * NAME (the deck has names, not UUIDs — the route resolves those at commit).
 *
 * `beforeDate` is exclusive and load-bearing: without it, re-opening a session
 * you already logged today would fold today's own sets into the baseline and
 * every set would then fail to beat "itself". Records are always judged against
 * what came BEFORE this session.
 *
 * Returns the engine's tuple form so the payload is JSON-safe and the query
 * cache can actually persist it (see QueryProvider — a Map dehydrates to `{}`).
 */
export function useExerciseBaselines(names: string[], beforeDate: string | undefined) {
  const key = [...names].sort().join('|')
  return useQuery({
    queryKey: ['workout_sets', 'pr_baselines', key, beforeDate ?? 'all'],
    enabled: names.length > 0 && !!beforeDate,
    staleTime: 60_000,
    queryFn: async (): Promise<PrBaselines> => {
      const { data, error } = await supabase
        .from('workout_sets')
        // `pair_id`/`side` are load-bearing for the volume axis: a unilateral
        // pair is ONE set scored at its weaker side, so the bar has to be built
        // that way too or a pair is judged against a per-side history.
        .select('weight_kg, reps, est_1rm_kg, set_type, side, pair_id, session_id, exercises!inner(name), workout_sessions!inner(started_at)')
        .in('exercises.name', names)
        .lt('workout_sessions.started_at', `${beforeDate}T00:00:00Z`)
        .limit(4000)
      if (error) return EMPTY_BASELINES

      const rows = ((data ?? []) as unknown as Array<{
        weight_kg: number | null; reps: number | null; est_1rm_kg: number | null
        set_type: string | null; side: string | null; pair_id: string | null
        session_id: string | null
        exercises: { name: string }
      }>).map((r) => ({
        key: r.exercises.name,
        weightKg: r.weight_kg,
        reps: r.reps,
        est1rm: r.est_1rm_kg,
        setType: r.set_type,
        side: r.side,
        pairId: r.pair_id,
        sessionId: r.session_id,
      }))

      // Deliberately era-agnostic and NOT routine-scoped: a personal record is
      // all-time and belongs to the lift, not to the day you happened to do it.
      // (Exercise MEMORY is routine-scoped — a different question.)
      //
      // The floor is what keeps the live deck honest about a history it cannot
      // see: sets only exist from 2026-07-16, so without it the badge fires on a
      // load that was beaten months ago. Canonicalised on lookup because the
      // record book is keyed on canonical names and `exercises.name` may be an
      // alias of one. See prTruth.ts.
      return buildBaselines(rows, isTimedExercise, (key) => prFloorFor(canonicalExerciseName(key)))
    },
  })
}
