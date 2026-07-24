import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { nightWindow } from '@/lib/sleep/nightWindow'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { logicalTodayInTZ } from '@/lib/utils/day'
import { scheduleDayFor, isRestDayFor } from '@/lib/programs'
import { validWeight } from '@/lib/utils/units'
import type { WidgetSnapshot } from '@/lib/widget/snapshot'

/**
 * GET /api/widget/snapshot — the iOS Widget + Watch data source.
 *
 * Auth is a single opaque bearer token looked up in `widget_tokens`, NOT a JWT:
 * a widget extension has nowhere to persist a rotating Supabase refresh token,
 * and on a free Apple team it can't share the app's Keychain either (App Groups
 * are a paid capability). The token is baked into the locally-signed build.
 *
 * Deliberately constrained so that token is low-value if it ever leaks:
 *   · GET only — no writes, no auth surface, no way to enumerate other users.
 *   · Scoped to exactly one user_id, resolved server-side from the token.
 *   · Revocable by deleting the row; rotate by inserting a new one.
 *
 * Timezone comes from the caller (`?tz=Europe/London`) with the stored
 * user_goals.timezone as the fallback — the server clock is UTC and would put
 * the widget a day out for part of every day.
 */
export const dynamic = 'force-dynamic'

const HOME_TZ = 'Asia/Jerusalem'

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1].trim() : null
}

export async function GET(req: Request) {
  const token = bearer(req)
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  }

  const supabase = getServerSupabaseClient()

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('widget_tokens').select('user_id').eq('token', token).maybeSingle()
  if (tokenErr) {
    // Table not migrated yet — say so plainly rather than reading as a bad token.
    return NextResponse.json(
      { error: 'widget_tokens is not migrated yet — run the Phase 2 SQL.' },
      { status: 503 },
    )
  }
  const userId = (tokenRow as { user_id?: string } | null)?.user_id
  if (!userId) return NextResponse.json({ error: 'Unknown token' }, { status: 401 })

  const { data: goalsRow } = await supabase
    .from('user_goals').select('*').eq('user_id', userId).maybeSingle()
  const goals = (goalsRow ?? {}) as Record<string, number | string | null>

  const url = new URL(req.url)
  const tz = url.searchParams.get('tz') || (goals.timezone as string | null) || HOME_TZ
  const date = logicalTodayInTZ(tz)
  const night = nightWindow(date)
  const weekStart = weekStartOf(date)
  const weekEndExclusive = `${isoAddDays(weekStart, 7)}T00:00:00Z`

  const [scoreRes, logRes, metricsRes, sleepRes, nutriRes, waterRes, weightRes, weekRes] = await Promise.all([
    supabase.from('daily_scores').select('score, battery_pct').eq('user_id', userId).eq('date', date).maybeSingle(),
    supabase.from('daily_logs').select('steps, distance_m, active_energy, water_ml, sleep_minutes')
      .eq('user_id', userId).eq('date', date).maybeSingle(),
    supabase.from('daily_metrics').select('steps, active_cal').eq('user_id', userId).eq('date', date).maybeSingle(),
    supabase.from('sleep_sessions').select('duration_min, deep_min, rem_min').eq('user_id', userId)
      .gte('start_time', night.from).lt('start_time', night.to)
      .order('duration_min', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('nutrition_entries').select('calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId).eq('date', date).eq('meal_type', 'daily').maybeSingle(),
    supabase.from('water_intake').select('amount_ml').eq('user_id', userId).eq('date', date),
    // Last two weigh-ins, for the delta.
    supabase.from('body_composition').select('date, weight_kg').eq('user_id', userId)
      .order('date', { ascending: false }).limit(8),
    supabase.from('workout_sessions').select('started_at, total_volume_kg, set_count, pr_count')
      .eq('user_id', userId)
      .gte('started_at', `${weekStart}T00:00:00Z`).lt('started_at', weekEndExclusive),
  ])

  const score = scoreRes.data as { score: number | null; battery_pct: number | null } | null
  const log = logRes.data as Record<string, number | null> | null
  const metrics = metricsRes.data as { steps: number | null; active_cal: number | null } | null
  const sleep = sleepRes.data as { duration_min: number | null; deep_min: number | null; rem_min: number | null } | null
  const nutri = nutriRes.data as Record<string, number | null> | null
  const water = (waterRes.data ?? []) as Array<{ amount_ml: number }>
  const weekSessions = (weekRes.data ?? []) as Array<{
    started_at: string; total_volume_kg: number | null; set_count: number | null; pr_count: number | null
  }>

  // Weigh-ins, de-duplicated by VALUE so a re-synced identical reading doesn't
  // read as a fresh weigh-in (same rule as the dashboard's Body card).
  const weighIns = ((weightRes.data ?? []) as Array<{ date: string; weight_kg: number | null }>)
    .map((r) => ({ date: r.date, kg: validWeight(r.weight_kg) }))
    .filter((r): r is { date: string; kg: number } => r.kg != null)
  const latest = weighIns[0] ?? null
  const previous = weighIns.find((r) => latest && Math.abs(r.kg - latest.kg) >= 0.05) ?? null

  const day = scheduleDayFor(date)
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  const snapshot: WidgetSnapshot = {
    date,
    generatedAt: new Date().toISOString(),
    battery: score?.battery_pct ?? null,
    score: score?.score ?? null,
    sleep: {
      minutes: sleep?.duration_min ?? log?.sleep_minutes ?? null,
      deepMin: sleep?.deep_min ?? null,
      remMin: sleep?.rem_min ?? null,
    },
    weight: {
      kg: latest?.kg ?? null,
      deltaKg: latest && previous ? Math.round((latest.kg - previous.kg) * 100) / 100 : null,
      measuredOn: latest?.date ?? null,
    },
    macros: {
      kcal: nutri?.calories ?? null,
      kcalGoal: num(goals.calorie_goal),
      proteinG: nutri?.protein_g ?? null,
      proteinGoalG: num(goals.protein_goal_g),
      carbsG: nutri?.carbs_g ?? null,
      fatG: nutri?.fat_g ?? null,
    },
    water: {
      ml: water.length ? water.reduce((s, r) => s + r.amount_ml, 0) : log?.water_ml ?? null,
      goalMl: num(goals.water_goal_ml),
    },
    steps: {
      count: metrics?.steps ?? log?.steps ?? null,
      goal: num(goals.steps_goal),
      distanceM: log?.distance_m ?? null,
      activeKcal: metrics?.active_cal ?? log?.active_energy ?? null,
    },
    workout: {
      label: day === 'rest' ? 'Rest' : day.label,
      logged: weekSessions.some((s) => s.started_at.slice(0, 10) === date),
      isRestDay: isRestDayFor(date),
    },
    week: {
      sessions: weekSessions.length,
      volumeKg: Math.round(weekSessions.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0)),
      prs: weekSessions.reduce((s, r) => s + (r.pr_count ?? 0), 0),
      sets: weekSessions.reduce((s, r) => s + (r.set_count ?? 0), 0),
    },
  }

  // Best-effort usage stamp — never let it fail the request.
  void supabase.from('widget_tokens')
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq('token', token)
    .then(undefined, () => {})

  return NextResponse.json(snapshot, {
    headers: {
      // Widgets refresh on their own timeline; a short edge cache keeps repeated
      // small/medium/Watch fetches from hitting the DB three times over.
      'Cache-Control': 'private, max-age=60',
    },
  })
}
