import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { resolveCallerUserId, defaultUserId } from '@/lib/auth/identity'
import { nightWindow } from '@/lib/sleep/nightWindow'
import { logicalTodayISO } from '@/lib/utils/day'
import type { Tables } from '@/lib/supabase/types'

/**
 * Bundled "today" read — ONE authed round-trip that replaces the ~5 separate
 * single-row selects the dashboard used to fan out on every mount
 * (score + daily_log + metrics + nutrition + sleep + goals). The client seeds
 * these into the individual query caches via a shared `['today', date]` key, so
 * no component changed and cold-start reads collapse 5→1.
 *
 * The CLIENT owns its timezone — it passes `?date=<logical today>`; the server
 * cannot know the user's local calendar day. Falls back to the server clock only
 * for the (rare) headless call.
 */
export async function GET(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const supabase = getServerSupabaseClient()
  const userId = (await resolveCallerUserId(req, supabase)) ?? (await defaultUserId(supabase))
  if (!userId) return NextResponse.json({ error: 'No user' }, { status: 401 })

  const url = new URL(req.url)
  const qDate = url.searchParams.get('date')
  const date = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate) ? qDate : logicalTodayISO()
  const night = nightWindow(date)

  const [scoreRes, logRes, metricsRes, nutritionRes, sleepRes, goalsRes] = await Promise.all([
    supabase.from('daily_scores').select('*').eq('user_id', userId).eq('date', date).maybeSingle(),
    supabase.from('daily_logs').select('*').eq('user_id', userId).eq('date', date).maybeSingle(),
    supabase.from('daily_metrics').select('*').eq('user_id', userId).eq('date', date).maybeSingle(),
    supabase.from('nutrition_entries').select('*').eq('user_id', userId).eq('date', date).eq('meal_type', 'daily').maybeSingle(),
    // `start_time` is BEDTIME (previous evening) — a night window, not a calendar
    // day. Longest session wins (shared with useTodaySleep + compute-score).
    supabase.from('sleep_sessions').select('*').eq('user_id', userId)
      .gte('start_time', night.from).lt('start_time', night.to)
      .order('duration_min', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('user_goals').select('*').eq('user_id', userId).maybeSingle(),
  ])

  return NextResponse.json({
    date,
    score: (scoreRes.data ?? null) as Tables<'daily_scores'> | null,
    dailyLog: (logRes.data ?? null) as Tables<'daily_logs'> | null,
    metrics: (metricsRes.data ?? null) as Tables<'daily_metrics'> | null,
    nutrition: (nutritionRes.data ?? null) as Tables<'nutrition_entries'> | null,
    sleep: (sleepRes.data ?? null) as Tables<'sleep_sessions'> | null,
    goals: (goalsRes.data ?? null) as Tables<'user_goals'> | null,
  })
}
