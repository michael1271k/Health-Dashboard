'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export interface ExerciseHistoryRecords {
  heaviest_weight: number | null
  best_1rm: number | null
  best_set_volume: number | null
  best_session_volume: number | null
  total_reps: number
}
export interface ExerciseHistoryPoint {
  day: string
  top_weight: number | null
  best_1rm: number | null
  /**
   * Mean est-1RM over the day's WORKING sets — the session's strength, not its
   * best set. Optional: a database whose `exercise_history` has not been
   * replaced yet omits it, and every reader falls back to `best_1rm`.
   *
   * `best_1rm` is a max, so under double progression it freezes as soon as set
   * 1 reaches the rep ceiling and stays frozen while the later sets climb. The
   * chart drew a flat line through five sessions of real progress.
   */
  avg_1rm?: number | null
  session_volume: number | null
  reps: number | null
}
export interface ExerciseHistoryData {
  records: ExerciseHistoryRecords
  timeline: ExerciseHistoryPoint[]
}

const EMPTY: ExerciseHistoryData = {
  records: { heaviest_weight: null, best_1rm: null, best_set_volume: null, best_session_volume: null, total_reps: 0 },
  timeline: [],
}

/**
 * Per-exercise history (Hevy-style): heaviest weight, best est-1RM, best set /
 * session volume, total reps, and a day-by-day timeline. Powered by the
 * `exercise_history` Postgres RPC (RLS-scoped via auth.uid()), so all the
 * aggregation happens in one indexed query.
 */
/**
 * The query options, extracted so the hook and the library's prefetch cannot
 * drift apart. A prefetch that writes a different key from the hook that reads
 * it is a cache miss that looks like a slow network.
 */
export function exerciseHistoryQuery(exerciseId: string | null) {
  return {
    queryKey: ['exercise_history', exerciseId] as const,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExerciseHistoryData> => {
      // Args cast: the hand-authored Functions type makes rpc's Args generic fall
      // back to `never` (inference friction) — assert to satisfy the call.
      const { data, error } = await supabase.rpc('exercise_history', { p_exercise_id: exerciseId as string } as never)
      if (error || !data) return EMPTY
      const d = data as Partial<ExerciseHistoryData>
      return {
        records: { ...EMPTY.records, ...(d.records ?? {}) },
        timeline: Array.isArray(d.timeline) ? d.timeline : [],
      }
    },
  }
}

export function useExerciseHistory(exerciseId: string | null) {
  return useQuery({ ...exerciseHistoryQuery(exerciseId), enabled: !!exerciseId })
}
