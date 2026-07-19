import type { QueryClient } from '@tanstack/react-query'

/**
 * Every React Query key prefix whose data is derived from workout sessions/sets.
 * Single source of truth so a workout mutation (commit / edit / delete) AND the
 * realtime socket refresh the SAME surfaces — no more charts, counters, or the
 * muscle map going stale after logging. TanStack matches by prefix, so
 * `['workout_sets']` also covers `['workout_sets','pr_history',…]` etc.
 *
 * Leaf module (no React/provider imports) so both the mutation hooks and
 * RealtimeProvider can import it without a cycle.
 */
export const WORKOUT_QUERY_KEYS: string[][] = [
  ['workout_sessions'],
  ['workout_sets'],
  ['continuum'],
  ['day_vault'],
  ['daily_scores'],
  ['muscle_analytics'],
  ['exercise_history'],
  ['session_intel'],
  ['gym_reports'],
  ['month_activity'],
  ['trends'],
  ['weekly_review'],
  ['coach'],
  ['fuel_force_session'],
  ['session_global_number'],
  ['week_recovery'],
]

/** Invalidate every workout-derived query so all dependent UI refetches at once. */
export function invalidateWorkoutData(qc: QueryClient): void {
  for (const key of WORKOUT_QUERY_KEYS) qc.invalidateQueries({ queryKey: key })
}
