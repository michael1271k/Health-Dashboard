/**
 * Which query keys a Supabase table change invalidates — PURE data, extracted
 * from `RealtimeProvider` so the fan-out can be asserted and ported.
 *
 * ── WHY `['today']` IS ON FIVE OF THESE AND `['daily_scores']` IS ON NONE ─────
 * `['daily_scores']` matches no `useQuery`. Every read of that table happens
 * inside another query — the big one is the bundled `['today', date]`, which
 * fetches score + daily_log + metrics + nutrition + sleep in ONE request. So the
 * five tables feeding that bundle each invalidate `['today']`; `['readiness_today']`
 * gets the same treatment because it reads battery + sleep score.
 */
import { WORKOUT_QUERY_KEYS } from '@/lib/query/workoutKeys'

export const TABLE_KEYS: Record<string, string[][]> = {
  daily_logs: [['daily_logs'], ['today'], ['readiness_today'], ['coach'], ['trends'], ['continuum'], ['day_vault'], ['sleep_debt']],
  // Steps and active-cal have no key of their own: `useDailyLogs` joins this
  // table into `['daily_logs', …]`, and the dashboard reads it from `['today']`.
  daily_metrics: [['daily_logs'], ['today'], ['readiness_today'], ['day_vault']],
  // Intake moves the day score, not readiness — battery drains on activity and
  // volume, never on calories.
  nutrition_entries: [['nutrition_entries'], ['daily_logs'], ['today'], ['coach'], ['continuum'], ['day_vault']],
  body_composition: [['body_composition'], ['trends'], ['coach']],
  // Sleep is 40% of readiness directly, plus the wake-charge term in battery.
  sleep_sessions: [['sleep_sessions'], ['today'], ['readiness_today'], ['trends'], ['weekly_review'], ['sleep_debt']],
  // Shares the canonical workout-derived key list with the commit/delete
  // mutations so a session change from ANY device refreshes the same surfaces.
  workout_sessions: WORKOUT_QUERY_KEYS,
  // An in-place set edit can touch only workout_sets (the parent session row is
  // untouched), so without this other devices would not see a live rep change.
  workout_sets: WORKOUT_QUERY_KEYS,
  daily_scores: [['today'], ['readiness_today'], ['daily_logs'], ['weekly_review'], ['trends'], ['coach'], ['continuum'], ['day_vault'], ['month_activity'], ['week_recovery']],
  supplement_log: [['supplement_log'], ['day_vault']],
  // `['water_intake']` is what tells the OTHER device a day now carries a manual
  // override, and therefore whether to offer "Clear & use Apple Health".
  water_intake: [['water_intake'], ['today'], ['day_vault'], ['continuum'], ['weekly_review']],
  reports: [['reports'], ['weekly_review']],
  // Settings live-sync across devices. NOT just `['user_goals']`: the targets
  // this row holds are baked into the `['today', date]` bundle and every surface
  // that grades against them.
  user_goals: [['user_goals'], ['today'], ['readiness_today'], ['coach'], ['day_vault'], ['nutrition_entries']],
  // Day swaps cascade into supplements and the day's plan, so the list matches
  // what useSwapDay itself invalidates after a write.
  schedule_overrides: [['schedule_overrides'], ['day_vault'], ['daily_logs'], ['workout_sessions'], ['supplement_log']],
}

export const REALTIME_TABLES = Object.keys(TABLE_KEYS)
