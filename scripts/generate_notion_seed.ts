/**
 * generate_notion_seed.ts — local, one-shot Notion → SQL dump.
 *
 *   npx tsx scripts/generate_notion_seed.ts
 *
 * Pulls every page from the Notion Daily Log + PPL Session databases and emits a
 * single idempotent `historical_seed.sql` at the repo root: a clean-slate set of
 * DELETEs (scoped to the single app user) followed by INSERTs. Review it, then
 * run it manually against Supabase (SQL editor / psql). This script NEVER touches
 * the database itself.
 *
 * Forgiving by design: every page is parsed inside its own try/catch, bad rows
 * are skipped silently, and a single malformed page never aborts the dump.
 *
 * Env (read from the process or `.env.local`):
 *   NOTION_TOKEN, NOTION_DAILY_LOG_DB_ID, NOTION_GYM_DB_ID, [NOTION_WEEKLY_DB_ID]
 *
 * Also fetches Weekly Summaries (Weekly Session Summary + Weight Management
 * Report live in each weekly page's BODY) → `reports`, and captures each Gym
 * Session's Notion page body verbatim → `workout_sessions.report_md`.
 */

import { Client } from '@notionhq/client'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Props = Record<string, any>
interface Page { id: string; properties: Props; createdTime?: string }

// ── tiny .env.local loader (tsx doesn't auto-load dotenv) ────────────────────
function loadEnvLocal(): void {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const m = raw.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

// ── Notion property readers (forgiving) ──────────────────────────────────────
function num(props: Props, name: string): number | null {
  const v = props[name]?.number
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function dateStart(props: Props, name: string): string | null {
  const s = props[name]?.date?.start
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
function toDay(raw: string | null): string | null {
  if (!raw) return null
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00Z` : raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}
function parseDurationMin(raw: string | null): number | null {
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

// ── Page body → markdown (for weekly + gym session summaries) ────────────────
function richArrToText(arr: Array<{ plain_text?: string }> | undefined): string {
  if (!arr?.length) return ''
  return arr.map((t) => t.plain_text ?? '').join('')
}

/** List a Notion page's block children (paginated) and render readable markdown. */
async function fetchPageMarkdown(notion: Client, pageId: string): Promise<string> {
  const client = notion as any
  const parts: string[] = []
  let cursor: string | undefined
  try {
    do {
      const resp = await client.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 })
      for (const b of resp.results ?? []) {
        const t: string | undefined = b?.type
        if (!t) continue
        const data = b[t]
        const text = richArrToText(data?.rich_text)
        if (t === 'heading_1') parts.push(`# ${text}`)
        else if (t === 'heading_2') parts.push(`## ${text}`)
        else if (t === 'heading_3') parts.push(`### ${text}`)
        else if (t === 'bulleted_list_item' || t === 'numbered_list_item') parts.push(`- ${text}`)
        else if (t === 'to_do') parts.push(`- [${data?.checked ? 'x' : ' '}] ${text}`)
        else if (t === 'quote') parts.push(`> ${text}`)
        else if (text) parts.push(text)
      }
      cursor = resp.has_more ? resp.next_cursor : undefined
    } while (cursor)
  } catch { /* unreadable page — return whatever we collected */ }
  return parts.join('\n').trim()
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── SQL emit helpers ─────────────────────────────────────────────────────────
const USER = '(SELECT id FROM auth.users ORDER BY created_at LIMIT 1)'
function sNum(v: number | null): string { return v == null || !Number.isFinite(v) ? 'NULL' : String(v) }
function sInt(v: number | null): string { return v == null || !Number.isFinite(v) ? 'NULL' : String(Math.round(v)) }
function sStr(v: string | null): string { return v == null ? 'NULL' : `'${v.replace(/'/g, "''")}'` }
function sTs(day: string, hms: string): string { return `'${day}T${hms}Z'` }

// ── Fetch all pages (paginated; dataSources with databases.query fallback) ───
async function fetchAllPages(notion: Client, databaseId: string): Promise<Page[]> {
  const client = notion as any
  let dataSourceId: string | undefined
  try {
    const db = await client.databases.retrieve({ database_id: databaseId })
    dataSourceId = db?.data_sources?.[0]?.id
  } catch { /* older API — fall back to databases.query */ }

  const out: Page[] = []
  let cursor: string | undefined
  do {
    let resp: any
    if (dataSourceId && client.dataSources?.query) {
      resp = await client.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor, page_size: 100 })
    } else {
      resp = await client.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 })
    }
    for (const page of resp.results) {
      if (page?.properties) out.push({ id: page.id ?? 'unknown', properties: page.properties as Props, createdTime: page.created_time })
    }
    cursor = resp.has_more ? resp.next_cursor : undefined
  } while (cursor)
  return out
}

async function main(): Promise<void> {
  loadEnvLocal()
  const token = process.env.NOTION_TOKEN
  const dailyDbId = process.env.NOTION_DAILY_LOG_DB_ID
  const gymDbId = process.env.NOTION_GYM_DB_ID
  if (!token || !dailyDbId || !gymDbId) {
    console.error('Missing env: NOTION_TOKEN, NOTION_DAILY_LOG_DB_ID, NOTION_GYM_DB_ID must be set (env or .env.local).')
    process.exit(1)
  }

  const notion = new Client({ auth: token })
  const lines: string[] = []
  const counts = { daily: 0, gym: 0, nutrition: 0, body: 0, metrics: 0, sleep: 0, sessions: 0, weekly: 0, skipped: 0 }

  lines.push('-- ============================================================')
  lines.push('-- historical_seed.sql — generated by scripts/generate_notion_seed.ts')
  lines.push(`-- Generated: ${new Date().toISOString()}`)
  lines.push('-- CLEAN SLATE: wipes the user\'s existing records, then re-inserts from Notion.')
  lines.push('-- Review before running against Supabase.')
  lines.push('-- ============================================================')
  lines.push('')
  lines.push('BEGIN;')
  lines.push('')
  lines.push('-- ── Clean slate (scoped to the single app user) ──')
  lines.push('-- Wipes all transactional tables; PRESERVES exercises catalog + user_goals.')
  lines.push('-- Children before parents (workout_sets → workout_sessions).')
  for (const t of [
    'workout_sets', 'workout_sessions', 'nutrition_entries', 'body_composition',
    'daily_metrics', 'sleep_sessions', 'water_intake', 'supplements',
    'daily_scores', 'daily_logs', 'reports',
  ]) {
    lines.push(`DELETE FROM ${t} WHERE user_id = ${USER};`)
  }
  lines.push('')

  // ── Daily Log → daily_logs + fan-out ──
  const dailyPages = await fetchAllPages(notion, dailyDbId)
  lines.push(`-- ── Daily Log (${dailyPages.length} Notion pages) ──`)
  for (const { properties: props } of dailyPages) {
    try {
      const day = toDay(dateStart(props, 'Date (for calendar)') ?? dateStart(props, 'Date'))
      if (!day) { counts.skipped++; continue }

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
      const sleepMin = sleepH != null && sleepH > 0 ? Math.round(sleepH * 60) : null

      // daily_logs (canonical flat row)
      lines.push(
        `INSERT INTO daily_logs (user_id, date, steps, sleep_minutes, carbs_g, protein_g, fats_g, ` +
        `weight_kg, lean_mass_kg, bmi, body_fat_pct, water_percent, bone_mineral) VALUES (` +
        `${USER}, '${day}', ${sInt(steps)}, ${sInt(sleepMin)}, ${sNum(carbs)}, ${sNum(protein)}, ${sNum(fat)}, ` +
        `${sNum(weight)}, ${sNum(muscle)}, ${sNum(bmi)}, ${sNum(bodyFat)}, ${sNum(waterPct)}, ${sNum(bone)});`,
      )
      counts.daily++

      if (calories != null || protein != null || carbs != null || fat != null) {
        lines.push(
          `INSERT INTO nutrition_entries (user_id, hk_uuid, logged_at, date, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g) VALUES (` +
          `${USER}, NULL, ${sTs(day, '00:00:00')}, '${day}', 'daily', ${sInt(calories ?? 0)}, ${sNum(protein ?? 0)}, ${sNum(carbs ?? 0)}, ${sNum(fat ?? 0)}, NULL);`,
        )
        counts.nutrition++
      }
      if (weight != null) {
        lines.push(
          `INSERT INTO body_composition (user_id, hk_uuid, measured_at, date, weight_kg, body_fat_pct, muscle_mass_kg, water_pct, bone_mass_kg, bmi) VALUES (` +
          `${USER}, NULL, ${sTs(day, '00:00:00')}, '${day}', ${sNum(weight)}, ${sNum(bodyFat)}, ${sNum(muscle)}, ${sNum(waterPct)}, ${sNum(bone)}, ${sNum(bmi)});`,
        )
        counts.body++
      }
      if (steps != null) {
        lines.push(
          `INSERT INTO daily_metrics (user_id, date, steps, active_cal, rest_hr) VALUES (` +
          `${USER}, '${day}', ${sInt(steps)}, NULL, NULL);`,
        )
        counts.metrics++
      }
      if (sleepMin != null) {
        lines.push(
          `INSERT INTO sleep_sessions (user_id, hk_uuid, start_time, end_time, duration_min, deep_min, rem_min, core_min, awake_min, sleep_score) VALUES (` +
          `${USER}, NULL, ${sTs(day, '23:00:00')}, ${sTs(day, '23:00:00')}, ${sInt(sleepMin)}, 0, 0, ${sInt(sleepMin)}, 0, NULL);`,
        )
        counts.sleep++
      }
    } catch {
      counts.skipped++
    }
  }
  lines.push('')

  // ── PPL Sessions → workout_sessions ──
  const gymPages = await fetchAllPages(notion, gymDbId)
  lines.push(`-- ── PPL Sessions (${gymPages.length} Notion pages) ──`)
  for (const { id: gymPageId, properties: props } of gymPages) {
    try {
      const day = toDay(dateStart(props, 'Date'))
      if (!day) { counts.skipped++; continue }
      const typeRaw = (select(props, 'Type') ?? '').toLowerCase()
      const splitDay = ['push', 'pull', 'legs', 'upper', 'lower'].includes(typeRaw) ? typeRaw : 'legs'
      const volume = num(props, 'Volume kg')
      const sets = num(props, 'Sets')
      const prs = num(props, 'PRs')
      const calories = num(props, 'Calories')
      const durationMin = parseDurationMin(richText(props, 'Duration'))
      const notes = richText(props, 'Notes')
      const startedAt = `${day}T18:00:00Z`
      const endedAt = durationMin
        ? `'${new Date(new Date(startedAt).getTime() + durationMin * 60000).toISOString()}'`
        : 'NULL'

      // Gym Session Summary — the Notion page body, captured verbatim.
      const summary = await fetchPageMarkdown(notion, gymPageId)

      lines.push(
        `INSERT INTO workout_sessions (user_id, notion_page_id, started_at, ended_at, split_day, notes, total_volume_kg, ` +
        `session_score, set_count, pr_count, duration_min, calories_burned, avg_bpm, report_md, migrated_from_notion) VALUES (` +
        `${USER}, ${sStr(gymPageId)}, '${startedAt}', ${endedAt}, '${splitDay}', ${sStr(notes)}, ${sNum(volume)}, ` +
        `NULL, ${sInt(sets)}, ${sInt(prs)}, ${sInt(durationMin)}, ${sInt(calories)}, NULL, ${sStr(summary || null)}, true);`,
      )
      counts.sessions++
    } catch {
      counts.skipped++
    }
  }
  lines.push('')

  // ── Weekly Summaries → reports (one row per week; body holds the Weekly
  //    Session Summary + Weight Management Report). `reports` is already wiped
  //    in the clean-slate block above. ──
  const weeklyDbId = process.env.NOTION_WEEKLY_DB_ID ?? '6b5d0d3ac08b462193a941fcbe00c200'
  try {
    const weeklyPages = await fetchAllPages(notion, weeklyDbId)
    lines.push(`-- ── Weekly Summaries (${weeklyPages.length} Notion pages) ──`)
    for (const { id: pageId, properties: props, createdTime } of weeklyPages) {
      try {
        const rawStart =
          dateStart(props, 'Date') ?? dateStart(props, 'Week') ?? dateStart(props, 'Week Of') ??
          dateStart(props, 'Period') ?? dateStart(props, 'Date (for calendar)')
        const rawEnd =
          props['Date']?.date?.end ?? props['Week']?.date?.end ?? props['Period']?.date?.end ?? null
        const startDay = toDay(rawStart) ?? (createdTime ? toDay(createdTime) : null)
        if (!startDay) { counts.skipped++; continue }
        const endDay = toDay(rawEnd) ?? addDays(startDay, 6)

        const title = richText(props, 'Name') ?? richText(props, 'Title') ?? `Week of ${startDay}`
        const body = await fetchPageMarkdown(notion, pageId)
        const content = [`# ${title}`, body].filter(Boolean).join('\n\n').trim() || title

        lines.push(
          `INSERT INTO reports (user_id, type, period_start, period_end, content_md, metrics, notion_page_id) VALUES (` +
          `${USER}, 'weekly', '${startDay}', '${endDay}', ${sStr(content)}, NULL, ${sStr(pageId)}) ` +
          `ON CONFLICT (user_id, period_start, period_end) DO NOTHING;`,
        )
        counts.weekly++
      } catch { counts.skipped++ }
    }
    lines.push('')
  } catch (err) {
    lines.push(`-- ⚠ Weekly summaries DB (${weeklyDbId}) unreadable — skipped: ${String(err).slice(0, 80)}`)
    lines.push('')
  }

  lines.push('COMMIT;')
  lines.push('')

  const outPath = resolve(process.cwd(), 'historical_seed.sql')
  writeFileSync(outPath, lines.join('\n'), 'utf8')

  console.log(`✓ Wrote ${outPath}`)
  console.log(`  daily_logs:        ${counts.daily}`)
  console.log(`  nutrition_entries: ${counts.nutrition}`)
  console.log(`  body_composition:  ${counts.body}`)
  console.log(`  daily_metrics:     ${counts.metrics}`)
  console.log(`  sleep_sessions:    ${counts.sleep}`)
  console.log(`  workout_sessions:  ${counts.sessions}`)
  console.log(`  weekly reports:    ${counts.weekly}`)
  console.log(`  skipped pages:     ${counts.skipped}`)
}

main().catch((err) => {
  console.error('generate_notion_seed failed:', err)
  process.exit(1)
})
