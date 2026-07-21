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
  ['session_detail'],
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

/**
 * Every React Query key prefix whose data is derived from Apple Health / daily
 * logs (steps, sleep, body-comp, vitals, recovery, nutrition). Pull-to-refresh
 * uses this to revalidate ONLY the health surfaces instead of blowing away the
 * entire cache (the old `invalidateQueries()` with no args refetched everything —
 * charts, workouts, the lot — after every pull). TanStack matches by prefix, so
 * `['daily_logs']` covers `['daily_logs','vitals',…]`, `['daily_logs','today']`, etc.
 */
export const HEALTH_QUERY_KEYS: string[][] = [
  ['daily_logs'],        // vitals, nutrition history, dashboard today-log
  ['daily_metrics'],     // dashboard steps/active-cal/rest-hr
  ['nutrition_entries'], // macro rings/history + dashboard
  ['sleep_sessions'],    // dashboard sleep tile
  ['body_composition'],  // weight trend + InBody
  ['daily_scores'],      // recovery / battery / day score
  ['continuum'],         // journey/pathfinder day rows
  ['trends'],            // command-center trend strips
  ['weekly_review'],
  ['week_recovery'],
  ['day_vault'],
  ['month_activity'],
  ['last_updated'],
]

/** Revalidate only Apple-Health-derived surfaces (pull-to-refresh). */
export function invalidateHealthData(qc: QueryClient): void {
  for (const key of HEALTH_QUERY_KEYS) qc.invalidateQueries({ queryKey: key })
}
