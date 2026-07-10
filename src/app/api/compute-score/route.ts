import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { computeDailyScore } from '@/lib/scoring/score'
import { computeBattery } from '@/lib/scoring/battery'
import type { ScoringInputs } from '@/lib/scoring/types'
import type { Database, Tables, InsertRow } from '@/lib/supabase/types'
import { isRestDayFor } from '@/lib/programs'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { logicalTodayISO, israelHoursAwake } from '@/lib/utils/day'

type DB = SupabaseClient<Database>

function todayISO(): string {
  return logicalTodayISO() // logical day (04:00 cutoff), Israel time
}
function nextDay(d: string): string {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10)
}

/** Compute + upsert the daily_scores row for a single date. */
async function computeForDate(supabase: DB, userId: string, date: string, hoursAwake: number, isToday = false): Promise<void> {
  const end = nextDay(date)
  const [metricsRes, sleepRes, nutritionRes, waterRes, supplementsRes, goalsRes, sessionsRes] = await Promise.all([
    supabase.from('daily_metrics').select('*').eq('user_id', userId).eq('date', date).maybeSingle(),
    supabase.from('sleep_sessions').select('*').eq('user_id', userId)
      .gte('start_time', `${date}T00:00:00Z`).lt('start_time', `${end}T00:00:00Z`)
      .order('start_time', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('nutrition_entries').select('*').eq('user_id', userId)
      .eq('date', date).eq('meal_type', 'daily').maybeSingle(),
    supabase.from('water_intake').select('amount_ml').eq('user_id', userId).eq('date', date),
    supabase.from('supplements').select('id').eq('user_id', userId).eq('date', date),
    supabase.from('user_goals').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('workout_sessions').select('total_volume_kg').eq('user_id', userId)
      .gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${end}T00:00:00Z`),
  ])

  const metrics = metricsRes.data as Tables<'daily_metrics'> | null
  const sleep = sleepRes.data as Tables<'sleep_sessions'> | null
  const nutrition = nutritionRes.data as Tables<'nutrition_entries'> | null
  const water = waterRes.data as Array<{ amount_ml: number }> | null
  const supplements = supplementsRes.data as Array<{ id: string }> | null
  const goals = goalsRes.data as Tables<'user_goals'> | null
  const daySessions = sessionsRes.data as Array<{ total_volume_kg: number | null }> | null

  const { data: trailingRaw } = await supabase
    .from('workout_sessions').select('total_volume_kg').eq('user_id', userId)
    .lt('started_at', `${date}T00:00:00Z`).order('started_at', { ascending: false }).limit(7)
  const trailing = trailingRaw as Array<{ total_volume_kg: number | null }> | null
  const trailingAvg = trailing?.length ? trailing.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0) / trailing.length : 0

  // HRV + resting-HR baselines (7-day trailing) from daily_logs — Phase 15.
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

  const { count: prCount } = await supabase
    .from('workout_sets').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('is_pr', true)
    .gte('created_at', `${date}T00:00:00Z`).lt('created_at', `${end}T00:00:00Z`)

  const isRestDay = isRestDayFor(date)  // era-aware: HELIX-5 rests Tue/Fri; PPL legacy Fri/Sat
  // isToday comes from the caller (the client knows its own timezone); derive the
  // user's local hour from hoursAwake (07:00 wake convention) instead of a fixed zone.
  const isCurrentDay = isToday || date === todayISO()
  const localHour = Math.min(23, 7 + Math.round(hoursAwake))

  const g = goals ?? {
    sleep_goal_hours: 8, calorie_goal: 1935, protein_goal_g: 180, carbs_goal_g: 180,
    fat_goal_g: 55, steps_goal: 10000, active_cal_goal: 500, water_goal_ml: 3000,
  }
  const totalWaterMl = (water ?? []).reduce((s, r) => s + r.amount_ml, 0)
  const sessionVolumeKg = (daySessions ?? []).reduce((s, r) => s + (r.total_volume_kg ?? 0), 0)

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
    newPRsToday: prCount ?? 0,
    sessionVolumeKg,
    trailingAvgVolumeKg: trailingAvg,
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
  const scoreRow: InsertRow<'daily_scores'> = {
    user_id: userId, date,
    score: components.totalScore, sleep_score: components.sleepScore,
    nutrition_score: components.nutritionScore, activity_score: components.activityScore,
    workout_score: components.workoutScore, recovery_score: components.recoveryScore,
    battery_pct: battery.currentPct,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('daily_scores').upsert(scoreRow as unknown as any, { onConflict: 'user_id,date' })
  if (error) console.error(`[compute-score] upsert ${date} failed:`, error.message)
}

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const supabase = getServerSupabaseClient()
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError || !users.length) return NextResponse.json({ error: 'No user' }, { status: 401 })
  const userId = users[0].id

  // The CLIENT knows the user's real timezone (device-local logical day + hours
  // awake) — the server cannot. Trust client-provided values when present and
  // fall back to the server clock only for cron/headless calls.
  const body = await req.json().catch(() => ({})) as { backfillDays?: number; date?: string; hoursAwake?: number }
  const backfillDays = Math.max(0, Math.min(31, Number(body?.backfillDays) || 0))
  const today = body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayISO()
  const awake = Number.isFinite(body?.hoursAwake) ? Math.max(0, Math.min(18, Number(body?.hoursAwake))) : israelHoursAwake()

  await computeForDate(supabase, userId, today, awake, true)   // today: time-of-day aware
  for (let i = 1; i <= backfillDays; i++) {
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - i)
    await computeForDate(supabase, userId, d.toISOString().slice(0, 10), 16)  // past days: full day
  }

  return NextResponse.json({ ok: true, today, backfilled: backfillDays })
}
