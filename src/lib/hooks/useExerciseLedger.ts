'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { exerciseSummary, EMPTY_EXERCISE_SUMMARY, type ExerciseSummarySet } from '@/lib/training/exerciseSummary'

/**
 * Every set one exercise has ever carried, for the summary the page prints.
 *
 * ── WHY NOT THE RPC ──────────────────────────────────────────────────────────
 * `exercise_history` still draws the CHARTS — it aggregates per day server-side
 * and there is no reason to move that. What it cannot do is the summary: it
 * counts each side of a unilateral pair as its own set, because it has no
 * `pair_id` to collapse on, and its `best_1rm` is a plain `max(est_1rm_kg)`
 * with no Epley fallback. The phone has always collapsed pairs and fallen back,
 * so the same lift read differently on the two clients and the page carried a
 * footnote admitting it.
 *
 * The rows are small (a few hundred for a well-trained movement) and the query
 * is cached for five minutes, which is the same budget the RPC had.
 */
interface LedgerRow {
  session_id: string
  weight_kg: number | null
  reps: number | null
  est_1rm_kg: number | null
  set_type: string | null
  side: string | null
  pair_id: string | null
}

export function useExerciseLedger(exerciseId: string | null) {
  return useQuery({
    queryKey: ['workout_sets', 'exercise_ledger', exerciseId] as const,
    enabled: !!exerciseId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExerciseSummarySet[]> => {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('session_id, weight_kg, reps, est_1rm_kg, set_type, side, pair_id')
        .eq('exercise_id', exerciseId as string)
        .limit(4000)
      if (error) throw error
      return ((data ?? []) as unknown as LedgerRow[]).map((r) => ({
        sessionId: r.session_id,
        weightKg: r.weight_kg ?? 0,
        reps: r.reps ?? 0,
        est: r.est_1rm_kg,
        setType: r.set_type,
        side: r.side,
        pairId: r.pair_id,
      }))
    },
  })
}

/** The three headline numbers, through the twin the phone uses. */
export function useExerciseSummary(exerciseId: string | null, timed = false) {
  const { data, isPending } = useExerciseLedger(exerciseId)
  return { summary: data ? exerciseSummary(data, timed) : EMPTY_EXERCISE_SUMMARY, isPending }
}
