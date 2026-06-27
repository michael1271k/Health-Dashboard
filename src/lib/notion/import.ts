/**
 * One-time historical import: Notion → Supabase.
 *
 * Reads the 📅 Daily Log and PPL Session Table databases (push-only Notion is
 * the legacy source) and writes into the Supabase schema. Idempotent:
 *  - daily tables dedupe by (user_id, date) via delete-then-insert
 *  - sessions dedupe on (user_id, started_at, split_day) + migrated_from_notion
 *
 * Going forward Supabase is the read source; new entries still push to Notion.
 */

import type { Client } from '@notionhq/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>
// Notion page property bags are loosely typed; read defensively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = Record<string, any>

// ─── Notion property readers ─────────────────────────────────────────────────
function num(props: Props, name: string): number | null {
  const p = props[name]
  return p && typeof p.number === 'number' ? p.number : null
}
function dateStart(props: Props, name: string): string | null {
  const p = props[name]
  return p?.date?.start ?? null
}
function select(props: Props, name: string): string | null {
  const p = props[name]
  return p?.select?.name ?? null
}
function richText(props: Props, name: string): string | null {
  const p = props[name]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (p?.rich_text ?? p?.title) as Array<{ plain_text?: string }> | undefined
  if (!arr?.length) return null
  const s = arr.map((t) => t.plain_text ?? '').join('').trim()
  return s || null
}

/** Parse a Notion "Duration" text like "1h 15m", "75", "1:15" → minutes. */
export function parseDurationMin(raw: string | null): number | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  let m = s.match(/(\d+)\s*h(?:ours?)?\s*(\d+)?/)
  if (m) return parseInt(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0)
  m = s.match(/^(\d+):(\d+)$/)
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2])
  m = s.match(/(\d+)\s*m/)
  if (m) return parseInt(m[1])
  m = s.match(/^(\d+)$/)
  if (m) return parseInt(m[1])
  return null
}

// ─── Fetch all pages (paginated) ─────────────────────────────────────────────
// @notionhq/client v5 moved querying from databases.query → dataSources.query.
// We resolve the database's first data source, then query it; falling back to
// the legacy databases.query for older client/server versions. All via `any`
// casts because the available surface depends on the pinned Notion API version.
async function fetchAllPages(notion: Client, databaseId: string): Promise<Props[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = notion as any

  // Resolve data source id (v5+ data-source model)
  let dataSourceId: string | undefined
  try {
    const db = await client.databases.retrieve({ database_id: databaseId })
    dataSourceId = db?.data_sources?.[0]?.id
  } catch { /* older API — fall back to databases.query below */ }

  const out: Props[] = []
  let cursor: string | undefined = undefined
  do {
    let resp
    if (dataSourceId && client.dataSources?.query) {
      resp = await client.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor, page_size: 100 })
    } else {
      resp = await client.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 })
    }
    for (const page of resp.results) {
      if (page.properties) out.push(page.properties as Props)
    }
    cursor = resp.has_more ? resp.next_cursor : undefined
  } while (cursor)
  return out
}

export interface ImportCounts {
  dailyPages: number
  gymPages: number
  nutrition: number
  bodyComp: number
  metrics: number
  sleep: number
  sessions: number
}

// ─── Daily Log import ────────────────────────────────────────────────────────
async function importDailyLog(
  db: DB, userId: string, notion: Client, dbId: string, dryRun: boolean, counts: ImportCounts,
): Promise<void> {
  const pages = await fetchAllPages(notion, dbId)
  counts.dailyPages = pages.length

  for (const props of pages) {
    const date = dateStart(props, 'Date (for calendar)') ?? dateStart(props, 'Date')
    if (!date) continue
    const day = date.slice(0, 10)

    const calories = num(props, 'Calories')
    const protein  = num(props, 'Protein g')
    const carbs    = num(props, 'Carbs g')
    const fat      = num(props, 'Fat g')
    const weight   = num(props, 'Weight (kg)')
    const bodyFat  = num(props, 'Body Fat Percentage (%)')
    const muscle   = num(props, 'Muscle Mass (kg)')
    const waterPct = num(props, 'Body Water Percentage (%)')
    const bone     = num(props, 'Bone Mineral Content (kg)')
    const bmi      = num(props, 'BMI')
    const steps    = num(props, 'Steps')
    const sleepH   = num(props, 'Sleep h')

    if (dryRun) {
      if (calories != null || protein != null) counts.nutrition++
      if (weight != null) counts.bodyComp++
      if (steps != null) counts.metrics++
      if (sleepH != null) counts.sleep++
      continue
    }

    // Nutrition (delete-then-insert by date)
    if (calories != null || protein != null || carbs != null || fat != null) {
      await db.from('nutrition_entries').delete()
        .eq('user_id', userId).eq('date', day).eq('meal_type', 'daily')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.from('nutrition_entries').insert({
        user_id: userId, hk_uuid: null, logged_at: `${day}T00:00:00Z`, date: day,
        meal_type: 'daily', calories: calories ?? 0, protein_g: protein ?? 0,
        carbs_g: carbs ?? 0, fat_g: fat ?? 0, fiber_g: null,
      } as unknown as any)
      counts.nutrition++
    }

    // Body composition
    if (weight != null) {
      await db.from('body_composition').delete().eq('user_id', userId).eq('date', day)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.from('body_composition').insert({
        user_id: userId, hk_uuid: null, measured_at: `${day}T00:00:00Z`, date: day,
        weight_kg: weight, body_fat_pct: bodyFat, muscle_mass_kg: muscle,
        water_pct: waterPct, bone_mass_kg: bone, bmi,
      } as unknown as any)
      counts.bodyComp++
    }

    // Daily metrics (steps)
    if (steps != null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.from('daily_metrics').upsert({
        user_id: userId, date: day, steps, active_cal: null, rest_hr: null,
      } as unknown as any, { onConflict: 'user_id,date', ignoreDuplicates: false })
      counts.metrics++
    }

    // Sleep — synthesize only if no HK sleep row exists for that night
    if (sleepH != null && sleepH > 0) {
      const { data: existing } = await db.from('sleep_sessions').select('id')
        .eq('user_id', userId).gte('start_time', `${day}T00:00:00Z`).lt('start_time', `${day}T23:59:59Z`).limit(1)
      if (!((existing ?? []) as unknown[]).length) {
        const durationMin = Math.round(sleepH * 60)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.from('sleep_sessions').insert({
          user_id: userId, hk_uuid: null,
          start_time: `${day}T23:00:00Z`, end_time: `${day}T23:00:00Z`,
          duration_min: durationMin, deep_min: 0, rem_min: 0, core_min: durationMin, awake_min: 0,
          sleep_score: null,
        } as unknown as any)
        counts.sleep++
      }
    }
  }
}

// ─── Gym Session import ──────────────────────────────────────────────────────
async function importGymSessions(
  db: DB, userId: string, notion: Client, dbId: string, dryRun: boolean, counts: ImportCounts,
): Promise<void> {
  const pages = await fetchAllPages(notion, dbId)
  counts.gymPages = pages.length

  for (const props of pages) {
    const date = dateStart(props, 'Date')
    if (!date) continue
    const startedAt = date.length <= 10 ? `${date}T18:00:00Z` : date

    const typeRaw = (select(props, 'Type') ?? '').toLowerCase()
    const splitDay = (['push', 'pull', 'legs', 'upper', 'lower'].includes(typeRaw) ? typeRaw : 'legs')
    const volume   = num(props, 'Volume kg')
    const sets     = num(props, 'Sets')
    const prs      = num(props, 'PRs')
    const calories = num(props, 'Calories')
    const durationMin = parseDurationMin(richText(props, 'Duration'))
    const notes    = richText(props, 'Notes')

    if (dryRun) { counts.sessions++; continue }

    // Dedupe: skip if a migrated session already exists for this day+split
    const { data: existing } = await db.from('workout_sessions').select('id')
      .eq('user_id', userId).eq('split_day', splitDay)
      .gte('started_at', `${startedAt.slice(0, 10)}T00:00:00Z`)
      .lt('started_at', `${startedAt.slice(0, 10)}T23:59:59Z`)
      .limit(1)
    if (((existing ?? []) as unknown[]).length) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.from('workout_sessions').insert({
      user_id: userId, notion_page_id: null, started_at: startedAt,
      ended_at: durationMin ? new Date(new Date(startedAt).getTime() + durationMin * 60000).toISOString() : null,
      split_day: splitDay, notes: notes ?? null, total_volume_kg: volume,
      session_score: null, set_count: sets, pr_count: prs,
      duration_min: durationMin, calories_burned: calories, avg_bpm: null,
      report_md: null, migrated_from_notion: true,
    } as unknown as any)
    counts.sessions++
  }
}

export async function runHistoricalImport(
  db: DB, userId: string, notion: Client, dailyDbId: string, gymDbId: string, dryRun: boolean,
): Promise<ImportCounts> {
  const counts: ImportCounts = {
    dailyPages: 0, gymPages: 0, nutrition: 0, bodyComp: 0, metrics: 0, sleep: 0, sessions: 0,
  }
  await importDailyLog(db, userId, notion, dailyDbId, dryRun, counts)
  await importGymSessions(db, userId, notion, gymDbId, dryRun, counts)
  return counts
}
