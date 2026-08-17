import type { SupabaseClient } from '@supabase/supabase-js'
import { computeDailyScore } from '@/lib/scoring/score'
import { computeBattery } from '@/lib/scoring/battery'
import type { ScoringInputs } from '@/lib/scoring/types'
import type { Database, Tables, InsertRow } from '@/lib/supabase/types'
import { prescribedFor, DEFAULT_PROGRAM_ID } from '@/lib/programs'
import { phaseGoalsFor } from '@/lib/types/workout'
import { nightWindow } from '@/lib/sleep/nightWindow'
import { isExceptionDay } from '@/lib/nutrition/exceptionDay'

/** The goals a user with no `user_goals` row is graded against. */
const CUT = phaseGoalsFor(DEFAULT_PROGRAM_ID, 'cut')

/**
 * Compute and upsert one day's `daily_scores` row.
 *
 * ── WHY THIS LIVES IN lib/ AND NOT IN THE ROUTE ──────────────────────────────
 * It was a private function inside `POST /api/compute-score`, which made the
 * app the only thing that could ever refresh a score. That is precisely why the
 * home-screen widget went stale: `battery_pct` decays with HOURS AWAKE, so it is
 * wrong within an hour of being written even when no new data has arrived, and
 * nothing recomputed it unless the user opened the app. The widget was faithful;
 * the row it read was old.
 *
 * `/api/widget/snapshot` now calls this directly for TODAY before it answers, so
 * a widget refresh refreshes the number rather than re-reading a stale one. The
 * function is unchanged in behaviour — only its home and two of its inputs moved.
 *
 * SERVER-SAFE by construction: no React, no `'use client'` module, no
 * `localStorage`. See `src/tests/route-client-boundary.test.ts` for why that
 * matters at all (one client import 500'd the widget endpoint for its entire
 * life).
 */
type DB = SupabaseClient<Database>

/**
 * The two facts this function cannot work out for itself.
 *
 * `isRestDay` used to be `isRestDayFor(date)` computed inline — which reads the
 * active plan and the per-date swaps out of **localStorage**, so on a server it
 * always answered against the DEFAULT plan with no swaps applied. Every score
 * this route has ever written graded rest days against a week the athlete may
 * not have been training. It is a parameter now because only the caller, which
 * has the `user_goals` / `schedule_overrides` rows in hand, can answer it.
 *
 * `todayISO` is the CALLER's logical today. The server clock is UTC and would
 * put the ghost guard a day out for part of every day.
 */
export interface ComputeDayContext {
  isRestDay: boolean
  todayISO: string
  /** The date is the caller's live day (accumulates) rather than a sealed past one. */
  isToday?: boolean
  /** Bypass the `finalized` freeze — an explicit edit/delete recompute. */
  force?: boolean
}

function nextDay(d: string): string {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10)
}

export type ComputedScoreRow = InsertRow<'daily_scores'> & { finalized?: boolean }

export async function computeForDate(
  supabase: DB,
  userId: string,
  date: string,
  hoursAwake: number,
  ctx: ComputeDayContext,
): Promise<ComputedScoreRow | null> {
  const { isRestDay, todayISO, isToday = false, force = false } = ctx
  // FREEZE: a past day is sealed the first time it's computed after its own
  // midnight. Today accumulates live (recomputed every call); a past day whose
  // row is already `finalized` is immutable — re-ingesting old data never
  // rewrites a snapshot. `force` (an explicit edit/delete of that day's data)
  // bypasses the freeze so Readiness recalculates immediately.
  if (!isToday && !force) {
    const { data: existing, error } = await supabase
      .from('daily_scores').select('finalized').eq('user_id', userId).eq('date', date).maybeSingle()
    if (!error && (existing as { finalized?: boolean } | null)?.finalized) return null
  }

  const end = nextDay(date)
  const night = nightWindow(date)
  const [metricsRes, sleepRes, nutritionRes, waterRes, supplementsRes, goalsRes, sessionsRes] = await Promise.all([
    supabase.from('daily_metrics').select('*').eq('user_id', userId).eq('date', date).maybeSingle(),
    // NIGHT WINDOW, not calendar day. `start_time` is BEDTIME — the PREVIOUS
    // EVENING (e.g. 2026-07-22T20:45 for the night of the 23rd). Querying
    // `start_time >= date 00:00` therefore matched NOTHING, so the scorer saw
    // sleepHours = 0 on every single day. That one bug produced "Awaiting Sleep
    // Data" despite a synced night, a 55% wake battery (sleepQuality → 0), and
    // the July-15 score of 81 (the short-sleep gate never fired). The window is
    // shared with the ingest writer and useTodaySleep — longest session wins.
    supabase.from('sleep_sessions').select('*').eq('user_id', userId)
      .gte('start_time', night.from).lt('start_time', night.to)
      .order('duration_min', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('nutrition_entries').select('*').eq('user_id', userId)
      .eq('date', date).eq('meal_type', 'daily').maybeSingle(),
    supabase.from('water_intake').select('amount_ml').eq('user_id', userId).eq('date', date),
    // Supplements taken today live in supplement_log (the `supplements` table is
    // empty/legacy) — count only the ones actually ticked off.
    supabase.from('supplement_log').select('item_key').eq('user_id', userId).eq('date', date).eq('taken', true),
    supabase.from('user_goals').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('workout_sessions').select('id, total_volume_kg, split_day, day_key, set_count, session_rpe').eq('user_id', userId)
      .gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${end}T00:00:00Z`),
  ])

  const metrics = metricsRes.data as Tables<'daily_metrics'> | null
  const sleep = sleepRes.data as Tables<'sleep_sessions'> | null
  const nutrition = nutritionRes.data as Tables<'nutrition_entries'> | null
  const water = waterRes.data as Array<{ amount_ml: number }> | null
  const supplements = supplementsRes.data as Array<{ item_key: string }> | null
  const goals = goalsRes.data as Tables<'user_goals'> | null
  const daySessions = sessionsRes.data as Array<{
    id: string; total_volume_kg: number | null; split_day: ScoringInputs['splitDay']
    day_key: string | null; set_count: number | null; session_rpe: number | null
  }> | null

  // Trailing volume baseline, scoped to the SAME SESSION TYPE.
  //
  // It used to average the last 7 sessions of ANY type. Under HELIX-5 that mixes
  // a ~3.3 t arms day with a ~12 t leg day, so the mean (~7 t) marked every arms
  // day as a shortfall and every leg day as a win regardless of how either was
  // actually executed. Matching on day_key (exact program-day identity) with a
  // split_day fallback for legacy rows compares like with like.
  const dayKey = daySessions?.find((s) => s.day_key)?.day_key ?? null
  const splitDayForBaseline = daySessions?.[0]?.split_day ?? null
  let trailingAvg = 0
  if (daySessions?.length) {
    let tq = supabase
      .from('workout_sessions').select('total_volume_kg, day_key, split_day').eq('user_id', userId)
      .lt('started_at', `${date}T00:00:00Z`).order('started_at', { ascending: false }).limit(6)
    tq = dayKey ? tq.eq('day_key', dayKey) : splitDayForBaseline ? tq.eq('split_day', splitDayForBaseline) : tq
    const { data: trailingRaw } = await tq
    const trailing = ((trailingRaw ?? []) as Array<{ total_volume_kg: number | null }>)
      .map((r) => r.total_volume_kg).filter((v): v is number => v != null && v > 0)
    trailingAvg = trailing.length ? trailing.reduce((s, v) => s + v, 0) / trailing.length : 0
  }

  // HRV + resting-HR baselines (7-day trailing) from daily_logs.
  // Self-heal if the hrv_ms column isn't migrated yet: retry without it so the
  // RHR baseline (and the rest of scoring) is never lost to a missing column.
  const dlQuery = (cols: string) => supabase
    .from('daily_logs').select(cols).eq('user_id', userId)
    .lte('date', date).order('date', { ascending: false }).limit(8)
  // Tried widest-first, each tier dropping the newest column. PostgREST 400s the
  // WHOLE select when one column is unknown, so a single fallback would have made
  // an unmigrated `nutrition_exception` cost us `hrv_ms` as well — losing a live
  // baseline to a column that isn't there yet. Normal path is still one request.
  const DL_COLUMN_SETS = [
    'date, hrv_ms, avg_rest_heart_rate, nutrition_exception',
    'date, hrv_ms, avg_rest_heart_rate',
    'date, avg_rest_heart_rate',
  ]
  let dlRaw: unknown[] | null = null
  for (const cols of DL_COLUMN_SETS) {
    const res = await dlQuery(cols)
    if (!res.error) { dlRaw = res.data; break }
  }
  // Absent keys read as undefined, which every `!= null` filter below already
  // drops — a missing column degrades to "no data", never to a wrong number.
  const dl = (dlRaw ?? []) as Array<{
    date: string
    hrv_ms?: number | null
    avg_rest_heart_rate: number | null
    nutrition_exception?: string | null
  }>
  const todayDl = dl.find((r) => r.date === date)
  const trail = dl.filter((r) => r.date !== date)
  const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const hrvBaseline = avgOf(trail.map((r) => r.hrv_ms).filter((v): v is number => v != null))
  const rhrBaseline = avgOf(trail.map((r) => r.avg_rest_heart_rate).filter((v): v is number => v != null))

  // GHOST GUARD: a past day with zero underlying data must never get a score
  // row — trailing baselines/rest-day logic can otherwise fabricate one
  // (score-only "ghost days" polluting the Journey). Today accumulates live.
  if (!isToday && date !== todayISO && !metrics && !sleep && !nutrition
      && !(water?.length) && !(supplements?.length) && !(daySessions?.length) && !todayDl) return null

  // The day's sets, scoped by the parent SESSION rather than workout_sets.created_at
  // (a back-dated session is written today, so created_at would miss it). Supplies
  // the PR count, the exercise coverage and the failure-set count in one read.
  const sessionIds = (daySessions ?? []).map((s) => s.id)
  let prCount = 0
  let loggedExercises = 0
  let sessionSets = 0
  let failureSets = 0
  if (sessionIds.length) {
    const { data: setRows } = await supabase
      .from('workout_sets').select('exercise_id, set_type, is_pr, pair_id, id')
      .eq('user_id', userId).in('session_id', sessionIds)
    const rows = (setRows ?? []) as Array<{
      exercise_id: string; set_type: string | null; is_pr: boolean; pair_id: string | null; id: string
    }>
    const exercises = new Set<string>()
    const working = new Set<string>()
    for (const r of rows) {
      if (r.is_pr) prCount += 1
      if ((r.set_type ?? 'normal') === 'warmup') continue
      exercises.add(r.exercise_id)
      // Unilateral L/R sub-sets share a pair_id and are ONE set.
      working.add(r.pair_id ?? r.id)
      if (r.set_type === 'failure') failureSets += 1
    }
    loggedExercises = exercises.size
    sessionSets = working.size
  }

  // isToday comes from the caller (the client knows its own timezone); derive the
  // user's local hour from hoursAwake (07:00 wake convention) instead of a fixed zone.
  const isCurrentDay = isToday || date === todayISO
  const localHour = Math.min(23, 7 + Math.round(hoursAwake))

  // The macro half of this fallback used to be six literals that drifted from
  // the preset they were copied from (1955 here, 1950 there), so a user with no
  // `user_goals` row was graded against a different cut than everyone else.
  // Only the four figures the preset does not carry stay written down here.
  const g = goals ?? {
    sleep_goal_hours: 8,
    calorie_goal: CUT.calorieGoal,
    // `?? 0` is the preset's own convention for "no macro target": score.ts
    // counts a macro only when its goal is > 0. The cut defines all three.
    protein_goal_g: CUT.proteinGoalG ?? 0,
    carbs_goal_g: CUT.carbsGoalG ?? 0,
    fat_goal_g: CUT.fatGoalG ?? 0,
    steps_goal: CUT.stepsGoal,
    active_cal_goal: 500,
    water_goal_ml: 3000,
  }
  // What the program prescribed for this day, per phase (cut uses each lift's
  // cutSets; bulk-only lifts drop out). null when the day isn't a known program
  // day — the scorer then drops the coverage component rather than inventing a plan.
  const programMode: 'cut' | 'bulk' = (g.calorie_goal ?? 0) >= 2450 ? 'bulk' : 'cut'
  const prescribed = dayKey ? prescribedFor(dayKey, programMode) : null

  const totalWaterMl = (water ?? []).reduce((s, r) => s + r.amount_ml, 0)
  const sessionVolumeKg = (daySessions ?? []).reduce((s, r) => s + (r.total_volume_kg ?? 0), 0)
  // The heaviest session of the day carries the day's character. Its split feeds
  // the workout score; its RPE feeds the battery (v7) — on a double-session day
  // the second, lighter session's effort rating should not describe the day.
  const hardestSession = (daySessions ?? [])
    .slice()
    .sort((a, b) => (b.total_volume_kg ?? 0) - (a.total_volume_kg ?? 0))[0]
  const hardestSplit = hardestSession?.split_day ?? undefined

  const inputs: ScoringInputs = {
    sleepHours: sleep ? sleep.duration_min / 60 : 0,
    deepMinutes: sleep?.deep_min ?? 0,
    remMinutes: sleep?.rem_min ?? 0,
    sleepGoalHours: g.sleep_goal_hours,
    calories: nutrition?.calories ?? 0,
    proteinG: nutrition?.protein_g ?? 0,
    carbsG: nutrition?.carbs_g ?? 0,
    fatG: nutrition?.fat_g ?? 0,
    calorieGoal: g.calorie_goal,
    proteinGoalG: g.protein_goal_g ?? 0,
    carbsGoalG: g.carbs_goal_g ?? 0,
    fatGoalG: g.fat_goal_g ?? 0,
    // A declared exception grades the day on protein alone. Read from the day's
    // own row, so back-filling the flag onto a past date and recomputing gives
    // that date the same score it would have had if flagged at the time.
    nutritionException: isExceptionDay(todayDl?.nutrition_exception),
    steps: metrics?.steps ?? 0,
    activeCal: metrics?.active_cal ?? 0,
    stepsGoal: g.steps_goal,
    activeCalGoal: g.active_cal_goal,
    workoutLogged: (daySessions?.length ?? 0) > 0,
    isRestDay,
    newPRsToday: prCount,
    sessionVolumeKg,
    splitDay: hardestSplit,
    trailingAvgVolumeKg: trailingAvg,
    sessionRpe: hardestSession?.session_rpe ?? null,
    sessionDayKey: hardestSession?.day_key ?? dayKey,
    plannedExercises: prescribed?.exercises,
    plannedSets: prescribed?.sets,
    loggedExercises,
    sessionSets: sessionSets || (daySessions ?? []).reduce((s, r) => s + (r.set_count ?? 0), 0),
    failureSets,
    waterMl: totalWaterMl,
    waterGoalMl: g.water_goal_ml,
    supplementsTaken: supplements?.length ?? 0,
    supplementsGoal: 3,
    restingHR: metrics?.rest_hr ?? todayDl?.avg_rest_heart_rate ?? undefined,
    baselineHR: rhrBaseline ?? undefined,
    hrvMs: todayDl?.hrv_ms ?? undefined,
    hrvBaseline: hrvBaseline ?? undefined,
    contextMode: (g as typeof g & { context_mode?: string }).context_mode as ScoringInputs['contextMode'] ?? 'normal',
    isCurrentDay,
    localHour,
  }

  const components = computeDailyScore(inputs)
  // No underlying data at all → leave the day blank rather than write a fake 0.
  if (components.totalScore == null) return null
  const battery = computeBattery(inputs, hoursAwake)
  const scoreRow: ComputedScoreRow = {
    user_id: userId, date,
    score: components.totalScore, sleep_score: components.sleepScore,
    nutrition_score: components.nutritionScore, activity_score: components.activityScore,
    workout_score: components.workoutScore, recovery_score: components.recoveryScore,
    battery_pct: battery.currentPct,
    // `computed_at` defaults to now() on INSERT and there is no update trigger,
    // so on the upsert-update path it kept the timestamp of the very first
    // computation — the column named "computed at" was really "first computed
    // at", and anything asking how old a score is (the widget's staleness check)
    // would have seen every row as ancient forever. Written explicitly.
    computed_at: new Date().toISOString(),
    // Past days are sealed on this write; today stays live (finalized=false).
    finalized: !isToday,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('daily_scores').upsert(scoreRow as unknown as any, { onConflict: 'user_id,date' })
  // A missing `finalized` column (pre-migration) → retry without it so scoring
  // keeps working until the paste-SQL is run.
  if (error && /finalized|column|schema cache|PGRST204/i.test(error.message)) {
    const { finalized: _drop, ...legacy } = scoreRow
    void _drop
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from('daily_scores').upsert(legacy as unknown as any, { onConflict: 'user_id,date' })
  } else if (error) {
    console.error(`[compute-score] upsert ${date} failed:`, error.message)
    return null
  }
  return scoreRow
}
