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

/*
 * ── EVERY TABLE THE WEEKLY EXPORT READS INVALIDATES IT (v4.1) ───────────────
 * `['weekly_export']` used to hang off four tables — `doms_logs`,
 * `custom_supplements`, `daily_targets` and the workout keys. The document
 * reads a dozen more, so a retroactive edit to water, weight, intake, sleep,
 * cardio, a fatigue slot or a supplement tick left the cached markdown stale
 * behind `staleTime: 60_000` and the user re-exported the same stale week.
 *
 * The key is on every contributing table now. It costs one extra refetch of a
 * query nobody is usually looking at, which is the cheaper side of the trade:
 * the other side is a document that quietly disagrees with the app.
 */
export const TABLE_KEYS: Record<string, string[][]> = {
  daily_logs: [['daily_logs'], ['today'], ['readiness_today'], ['coach'], ['trends'], ['continuum'], ['day_vault'], ['sleep_debt'], ['weekly_export']],
  // Steps and active-cal have no key of their own: `useDailyLogs` joins this
  // table into `['daily_logs', …]`, and the dashboard reads it from `['today']`.
  daily_metrics: [['daily_logs'], ['today'], ['readiness_today'], ['day_vault'], ['weekly_export']],
  // Intake moves the day score, not readiness — battery drains on activity and
  // volume, never on calories.
  nutrition_entries: [['nutrition_entries'], ['daily_logs'], ['today'], ['coach'], ['continuum'], ['day_vault'], ['weekly_export']],
  body_composition: [['body_composition'], ['trends'], ['coach'], ['weekly_export']],
  // Sleep is 40% of readiness directly, plus the wake-charge term in battery.
  sleep_sessions: [['sleep_sessions'], ['today'], ['readiness_today'], ['trends'], ['weekly_review'], ['sleep_debt'], ['weekly_export']],
  // Shares the canonical workout-derived key list with the commit/delete
  // mutations so a session change from ANY device refreshes the same surfaces.
  workout_sessions: WORKOUT_QUERY_KEYS,
  // An in-place set edit can touch only workout_sets (the parent session row is
  // untouched), so without this other devices would not see a live rep change.
  workout_sets: WORKOUT_QUERY_KEYS,
  daily_scores: [['today'], ['readiness_today'], ['daily_logs'], ['weekly_review'], ['trends'], ['coach'], ['continuum'], ['day_vault'], ['month_activity'], ['week_recovery']],
  supplement_log: [['supplement_log'], ['day_vault'], ['weekly_export']],
  // `['water_intake']` is what tells the OTHER device a day now carries a manual
  // override, and therefore whether to offer "Clear & use Apple Health".
  water_intake: [['water_intake'], ['today'], ['day_vault'], ['continuum'], ['weekly_review'], ['weekly_export']],
  reports: [['reports'], ['weekly_review']],
  // Settings live-sync across devices. NOT just `['user_goals']`: the targets
  // this row holds are baked into the `['today', date]` bundle and every surface
  // that grades against them.
  user_goals: [['user_goals'], ['today'], ['readiness_today'], ['coach'], ['day_vault'], ['nutrition_entries']],
  // Day swaps cascade into supplements and the day's plan, so the list matches
  // what useSwapDay itself invalidates after a write.
  schedule_overrides: [['schedule_overrides'], ['day_vault'], ['daily_logs'], ['workout_sessions'], ['supplement_log']],

  // ── W4: the sixteen tables the socket was blind to ─────────────────────────
  // The publication carried 13 of 29 mirrored tables, so a phone that logged
  // cardio, a fatigue slot, DOMS, a supplement edit or a PR reached the server
  // and the desktop sat there showing yesterday until something else forced a
  // refetch. Each list below is the one the table's OWN mutation already
  // cascades — copied, not invented, so the socket and the local write refresh
  // the same surfaces and cannot drift apart.
  cardio_logs: [['cardio_logs'], ['weekly_export']],
  fatigue_logs: [['fatigue_logs'], ['weekly_export']],
  // W2, native-only until v4.1 gave the web a reader. The export prints a
  // `**Stress**` row per day; without this the table was in no fan-out at all.
  //
  // `['weekly_export']` ALONE and no `['stress_logs']` key: the web reads
  // `stress_logs` inside the export's own fetch and nowhere else, so a
  // `['stress_logs']` query does not exist to invalidate. `query-key-coverage`
  // is the test that says so, and it is right — an invalidation with no
  // consumer is a line that looks like coverage and is not.
  stress_logs: [['weekly_export']],
  doms_logs: [['doms_logs'], ['doms_sources'], ['weekly_export']],
  // `useCustomSupplements.CASCADE_KEYS` minus `['micros']`, which matches no
  // `useQuery` — see the note there.
  custom_supplements: [['custom_supplements'], ['weekly_export'], ['supplement_log']],
  daily_targets: [['daily_targets'], ['weekly_export'], ['today'], ['day_vault']],
  target_profiles: [['target_profiles'], ['daily_targets']],
  // A commit rewrites the day's template, so this is the same key the workout
  // list carries — a template edited on one device must not leave the other
  // prescribing the old one.
  routine_templates: [['routine_template']],
  program_day_layout: [['program_day_layout']],
  // `useSettingsGoals.PLAN_PHASE_CASCADE_KEYS`: the goals row is what
  // `useNutritionGoals` resolves AHEAD of `user_goals`, so every surface that
  // grades against a target has to come with it.
  plan_phase_goals: [['plan_phase_goals'], ['user_goals'], ['today'], ['readiness_today'], ['coach'], ['day_vault'], ['nutrition_entries']],
  plan_phase_volume: [['plan_phase_goals'], ['weekly_volume'], ['muscle_analytics']],
  personal_records: [['personal_records'], ['session_pr_records'], ['session_detail'], ['weekly_review']],
  // The catalogue: the phone can CREATE a row here (Wave 4's exercise push),
  // and a name it invents has to reach the desktop's pickers.
  exercises: [['exercises'], ['exercise_history']],
  profiles: [['my-profile']],
}

export const REALTIME_TABLES = Object.keys(TABLE_KEYS)
