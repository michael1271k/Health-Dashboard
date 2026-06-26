import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { computeDailyScore } from '@/lib/scoring/score'
import { computeBattery } from '@/lib/scoring/battery'
import type { ScoringInputs } from '@/lib/scoring/types'
import type { Tables, InsertRow } from '@/lib/supabase/types'

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA')   // YYYY-MM-DD, locale-safe
}

export async function POST() {
  const supabase = getServerSupabaseClient()
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError || !users.length) {
    return NextResponse.json({ error: 'No user' }, { status: 401 })
  }
  const userId = users[0].id
  const today = todayISO()

  // Fetch all inputs in parallel
  // Supabase v2: Omit<> Insert types resolve to never[] — cast destructured data explicitly
  const [
    metricsRes,
    sleepRes,
    nutritionRes,
    waterRes,
    supplementsRes,
    goalsRes,
    todaySessionsRes,
  ] = await Promise.all([
    supabase.from('daily_metrics').select('*').eq('user_id', userId).eq('date', today).maybeSingle(),
    supabase.from('sleep_sessions').select('*').eq('user_id', userId)
      .gte('start_time', `${today}T00:00:00Z`).lt('start_time', `${today}T24:00:00Z`)
      .order('start_time', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('nutrition_entries').select('*').eq('user_id', userId)
      .eq('date', today).eq('meal_type', 'daily').maybeSingle(),
    supabase.from('water_intake').select('amount_ml').eq('user_id', userId).eq('date', today),
    supabase.from('supplements').select('id').eq('user_id', userId).eq('date', today),
    supabase.from('user_goals').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('workout_sessions').select('total_volume_kg').eq('user_id', userId)
      .gte('started_at', `${today}T00:00:00Z`).lt('started_at', `${today}T23:59:59Z`),
  ])

  const metrics   = metricsRes.data    as Tables<'daily_metrics'> | null
  const sleep     = sleepRes.data      as Tables<'sleep_sessions'> | null
  const nutrition = nutritionRes.data  as Tables<'nutrition_entries'> | null
  const water     = waterRes.data      as Array<{ amount_ml: number }> | null
  const supplements = supplementsRes.data as Array<{ id: string }> | null
  const goals     = goalsRes.data      as Tables<'user_goals'> | null
  const todaySessions = todaySessionsRes.data as Array<{ total_volume_kg: number | null }> | null

  // Trailing average volume (last 7 sessions, excluding today)
  const { data: trailingRaw } = await supabase
    .from('workout_sessions')
    .select('total_volume_kg')
    .eq('user_id', userId)
    .lt('started_at', `${today}T00:00:00Z`)
    .order('started_at', { ascending: false })
    .limit(7)

  const trailingSessions = trailingRaw as Array<{ total_volume_kg: number | null }> | null

  const trailingAvg = trailingSessions?.length
    ? (trailingSessions.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0) / trailingSessions.length)
    : 0

  // New PRs today
  const { count: prCount } = await supabase
    .from('workout_sets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_pr', true)
    .gte('created_at', `${today}T00:00:00Z`)

  const g = goals ?? {
    sleep_goal_hours: 8, calorie_goal: 2500, protein_goal_g: 180,
    carbs_goal_g: 300, fat_goal_g: 80, steps_goal: 10000,
    active_cal_goal: 600, water_goal_ml: 2500,
  }

  const totalWaterMl = (water ?? []).reduce((s, r) => s + r.amount_ml, 0)
  const sessionVolumeKg = (todaySessions ?? []).reduce((s, r) => s + (r.total_volume_kg ?? 0), 0)

  const sleepDuration = sleep
    ? (sleep.duration_min / 60)
    : 0

  const inputs: ScoringInputs = {
    sleepHours:            sleepDuration,
    deepMinutes:           sleep?.deep_min ?? 0,
    remMinutes:            sleep?.rem_min ?? 0,
    sleepGoalHours:        g.sleep_goal_hours,
    calories:              nutrition?.calories ?? 0,
    proteinG:              nutrition?.protein_g ?? 0,
    carbsG:                nutrition?.carbs_g ?? 0,
    fatG:                  nutrition?.fat_g ?? 0,
    calorieGoal:           g.calorie_goal,
    proteinGoalG:          g.protein_goal_g,
    carbsGoalG:            g.carbs_goal_g,
    fatGoalG:              g.fat_goal_g,
    steps:                 metrics?.steps ?? 0,
    activeCal:             metrics?.active_cal ?? 0,
    stepsGoal:             g.steps_goal,
    activeCalGoal:         g.active_cal_goal,
    workoutLogged:         (todaySessions?.length ?? 0) > 0,
    newPRsToday:           prCount ?? 0,
    sessionVolumeKg,
    trailingAvgVolumeKg:   trailingAvg,
    waterMl:               totalWaterMl,
    waterGoalMl:           g.water_goal_ml,
    supplementsTaken:      supplements?.length ?? 0,
    supplementsGoal:       3,
  }

  const components = computeDailyScore(inputs)
  const hoursAwake = 16  // default; future: compute from wake time
  const battery = computeBattery(inputs, hoursAwake)

  // Upsert to daily_scores
  const scoreRow: InsertRow<'daily_scores'> = {
    user_id:          userId,
    date:             today,
    score:            components.totalScore,
    sleep_score:      components.sleepScore,
    nutrition_score:  components.nutritionScore,
    activity_score:   components.activityScore,
    workout_score:    components.workoutScore,
    recovery_score:   components.recoveryScore,
    battery_pct:      battery.currentPct,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertError } = await supabase
    .from('daily_scores')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(scoreRow as unknown as any, { onConflict: 'user_id,date' })

  if (upsertError) {
    console.error('[compute-score] upsert error:', upsertError)
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 })
  }

  return NextResponse.json({ ...components, batteryPct: battery.currentPct, morningCharge: battery.morningCharge })
}
