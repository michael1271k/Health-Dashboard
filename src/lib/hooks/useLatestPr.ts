'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { PrAxis } from '@/lib/training/prEngine'

export interface StandingPr {
  exercise: string
  axis: PrAxis
  value: number | null
  reps: number | null
  weightKg: number | null
  achievedOn: string
}

const AXES: readonly string[] = ['weight', 'reps', 'volume', 'est1rm']

/**
 * The most recently claimed standing records, newest first.
 *
 * ── WHAT `personal_records` ACTUALLY HOLDS ───────────────────────────────────
 * ONE STANDING ROW per (exercise, axis) — not a history. A record that has since
 * been beaten is not in this table at all; it was overwritten by the one that
 * beat it. So "order by achieved_on desc" is not "the last few records I set",
 * it is "the records that are currently standing, most recently set first",
 * which is the honest thing for a widget to show and is why the type is named
 * `StandingPr` rather than `RecentPr`.
 *
 * ── AND WHY IT IS LIFTING-ONLY ───────────────────────────────────────────────
 * Cardio records are derived at read time from `cardio_logs` and never written
 * here (pace is a MINIMUM with a 1 km floor). A widget that mixed the two would
 * be comparing a stored row against a computed one and would show a "record"
 * that the ledger does not know about.
 *
 * A failure returns an empty list rather than throwing: a missing record book
 * is a quiet tile, never a broken dashboard.
 */
export function useLatestPr(limit = 6) {
  return useQuery({
    queryKey: ['personal_records', 'latest', limit],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StandingPr[]> => {
      const { data, error } = await supabase
        .from('personal_records')
        .select('exercise_key, axis, value, reps, weight_kg, achieved_on')
        .order('achieved_on', { ascending: false })
        .limit(limit)
      if (error) return []
      return ((data ?? []) as Array<{
        exercise_key: string; axis: string; value: number | null
        reps: number | null; weight_kg: number | null; achieved_on: string
      }>)
        // An axis this build does not know how to label would render as a blank
        // qualifier next to a real number, which reads as a bug in the number.
        .filter((r) => AXES.includes(r.axis))
        .map((r) => ({
          exercise: r.exercise_key,
          axis: r.axis as PrAxis,
          value: r.value,
          reps: r.reps,
          weightKg: r.weight_kg,
          achievedOn: r.achieved_on,
        }))
    },
  })
}
