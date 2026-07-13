/**
 * POST /api/notion/export-day { date: 'YYYY-MM-DD' }
 *
 * Pushes ONE curated day summary (macros, movement, sleep, effort, session
 * one-liner) to the user's Notion daily-log database. Stateless by design:
 * each export creates a fresh page — no page-id bookkeeping, no extra columns.
 * Uses Notion's raw REST API (no SDK dependency). Returns the new page URL.
 */

import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { requireUserId } from '@/lib/auth/identity'

const NOTION_VERSION = '2022-06-28'

type DayRow = {
  steps: number | null; water_ml: number | null; sleep_minutes: number | null
  weight_kg: number | null; effort_rating: number | null; mood: number | null
  journal_md: string | null; carbs_g: number | null; protein_g: number | null; fats_g: number | null
}

const fmt = (v: number | null | undefined, unit = '') => (v == null ? '—' : `${Math.round(v).toLocaleString()}${unit}`)

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const token = process.env.NOTION_TOKEN
  const dbId = process.env.NOTION_DAILY_LOG_DB_ID
  if (!token || !dbId) {
    return NextResponse.json(
      { error: 'Notion export is not configured — set NOTION_TOKEN and NOTION_DAILY_LOG_DB_ID.' },
      { status: 501 },
    )
  }

  const body = await req.json().catch(() => ({})) as { date?: string }
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null
  if (!date) return NextResponse.json({ error: 'A date (YYYY-MM-DD) is required.' }, { status: 400 })

  const supabase = getServerSupabaseClient()
  const userId = await requireUserId(req, supabase)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Gather the curated summary (one row per source — deliberately not granular).
  const next = (() => { const x = new Date(`${date}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) })()
  const [logRes, nutritionRes, sessionRes] = await Promise.all([
    supabase.from('daily_logs')
      .select('steps, water_ml, sleep_minutes, weight_kg, effort_rating, mood, journal_md, carbs_g, protein_g, fats_g')
      .eq('user_id', userId).eq('date', date).maybeSingle(),
    supabase.from('nutrition_entries').select('calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId).eq('date', date).eq('meal_type', 'daily').maybeSingle(),
    supabase.from('workout_sessions').select('split_day, total_volume_kg, set_count, pr_count')
      .eq('user_id', userId).gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${next}T00:00:00Z`)
      .order('started_at', { ascending: true }).limit(1).maybeSingle(),
  ])
  const log = logRes.data as DayRow | null
  const n = nutritionRes.data as { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null
  const s = sessionRes.data as { split_day: string; total_volume_kg: number | null; set_count: number | null; pr_count: number | null } | null

  if (!log && !n && !s) {
    return NextResponse.json({ error: `No data recorded for ${date}.` }, { status: 404 })
  }

  const sessionLine = s
    ? `${s.split_day[0]?.toUpperCase()}${s.split_day.slice(1)} · ${fmt(s.total_volume_kg, ' kg')} · ${fmt(s.set_count)} sets${(s.pr_count ?? 0) > 0 ? ` · ${s.pr_count} PR` : ''}`
    : 'Rest day'
  const lines = [
    `Calories: ${fmt(n?.calories, ' kcal')}  ·  P ${fmt(n?.protein_g ?? log?.protein_g, 'g')} / C ${fmt(n?.carbs_g ?? log?.carbs_g, 'g')} / F ${fmt(n?.fat_g ?? log?.fats_g, 'g')}`,
    `Steps: ${fmt(log?.steps)}  ·  Sleep: ${log?.sleep_minutes != null ? `${Math.floor(log.sleep_minutes / 60)}h ${log.sleep_minutes % 60}m` : '—'}  ·  Weight: ${log?.weight_kg != null ? `${log.weight_kg} kg` : '—'}`,
    `Training: ${sessionLine}`,
    `Effort: ${fmt(log?.effort_rating)}/10  ·  Mood: ${fmt(log?.mood)}/5`,
    ...(log?.journal_md ? [`Journal: ${log.journal_md.slice(0, 1800)}`] : []),
  ]

  // Create the page via raw Notion REST. Title property name defaults to "Name";
  // date columns vary per database — everything lands in the title + body so the
  // export works against ANY daily-log database schema.
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: [{ text: { content: `HELIX Day — ${date}` } }] },
      },
      children: lines.map((line) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: line } }] },
      })),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json({ error: `Notion rejected the export (${res.status})`, detail: detail.slice(0, 400) }, { status: 502 })
  }
  const page = await res.json() as { id: string; url?: string }
  return NextResponse.json({ ok: true, date, pageUrl: page.url ?? null })
}
