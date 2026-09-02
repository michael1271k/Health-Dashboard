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
 *
 * ── EVERY PREFIX HERE MUST MATCH A REGISTERED `queryKey` ─────────────────────
 * An invalidation that matches nothing is not a no-op you can leave lying about
 * — it reads like coverage. `['daily_scores']` sat in both lists (and in seven
 * RealtimeProvider entries) for exactly that reason: the table is real, so the
 * key looked right. But no `useQuery` is ever *keyed* on it — every read of that
 * table lives inside `['today']`, `['day_vault']`, `['continuum']`, `['trends']`
 * or `['readiness_today']`. Four of those were already listed, which is why the
 * gap stayed invisible; `['readiness_today']` was not, so the readiness orb kept
 * a stale battery for its full 5-minute staleTime after any recompute.
 *
 * `src/tests/query-key-coverage.test.ts` now fails on any prefix with no
 * registered consumer.
 */
export const WORKOUT_QUERY_KEYS: string[][] = [
  ['workout_sessions'],
  ['workout_sets'],
  ['exercises'],       // the catalog: a commit can CREATE a row (resolveExercises)
  ['routine_template'], // saveSession rewrites the day's template on every commit
  ['continuum'],
  ['day_vault'],
  ['readiness_today'], // battery drains on volume RELATIVE to this day type's own
                       // trailing average, ceilinged per day (WORKOUT_MAX_BY_DAY)
  ['weekly_volume'],   // MEV/MAV accumulator — stale after every commit/edit
  ['session_trends'],  // per-exercise progression + double-progression verdict
  ['weekly_export'],   // the AI payload embeds sessions + volume
  ['muscle_analytics'],
  ['exercise_history'],
  ['session_intel'],
  ['session_detail'],
  ['gym_reports'],
  ['month_activity'],
  ['trends'],
  ['weekly_review'],
  ['coach'],
  ['session_global_number'],
  ['week_recovery'],
  /*
   * ── ADDED 2026-08-31, ALL FOUND BY THE INVERSE GUARD ──────────────────────
   * `query-key-coverage.test.ts` asserted list -> consumer and never consumer ->
   * list, so a query could read `workout_sessions` and simply not be here. Four
   * did. The visible one: `['week_so_far']` backs the dashboard's week card at
   * a 5-minute staleTime, so finishing a session left the card showing
   * PRE-COMMIT tonnage for five minutes on the screen you land on immediately
   * after finishing it.
   */
  ['week_so_far'],          // workout_sessions + daily_scores + sleep_sessions
  ['effort_baseline'],      // workout_sessions + workout_sets — the RPE ladder's floor
  ['session_pr_records'],   // workout_sets
  ['session_metrics_seed'], // workout_sessions — seeds the finish sheet's numbers
  ['doms_sources'],         // doms_logs, attributed BY session (see doms-source-columns)
  ['personal_records'],     // a commit CREATES rows here (prEngine.recordSets)
  ['progression_queue'],    // workout_sets — next-session load suggestions
  ['doms_logs'],            // the entry itself, not just its session attribution
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
  ['today'],             // bundled dashboard "today" view (score+log+metrics+nutrition+sleep)
  ['daily_logs'],        // vitals, nutrition history, dashboard today-log
                         // (also the steps/active-cal read — useDailyLogs joins
                         //  daily_metrics under this key, so there is no
                         //  ['daily_metrics'] consumer to invalidate)
  ['nutrition_entries'], // macro rings/history + dashboard
  ['sleep_sessions'],    // dashboard sleep tile
  ['body_composition'],  // weight trend + InBody
  ['weigh_in'],          // last-genuine-weigh-in recency label
  ['readiness_today'],   // battery + sleep score behind the orb
  ['continuum'],         // journey/pathfinder day rows
  ['trends'],            // command-center trend strips
  ['weekly_review'],
  ['week_recovery'],
  ['day_vault'],
  ['month_activity'],
  ['last_updated'],
  // Same inverse-guard sweep as the workout list above.
  ['week_so_far'],          // reads daily_scores + sleep_sessions as well as sessions
  ['energy_balance'],       // daily_logs + nutrition_entries — had NO invalidation path
  ['steps_trend'],          // daily_metrics + daily_logs
  ['latest_body_reading'],  // daily_logs — the carry-forward source for InBody
  ['previous_cardio'],      // cardio_logs
  ['cardio_logs'],          // the log list itself
  ['sleep_onset'],          // daily_logs.sleep_onset_trouble
  // The session report reads `cardio_logs` as well as `workout_sets` now — the
  // treadmill warm-up used to vanish from a session the moment it was committed
  // (see `SessionCardio`). It is already a WORKOUT key; it needs to be a health
  // one too, because a cardio row edited from the daily ledger changes what the
  // report shows and nothing else on this list covers it.
  ['session_detail'],
]

/** Revalidate only Apple-Health-derived surfaces (pull-to-refresh). */
export function invalidateHealthData(qc: QueryClient): void {
  for (const key of HEALTH_QUERY_KEYS) qc.invalidateQueries({ queryKey: key })
}
