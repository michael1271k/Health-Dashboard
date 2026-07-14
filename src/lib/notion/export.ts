import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

export const NOTION_VERSION = '2022-06-28'

const fmt = (v: number | null | undefined, unit = '') => (v == null ? '—' : `${Math.round(v).toLocaleString()}${unit}`)

/** Build the curated one-page summary lines for a single day (macros, movement,
 *  sleep, training, subjective). Deliberately NOT granular. */
export async function buildDaySummaryLines(db: DB, userId: string, date: string): Promise<string[] | null> {
  const next = (() => { const x = new Date(`${date}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) })()
  const [logRes, nutritionRes, sessionRes] = await Promise.all([
    db.from('daily_logs')
      .select('steps, water_ml, sleep_minutes, weight_kg, effort_rating, mood, journal_md, carbs_g, protein_g, fats_g')
      .eq('user_id', userId).eq('date', date).maybeSingle(),
    db.from('nutrition_entries').select('calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId).eq('date', date).eq('meal_type', 'daily').maybeSingle(),
    db.from('workout_sessions').select('split_day, total_volume_kg, set_count, pr_count')
      .eq('user_id', userId).gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${next}T00:00:00Z`)
      .order('started_at', { ascending: true }).limit(1).maybeSingle(),
  ])
  const log = logRes.data as {
    steps: number | null; water_ml: number | null; sleep_minutes: number | null; weight_kg: number | null
    effort_rating: number | null; mood: number | null; journal_md: string | null
    carbs_g: number | null; protein_g: number | null; fats_g: number | null
  } | null
  const n = nutritionRes.data as { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null
  const s = sessionRes.data as { split_day: string; total_volume_kg: number | null; set_count: number | null; pr_count: number | null } | null
  if (!log && !n && !s) return null

  const sessionLine = s
    ? `${s.split_day[0]?.toUpperCase()}${s.split_day.slice(1)} · ${fmt(s.total_volume_kg, ' kg')} · ${fmt(s.set_count)} sets${(s.pr_count ?? 0) > 0 ? ` · ${s.pr_count} PR` : ''}`
    : 'Rest day'
  return [
    `Calories: ${fmt(n?.calories, ' kcal')}  ·  P ${fmt(n?.protein_g ?? log?.protein_g, 'g')} / C ${fmt(n?.carbs_g ?? log?.carbs_g, 'g')} / F ${fmt(n?.fat_g ?? log?.fats_g, 'g')}`,
    `Steps: ${fmt(log?.steps)}  ·  Sleep: ${log?.sleep_minutes != null ? `${Math.floor(log.sleep_minutes / 60)}h ${log.sleep_minutes % 60}m` : '—'}  ·  Weight: ${log?.weight_kg != null ? `${log.weight_kg} kg` : '—'}`,
    `Training: ${sessionLine}`,
    `Effort: ${fmt(log?.effort_rating)}/10  ·  Mood: ${fmt(log?.mood)}/5`,
    ...(log?.journal_md ? [`Journal: ${log.journal_md.slice(0, 1800)}`] : []),
  ]
}

/** Create a Notion page for the given day summary via raw REST. Returns the URL. */
export async function createNotionDayPage(token: string, dbId: string, date: string, lines: string[]): Promise<{ url: string | null }> {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: { Name: { title: [{ text: { content: `HELIX Day — ${date}` } }] } },
      children: lines.map((line) => ({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: line } }] },
      })),
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Notion ${res.status}: ${detail.slice(0, 200)}`)
  }
  const page = await res.json() as { url?: string }
  return { url: page.url ?? null }
}
