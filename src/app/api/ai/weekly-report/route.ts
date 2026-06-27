/**
 * POST /api/ai/weekly-report
 *
 * Aggregates the last 7 days from Supabase, sends to Claude claude-opus-4-8,
 * streams the report, persists to `reports` table, and pushes to Notion Reports DB.
 *
 * Returns: { reportId, contentMd, notionPageId }
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { pushWeeklyReportToNotion } from '@/lib/notion/daily-log'
import { denyIfUnauthorized } from '@/lib/auth/guard'

// ─── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an elite fitness and nutrition analyst for a personal health tracking app.
The user (Michael) is on a cut: 1935 kcal / 180g protein / 180g carbs / 55g fat per day.
Goal: lose 0.3–0.4 kg/week while preserving muscle mass.

Analyse the provided 7-day stats and produce a structured report in this EXACT format:

## Quick Verdict
One sentence: is this week on-track, under, or off-track for the 0.3–0.4 kg/wk loss goal?

## MFP Compliance Audit
- Days in calorie range (±100 kcal): X/7
- Average daily protein: Xg (goal: 180g)
- Average daily calories: X kcal (goal: 1935 kcal)
- Biggest macro deviation: [describe]

## Training Summary
- Sessions completed: X
- Total volume: X kg
- PRs set: X
- Per-session breakdown: [for each session: date, split, volume, sets, PRs, and a one-line takeaway from its notes]

## Adaptive Thermogenesis Watch
- Average resting HR trend: [up/flat/down]
- Sleep average: Xh (goal: 8h)
- Battery trend: [comment on avg battery level]

## Body Composition Update
- Latest weight: X kg
- vs. 7-day avg: ±X kg
- Muscle mass trend: [up/flat/down]
- Body fat: X%

## Weekly Score
Average daily score: X/100 | Battery avg: X%

## What to Focus on Next Week
2–3 specific, actionable bullet points.

## Success Probabilities
- On track for 0.3–0.4 kg/wk loss: X%
- Muscle retention: X%
- Explain your reasoning briefly.

Rules:
- Base EVERY number strictly on the supplied data. Do NOT fabricate stats.
- If data is missing for a metric, write "No data" — never guess.
- Be direct, clinical, and concise. No fluff.`

// ─── Aggregate a 7-day window (defaults to the last 7 days) ────────────────────
async function aggregateWeek(
  userId: string,
  supabase: ReturnType<typeof getServerSupabaseClient>,
  weekStart?: string,
) {
  let from: string, to: string, fromIso: string, toIso: string
  if (weekStart) {
    const start = new Date(`${weekStart}T00:00:00Z`)
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6)
    from = start.toISOString().slice(0, 10)
    to   = end.toISOString().slice(0, 10)
    fromIso = start.toISOString()
    toIso = new Date(end.getTime() + 86400000).toISOString()
  } else {
    const now = new Date()
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
    from = weekAgo.toISOString().slice(0, 10)
    to   = now.toISOString().slice(0, 10)
    fromIso = weekAgo.toISOString()
    toIso = now.toISOString()
  }

  const [
    { data: metrics },
    { data: nutrition },
    { data: sleep },
    { data: body },
    { data: sessions },
    { data: scores },
    { data: goalsRaw },
  ] = await Promise.all([
    supabase.from('daily_metrics').select('date,steps,active_cal,rest_hr').eq('user_id', userId).gte('date', from).lte('date', to),
    supabase.from('nutrition_entries').select('date,calories,protein_g,carbs_g,fat_g').eq('user_id', userId).eq('meal_type', 'daily').gte('date', from).lte('date', to),
    supabase.from('sleep_sessions').select('start_time,duration_min,deep_min,rem_min').eq('user_id', userId).gte('start_time', fromIso).lt('start_time', toIso),
    supabase.from('body_composition').select('date,weight_kg,body_fat_pct,muscle_mass_kg').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }).limit(7),
    supabase.from('workout_sessions').select('started_at,split_day,total_volume_kg,set_count,pr_count,duration_min,calories_burned,notes').eq('user_id', userId).gte('started_at', fromIso).lt('started_at', toIso).order('started_at', { ascending: true }),
    supabase.from('daily_scores').select('date,score,battery_pct,sleep_score').eq('user_id', userId).gte('date', from).lte('date', to),
    supabase.from('user_goals').select('calorie_goal,protein_goal_g,carbs_goal_g,fat_goal_g,goal_preset').eq('user_id', userId).maybeSingle(),
  ])

  const avg = (arr: (number | null | undefined)[]): string => {
    const nums = arr.filter((n): n is number => typeof n === 'number')
    return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : 'No data'
  }

  const nutritionRows = (nutrition ?? []) as Array<{calories: number; protein_g: number; carbs_g: number; fat_g: number}>
  const metricsRows = (metrics ?? []) as Array<{steps: number | null; active_cal: number | null; rest_hr: number | null}>
  const sleepRows = (sleep ?? []) as Array<{duration_min: number}>
  const bodyRows = (body ?? []) as Array<{date: string; weight_kg: number; body_fat_pct: number | null; muscle_mass_kg: number | null}>
  const sessionRows = (sessions ?? []) as Array<{started_at: string; split_day: string; total_volume_kg: number | null; set_count: number | null; pr_count: number | null; duration_min: number | null; calories_burned: number | null; notes: string | null}>
  const scoreRows = (scores ?? []) as Array<{score: number; battery_pct: number | null}>
  const goals = goalsRaw as { calorie_goal: number; protein_goal_g: number | null; carbs_goal_g: number | null; fat_goal_g: number | null; goal_preset: string | null } | null

  const calGoal = goals?.calorie_goal ?? 1935
  const daysInCalRange = nutritionRows.filter((r) => Math.abs(r.calories - calGoal) <= 100).length

  return {
    period: { from, to },
    nutritionMode: goals?.goal_preset ?? 'cut',
    goals: goals ? { calories: goals.calorie_goal, protein: goals.protein_goal_g, carbs: goals.carbs_goal_g, fat: goals.fat_goal_g } : null,
    nutrition: {
      daysLogged: nutritionRows.length,
      daysInCalorieRange: daysInCalRange,
      avgCalories: avg(nutritionRows.map((r) => r.calories)),
      avgProtein:  avg(nutritionRows.map((r) => r.protein_g)),
      avgCarbs:    avg(nutritionRows.map((r) => r.carbs_g)),
      avgFat:      avg(nutritionRows.map((r) => r.fat_g)),
    },
    sleep: { avgDurationMin: avg(sleepRows.map((r) => r.duration_min)), sessions: sleepRows.length },
    metrics: { avgSteps: avg(metricsRows.map((r) => r.steps)), avgRestHR: avg(metricsRows.map((r) => r.rest_hr)) },
    body: { latest: bodyRows[0] ?? null, earliest: bodyRows[bodyRows.length - 1] ?? null },
    training: {
      sessionCount: sessionRows.length,
      totalVolumeKg: sessionRows.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0).toFixed(0),
      totalPRs: sessionRows.reduce((s, r) => s + (r.pr_count ?? 0), 0),
      sessions: sessionRows.map((r) => ({
        date: r.started_at.slice(0, 10),
        split: r.split_day,
        volumeKg: r.total_volume_kg,
        sets: r.set_count,
        prs: r.pr_count,
        durationMin: r.duration_min,
        caloriesBurned: r.calories_burned,
        notes: r.notes && !r.notes.startsWith('__seed_') ? r.notes.slice(0, 300) : null,
      })),
    },
    scores: { avgScore: avg(scoreRows.map((r) => r.score)), avgBattery: avg(scoreRows.map((r) => r.battery_pct)) },
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const supabase = getServerSupabaseClient()
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError || !users.length) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = users[0].id

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  // Optional { weekStart: 'YYYY-MM-DD' } selects a specific week; else last 7 days
  let weekStart: string | undefined
  try {
    const body = await req.json() as { weekStart?: unknown }
    if (typeof body.weekStart === 'string') weekStart = body.weekStart
  } catch { /* no body → default last 7 days */ }

  // Aggregate stats
  const statsPayload = await aggregateWeek(userId, supabase, weekStart)
  const statsJson = JSON.stringify(statsPayload, null, 2)

  // Generate report with Claude (streaming, adaptive thinking)
  const client = new Anthropic({ apiKey })

  let contentMd = ''
  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Here are my 7-day stats (${statsPayload.period.from} → ${statsPayload.period.to}):\n\n${statsJson}\n\nPlease generate the weekly report.`,
        },
      ],
    })

    const final = await stream.finalMessage()
    const textBlock = final.content.find((b) => b.type === 'text')
    contentMd = textBlock && textBlock.type === 'text' ? textBlock.text : ''
  } catch (err) {
    console.error('[ai/weekly-report] Claude error:', err)
    return NextResponse.json({ error: 'Report generation failed', detail: String(err) }, { status: 500 })
  }

  if (!contentMd) {
    return NextResponse.json({ error: 'Empty report from Claude' }, { status: 500 })
  }

  // Persist to Supabase reports table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reportRow, error: dbError } = await supabase
    .from('reports')
    .upsert({
      user_id:      userId,
      type:         'weekly',
      period_start: statsPayload.period.from,
      period_end:   statsPayload.period.to,
      content_md:   contentMd,
      metrics:      statsPayload as Record<string, unknown>,
    } as unknown as never, { onConflict: 'user_id,period_start,period_end' })
    .select('id')
    .single()

  if (dbError) {
    console.error('[ai/weekly-report] DB upsert error:', dbError)
  }

  const reportId = (reportRow as { id?: string } | null)?.id ?? null

  // Push to Notion (best-effort)
  const notionPageId = await pushWeeklyReportToNotion({
    periodStart: statsPayload.period.from,
    periodEnd:   statsPayload.period.to,
    contentMd,
  })

  // Backfill notion_page_id if we got one
  if (notionPageId && reportId) {
    await supabase
      .from('reports')
      .update({ notion_page_id: notionPageId } as never)
      .eq('id', reportId)
  }

  return NextResponse.json({ reportId, contentMd, notionPageId })
}
