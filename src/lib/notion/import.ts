/**
 * One-time historical import: Notion → Supabase.
 *
 * Resilient by design: each Notion page is processed inside its own try/catch,
 * so one bad/messy page never aborts the whole import. Every failure records the
 * exact Notion page id + stage so the UI can show precisely what went wrong.
 */

import type { Client } from '@notionhq/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>
// Notion page property bags are loosely typed; read defensively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = Record<string, any>
interface Page { id: string; properties: Props }

// ─── Notion property readers (forgiving) ─────────────────────────────────────
function num(props: Props, name: string): number | null {
  const p = props[name]
  const v = p?.number
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function dateStart(props: Props, name: string): string | null {
  const p = props[name]
  const s = p?.date?.start
  return typeof s === 'string' && s.length >= 8 ? s : null
}
function select(props: Props, name: string): string | null {
  return props[name]?.select?.name ?? null
}
function richText(props: Props, name: string): string | null {
  const p = props[name]
  const arr = (p?.rich_text ?? p?.title) as Array<{ plain_text?: string }> | undefined
  if (!arr?.length) return null
  const s = arr.map((t) => t.plain_text ?? '').join('').trim()
  return s || null
}

/** Normalize a Notion date value to a YYYY-MM-DD string, or null if unparseable. */
function toDay(raw: string | null): string | null {
  if (!raw) return null
  // Notion dates are ISO ("2026-05-10" or full datetime). Validate via Date.
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00Z` : raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
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

// ─── Fetch all pages (paginated; keeps page ids for error reporting) ─────────
async function fetchAllPages(notion: Client, databaseId: string): Promise<Page[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = notion as any
  let dataSourceId: string | undefined
  try {
    const db = await client.databases.retrieve({ database_id: databaseId })
    dataSourceId = db?.data_sources?.[0]?.id
  } catch { /* older API — fall back to databases.query */ }

  const out: Page[] = []
  let cursor: string | undefined = undefined
  do {
    let resp
    if (dataSourceId && client.dataSources?.query) {
      resp = await client.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor, page_size: 100 })
    } else {
      resp = await client.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 })
    }
    for (const page of resp.results) {
      if (page?.properties) out.push({ id: page.id ?? 'unknown', properties: page.properties as Props })
    }
    cursor = resp.has_more ? resp.next_cursor : undefined
  } while (cursor)
  return out
}

export interface ImportError { pageId: string; source: 'daily' | 'gym'; stage: string; message: string }
export interface ImportCounts {
  dailyPages: number; gymPages: number
  nutrition: number; bodyComp: number; metrics: number; sleep: number; sessions: number
  skipped: number
  errors: ImportError[]
}

// Helper: run a supabase write (a thenable query builder) and throw a labelled
// error if it fails. Typed as PromiseLike since builders aren't real Promises.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function write(stage: string, p: PromiseLike<{ error: any }>): Promise<void> {
  const { error } = await p
  if (error) throw new Error(`${stage}: ${error.message ?? JSON.stringify(error)}`)
}

// ─── Daily Log import ────────────────────────────────────────────────────────
async function importDailyLog(
  db: DB, userId: string, notion: Client, dbId: string, dryRun: boolean, counts: ImportCounts,
): Promise<void> {
  const pages = await fetchAllPages(notion, dbId)
  counts.dailyPages = pages.length

  for (const { id, properties: props } of pages) {
    try {
      const day = toDay(dateStart(props, 'Date (for calendar)') ?? dateStart(props, 'Date'))
      if (!day) {
        counts.skipped++
        counts.errors.push({ pageId: id, source: 'daily', stage: 'date', message: 'No valid date — skipped' })
        continue
      }

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

      if (calories != null || protein != null || carbs != null || fat != null) {
        await write('nutrition delete', db.from('nutrition_entries').delete()
          .eq('user_id', userId).eq('date', day).eq('meal_type', 'daily'))
        await write('nutrition insert', db.from('nutrition_entries').insert({
          user_id: userId, hk_uuid: null, logged_at: `${day}T00:00:00Z`, date: day,
          meal_type: 'daily', calories: calories ?? 0, protein_g: protein ?? 0,
          carbs_g: carbs ?? 0, fat_g: fat ?? 0, fiber_g: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any))
        counts.nutrition++
      }

      if (weight != null) {
        await write('body delete', db.from('body_composition').delete().eq('user_id', userId).eq('date', day))
        await write('body insert', db.from('body_composition').insert({
          user_id: userId, hk_uuid: null, measured_at: `${day}T00:00:00Z`, date: day,
          weight_kg: weight, body_fat_pct: bodyFat, muscle_mass_kg: muscle,
          water_pct: waterPct, bone_mass_kg: bone, bmi,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any))
        counts.bodyComp++
      }

      if (steps != null) {
        await write('metrics upsert', db.from('daily_metrics').upsert({
          user_id: userId, date: day, steps: Math.round(steps), active_cal: null, rest_hr: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any, { onConflict: 'user_id,date', ignoreDuplicates: false }))
        counts.metrics++
      }

      if (sleepH != null && sleepH > 0) {
        const { data: existing } = await db.from('sleep_sessions').select('id')
          .eq('user_id', userId).gte('start_time', `${day}T00:00:00Z`).lt('start_time', `${day}T23:59:59Z`).limit(1)
        if (!((existing ?? []) as unknown[]).length) {
          const durationMin = Math.round(sleepH * 60)
          await write('sleep insert', db.from('sleep_sessions').insert({
            user_id: userId, hk_uuid: null,
            start_time: `${day}T23:00:00Z`, end_time: `${day}T23:00:00Z`,
            duration_min: durationMin, deep_min: 0, rem_min: 0, core_min: durationMin, awake_min: 0, sleep_score: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any))
          counts.sleep++
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[import] daily page ${id} failed:`, message)
      counts.errors.push({ pageId: id, source: 'daily', stage: 'write', message })
    }
  }
}

// ─── Gym Session import ──────────────────────────────────────────────────────
async function importGymSessions(
  db: DB, userId: string, notion: Client, dbId: string, dryRun: boolean, counts: ImportCounts,
): Promise<void> {
  const pages = await fetchAllPages(notion, dbId)
  counts.gymPages = pages.length

  for (const { id, properties: props } of pages) {
    try {
      const day = toDay(dateStart(props, 'Date'))
      if (!day) {
        counts.skipped++
        counts.errors.push({ pageId: id, source: 'gym', stage: 'date', message: 'No valid date — skipped' })
        continue
      }
      const startedAt = `${day}T18:00:00Z`

      const typeRaw = (select(props, 'Type') ?? '').toLowerCase()
      const splitDay = (['push', 'pull', 'legs', 'upper', 'lower'].includes(typeRaw) ? typeRaw : 'legs')
      const volume   = num(props, 'Volume kg')
      const sets     = num(props, 'Sets')
      const prs      = num(props, 'PRs')
      const calories = num(props, 'Calories')
      const durationMin = parseDurationMin(richText(props, 'Duration'))
      const notes    = richText(props, 'Notes')

      if (dryRun) { counts.sessions++; continue }

      const { data: existing } = await db.from('workout_sessions').select('id')
        .eq('user_id', userId).eq('split_day', splitDay)
        .gte('started_at', `${day}T00:00:00Z`).lt('started_at', `${day}T23:59:59Z`).limit(1)
      if (((existing ?? []) as unknown[]).length) continue

      const endedAt = durationMin ? new Date(new Date(startedAt).getTime() + durationMin * 60000).toISOString() : null
      await write('session insert', db.from('workout_sessions').insert({
        user_id: userId, notion_page_id: null, started_at: startedAt, ended_at: endedAt,
        split_day: splitDay, notes: notes ?? null, total_volume_kg: volume,
        session_score: null, set_count: sets != null ? Math.round(sets) : null,
        pr_count: prs != null ? Math.round(prs) : null, duration_min: durationMin,
        calories_burned: calories != null ? Math.round(calories) : null, avg_bpm: null,
        report_md: null, migrated_from_notion: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any))
      counts.sessions++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[import] gym page ${id} failed:`, message)
      counts.errors.push({ pageId: id, source: 'gym', stage: 'write', message })
    }
  }
}

export async function runHistoricalImport(
  db: DB, userId: string, notion: Client, dailyDbId: string, gymDbId: string, dryRun: boolean,
): Promise<ImportCounts> {
  const counts: ImportCounts = {
    dailyPages: 0, gymPages: 0, nutrition: 0, bodyComp: 0, metrics: 0, sleep: 0, sessions: 0,
    skipped: 0, errors: [],
  }
  await importDailyLog(db, userId, notion, dailyDbId, dryRun, counts)
  await importGymSessions(db, userId, notion, gymDbId, dryRun, counts)
  return counts
}
