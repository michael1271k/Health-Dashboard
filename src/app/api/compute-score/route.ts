import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { computeDailyScore } from '@/lib/scoring/score'
import { computeBattery } from '@/lib/scoring/battery'
import type { ScoringInputs } from '@/lib/scoring/types'
import type { Database, Tables, InsertRow } from '@/lib/supabase/types'
import { isRestDayFor, prescribedFor } from '@/lib/programs'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { resolveCallerUserId } from '@/lib/auth/identity'
import { nightWindow } from '@/lib/sleep/nightWindow'
import { logicalTodayISO, hoursAwakeToday } from '@/lib/utils/day'

type DB = SupabaseClient<Database>

function todayISO(): string {
  return logicalTodayISO() // device-local calendar day, midnight boundary
}
function nextDay(d: string): string {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10)
}

/** Compute + upsert the daily_scores row for a single date. */
async function computeForDate(supabase: DB, userId: string, date: string, hoursAwake: number, isToday = false, force = false): Promise<void> {
  // FREEZE: a past day is sealed the first time it's computed after its own
  // midnight. Today accumulates live (recomputed every call); a past day whose
  // row is already `finalized` is immutable — re-ingesting old data never
  // rewrites a snapshot. `force` (an explicit edit/delete of that day's data)
  // bypasses the freeze so Readiness recalculates immediately.
  if (!isToday && !force) {
    const { data: existing, error } = await supabase
      .from('daily_scores').select('finalized').eq('user_id', userId).eq('date', date).maybeSingle()
    if (!error && (existing as { finalized?: boolean } | null)?.finalized) return
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
    supabase.from('workout_sessions').select('id, total_volume_kg, split_day, day_key, set_count').eq('user_id', userId)
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
    day_key: string | null; set_count: number | null
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
  let dlRaw: unknown[] | null = null
  const dlFull = await dlQuery('date, hrv_ms, avg_rest_heart_rate')
  if (dlFull.error) {
    const dlFallback = await dlQuery('date, avg_rest_heart_rate')
    dlRaw = (dlFallback.data ?? []).map((r) => ({ ...(r as object), hrv_ms: null }))
  } else {
    dlRaw = dlFull.data
  }
  const dl = (dlRaw ?? []) as Array<{ date: string; hrv_ms: number | null; avg_rest_heart_rate: number | null }>
  const todayDl = dl.find((r) => r.date === date)
  const trail = dl.filter((r) => r.date !== date)
  const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const hrvBaseline = avgOf(trail.map((r) => r.hrv_ms).filter((v): v is number => v != null))
  const rhrBaseline = avgOf(trail.map((r) => r.avg_rest_heart_rate).filter((v): v is number => v != null))

  // GHOST GUARD: a past day with zero underlying data must never get a score
  // row — trailing baselines/rest-day logic can otherwise fabricate one
  // (score-only "ghost days" polluting the Journey). Today accumulates live.
  if (!isToday && date !== todayISO() && !metrics && !sleep && !nutrition
      && !(water?.length) && !(supplements?.length) && !(daySessions?.length) && !todayDl) return

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

  const isRestDay = isRestDayFor(date)  // era-aware: HELIX-5 rests Tue/Fri; PPL legacy Fri/Sat
  // isToday comes from the caller (the client knows its own timezone); derive the
  // user's local hour from hoursAwake (07:00 wake convention) instead of a fixed zone.
  const isCurrentDay = isToday || date === todayISO()
  const localHour = Math.min(23, 7 + Math.round(hoursAwake))

  const g = goals ?? {
    sleep_goal_hours: 8, calorie_goal: 1955, protein_goal_g: 170, carbs_goal_g: 195,
    fat_goal_g: 55, steps_goal: 10000, active_cal_goal: 500, water_goal_ml: 3000,
  }
  // What the program prescribed for this day, cut-adjusted (bulkOnly lifts
  // dropped, cutSetDelta applied). null when the day isn't a known program day —
  // the scorer then drops the coverage component rather than inventing a plan.
  const programMode: 'cut' | 'bulk' = (g.calorie_goal ?? 0) >= 2450 ? 'bulk' : 'cut'
  const prescribed = dayKey ? prescribedFor(dayKey, programMode) : null

  const totalWaterMl = (water ?? []).reduce((s, r) => s + r.amount_ml, 0)
  const sessionVolumeKg = (daySessions ?? []).reduce((s, r) => s + (r.total_volume_kg ?? 0), 0)
  // Battery hardness keys off the heaviest session of the day (legs ≫ arms).
  const hardestSplit = (daySessions ?? [])
    .slice()
    .sort((a, b) => (b.total_volume_kg ?? 0) - (a.total_volume_kg ?? 0))[0]?.split_day ?? undefined

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
  if (components.totalScore == null) return
  const battery = computeBattery(inputs, hoursAwake)
  const scoreRow: InsertRow<'daily_scores'> & { finalized?: boolean } = {
    user_id: userId, date,
    score: components.totalScore, sleep_score: components.sleepScore,
    nutrition_score: components.nutritionScore, activity_score: components.activityScore,
    workout_score: components.workoutScore, recovery_score: components.recoveryScore,
    battery_pct: battery.currentPct,
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
  }
}

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const supabase = getServerSupabaseClient()

  // Multi-tenant: a JWT caller gets THEIR scores computed; headless/cron calls
  // (no JWT) sweep the whole household so every member's day stays scored.
  const caller = await resolveCallerUserId(req, supabase)
  let userIds: string[]
  if (caller) {
    userIds = [caller]
  } else {
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
    if (usersError || !users.length) return NextResponse.json({ error: 'No user' }, { status: 401 })
    userIds = users.map((u) => u.id)
  }

  // The CLIENT knows the user's real timezone (device-local logical day + hours
  // awake) — the server cannot. Trust client-provided values when present and
  // fall back to the server clock only for cron/headless calls.
  const body = await req.json().catch(() => ({})) as { backfillDays?: number; date?: string; hoursAwake?: number; force?: boolean; isToday?: boolean }
  const backfillDays = Math.max(0, Math.min(31, Number(body?.backfillDays) || 0))
  const today = body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayISO()
  const awake = Number.isFinite(body?.hoursAwake) ? Math.max(0, Math.min(18, Number(body?.hoursAwake))) : hoursAwakeToday()
  // Edit/delete recompute: `force` bypasses the finalized freeze; the client
  // says whether the target date is its logical today (live) or a past day.
  const force = !!body?.force
  const targetIsToday = typeof body?.isToday === 'boolean' ? body.isToday : (today === todayISO())

  for (const userId of userIds) {
    await computeForDate(supabase, userId, today, awake, targetIsToday, force)
    for (let i = 1; i <= backfillDays; i++) {
      const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - i)
      // `force` propagates to the backfill range so an explicit recompute (e.g.
      // after a manual data correction) rewrites even FINALIZED past days;
      // without it the finalized-freeze silently skips them.
      await computeForDate(supabase, userId, d.toISOString().slice(0, 10), 16, false, force)  // past days: full day
    }
  }

  return NextResponse.json({ ok: true, today, backfilled: backfillDays, users: userIds.length })
}
