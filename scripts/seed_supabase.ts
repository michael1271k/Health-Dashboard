/**
 * seed_supabase.ts — bulletproof Notion → Supabase seeder (Phase 8).
 *
 *   npx tsx scripts/seed_supabase.ts            # dry run (counts only, no writes)
 *   npx tsx scripts/seed_supabase.ts --apply    # wipe + insert via the JS client
 *
 * Replaces the fragile raw-SQL dump: rows are written with @supabase/supabase-js
 * PARAMETERIZED inserts (values travel as JSON), so apostrophes, semicolons,
 * `--`, and huge markdown blocks can never cause a SQL syntax error.
 *
 * Clean slate: deletes the 11 transactional tables for the single app user,
 * PRESERVING the exercises catalog + user_goals. Weekly reports: each weekly
 * page's two child SUBPAGES (Gym Session Summary + Weight Management Report) are
 * fetched separately into reports.session_summary_md / weight_report_md.
 *
 * Env (process or .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   NOTION_TOKEN, NOTION_DAILY_LOG_DB_ID, NOTION_GYM_DB_ID, [NOTION_WEEKLY_DB_ID]
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client } from '@notionhq/client'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

type Props = Record<string, any>
interface Page { id: string; properties: Props; createdTime?: string }

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnvLocal(): void {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const m = raw.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = val
  }
}

// ── Notion readers (forgiving) ───────────────────────────────────────────────
const num = (p: Props, n: string): number | null => {
  const v = p[n]?.number
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const dateStart = (p: Props, n: string): string | null => {
  const s = p[n]?.date?.start
  return typeof s === 'string' && s.length >= 8 ? s : null
}
const select = (p: Props, n: string): string | null => p[n]?.select?.name ?? null
const richText = (p: Props, n: string): string | null => {
  const arr = (p[n]?.rich_text ?? p[n]?.title) as Array<{ plain_text?: string }> | undefined
  if (!arr?.length) return null
  const s = arr.map((t) => t.plain_text ?? '').join('').trim()
  return s || null
}
const toDay = (raw: string | null): string | null => {
  if (!raw) return null
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00Z` : raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
function parseDurationMin(raw: string | null): number | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  let m = s.match(/(\d+)\s*h(?:ours?)?\s*(\d+)?/); if (m) return +m[1] * 60 + (m[2] ? +m[2] : 0)
  m = s.match(/^(\d+):(\d+)$/); if (m) return +m[1] * 60 + +m[2]
  m = s.match(/(\d+)\s*m/); if (m) return +m[1]
  m = s.match(/^(\d+)$/); if (m) return +m[1]
  return null
}
const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

function richArr(arr: Array<{ plain_text?: string }> | undefined): string {
  return arr?.length ? arr.map((t) => t.plain_text ?? '').join('') : ''
}
/** Render a page's block children to markdown. */
async function fetchPageMarkdown(notion: any, pageId: string): Promise<string> {
  const parts: string[] = []
  let cursor: string | undefined
  try {
    do {
      const resp = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 })
      for (const b of resp.results ?? []) {
        const t: string | undefined = b?.type
        if (!t) continue
        const text = richArr(b[t]?.rich_text)
        if (t === 'heading_1') parts.push(`# ${text}`)
        else if (t === 'heading_2') parts.push(`## ${text}`)
        else if (t === 'heading_3') parts.push(`### ${text}`)
        else if (t === 'bulleted_list_item' || t === 'numbered_list_item') parts.push(`- ${text}`)
        else if (t === 'to_do') parts.push(`- [${b[t]?.checked ? 'x' : ' '}] ${text}`)
        else if (t === 'quote') parts.push(`> ${text}`)
        else if (text) parts.push(text)
      }
      cursor = resp.has_more ? resp.next_cursor : undefined
    } while (cursor)
  } catch { /* unreadable */ }
  return parts.join('\n').trim()
}
/** Find direct child_page subpages of a page → [{ title, content }]. */
async function fetchSubpages(notion: any, pageId: string): Promise<Array<{ title: string; content: string }>> {
  const out: Array<{ title: string; content: string }> = []
  let cursor: string | undefined
  try {
    do {
      const resp = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 })
      for (const b of resp.results ?? []) {
        if (b?.type === 'child_page') {
          out.push({ title: b.child_page?.title ?? 'Untitled', content: await fetchPageMarkdown(notion, b.id) })
        }
      }
      cursor = resp.has_more ? resp.next_cursor : undefined
    } while (cursor)
  } catch { /* unreadable */ }
  return out
}

async function fetchAllPages(notion: any, databaseId: string): Promise<Page[]> {
  let dataSourceId: string | undefined
  try { dataSourceId = (await notion.databases.retrieve({ database_id: databaseId }))?.data_sources?.[0]?.id } catch {}
  const out: Page[] = []
  let cursor: string | undefined
  do {
    const resp = dataSourceId && notion.dataSources?.query
      ? await notion.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor, page_size: 100 })
      : await notion.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 })
    for (const page of resp.results) if (page?.properties) out.push({ id: page.id ?? 'unknown', properties: page.properties, createdTime: page.created_time })
    cursor = resp.has_more ? resp.next_cursor : undefined
  } while (cursor)
  return out
}

// Mirror of src/lib/nutrition/phase.ts (tsx can't resolve @/ aliases here).
const phaseFor = (cal: number): string | null =>
  !cal || cal <= 0 ? null : cal < 2150 ? 'cut' : cal < 2550 ? 'maintenance' : 'bulk'

const chunk = <T,>(a: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}

async function main(): Promise<void> {
  loadEnvLocal()
  const apply = process.argv.includes('--apply')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const token = process.env.NOTION_TOKEN
  const dailyDbId = process.env.NOTION_DAILY_LOG_DB_ID
  const gymDbId = process.env.NOTION_GYM_DB_ID
  const weeklyDbId = process.env.NOTION_WEEKLY_DB_ID ?? '6b5d0d3ac08b462193a941fcbe00c200'
  if (!url || !serviceKey || !token || !dailyDbId || !gymDbId) {
    console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTION_TOKEN, NOTION_DAILY_LOG_DB_ID, NOTION_GYM_DB_ID.')
    process.exit(1)
  }

  const notion = new Client({ auth: token }) as any
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: userData, error: userErr } = await supabase.auth.admin.listUsers()
  if (userErr || !userData?.users?.length) { console.error('No app user found:', userErr?.message); process.exit(1) }
  const uid = userData.users[0].id

  const skips: Array<{ id: string; source: string; reason: string }> = []
  const notionUrl = (id: string) => `https://notion.so/${id.replace(/-/g, '')}`
  const skip = (id: string, source: string, reason: string) => skips.push({ id, source, reason })

  const dailyLogs: any[] = [], nutrition: any[] = [], body: any[] = [], metrics: any[] = [], sleep: any[] = []
  const sessions: any[] = [], reports: any[] = []

  // ── Daily Log ──
  for (const { id, properties: p } of await fetchAllPages(notion, dailyDbId)) {
    try {
      const day = toDay(dateStart(p, 'Date (for calendar)') ?? dateStart(p, 'Date'))
      if (!day) { skip(id, 'daily', 'no valid Date property'); continue }
      const calories = num(p, 'Calories'), protein = num(p, 'Protein g'), carbs = num(p, 'Carbs g'), fat = num(p, 'Fat g')
      const weight = num(p, 'Weight (kg)'), bodyFat = num(p, 'Body Fat Percentage (%)'), muscle = num(p, 'Muscle Mass (kg)')
      const waterPct = num(p, 'Body Water Percentage (%)'), bone = num(p, 'Bone Mineral Content (kg)'), bmi = num(p, 'BMI')
      const steps = num(p, 'Steps'), sleepH = num(p, 'Sleep h')
      const sleepMin = sleepH != null && sleepH > 0 ? Math.round(sleepH * 60) : null

      dailyLogs.push({
        user_id: uid, date: day, steps: steps == null ? null : Math.round(steps), sleep_minutes: sleepMin,
        carbs_g: carbs, protein_g: protein, fats_g: fat, weight_kg: weight, lean_mass_kg: muscle,
        bmi, body_fat_pct: bodyFat, water_percent: waterPct, bone_mineral: bone,
      })
      if (calories != null || protein != null || carbs != null || fat != null) {
        nutrition.push({ user_id: uid, hk_uuid: null, logged_at: `${day}T00:00:00Z`, date: day, meal_type: 'daily', calories: Math.round(calories ?? 0), protein_g: protein ?? 0, carbs_g: carbs ?? 0, fat_g: fat ?? 0, fiber_g: null, phase: phaseFor(Math.round(calories ?? 0)) })
      }
      if (weight != null) body.push({ user_id: uid, hk_uuid: null, measured_at: `${day}T00:00:00Z`, date: day, weight_kg: weight, body_fat_pct: bodyFat, muscle_mass_kg: muscle, water_pct: waterPct, bone_mass_kg: bone, bmi })
      if (steps != null) metrics.push({ user_id: uid, date: day, steps: Math.round(steps), active_cal: null, rest_hr: null })
      if (sleepMin != null) sleep.push({ user_id: uid, hk_uuid: null, start_time: `${day}T23:00:00Z`, end_time: `${day}T23:00:00Z`, duration_min: sleepMin, deep_min: 0, rem_min: 0, core_min: sleepMin, awake_min: 0, sleep_score: null })
    } catch (e) { skip(id, 'daily', e instanceof Error ? e.message : String(e)) }
  }

  // ── Gym Sessions (page body → report_md verbatim) ──
  for (const { id, properties: p, createdTime } of await fetchAllPages(notion, gymDbId)) {
    try {
      // Broadened date detection so early sessions (e.g. Mar 10–27) aren't dropped.
      const day = toDay(
        dateStart(p, 'Date') ?? dateStart(p, 'Date (for calendar)') ??
        dateStart(p, 'Session Date') ?? dateStart(p, 'Day') ?? (createdTime ?? null),
      )
      if (!day) { skip(id, 'gym', 'no valid date (tried Date / Date (for calendar) / Session Date / Day / created)'); continue }
      const typeRaw = (select(p, 'Type') ?? '').toLowerCase()
      const splitDay = ['push', 'pull', 'legs', 'upper', 'lower'].includes(typeRaw) ? typeRaw : 'legs'
      const durationMin = parseDurationMin(richText(p, 'Duration'))
      const startedAt = `${day}T18:00:00Z`
      sessions.push({
        user_id: uid, notion_page_id: id, started_at: startedAt,
        ended_at: durationMin ? new Date(new Date(startedAt).getTime() + durationMin * 60000).toISOString() : null,
        split_day: splitDay, notes: richText(p, 'Notes'), total_volume_kg: num(p, 'Volume kg'),
        session_score: null, set_count: num(p, 'Sets'), pr_count: num(p, 'PRs'), duration_min: durationMin,
        calories_burned: num(p, 'Calories'), avg_bpm: null, report_md: (await fetchPageMarkdown(notion, id)) || null,
        migrated_from_notion: true,
      })
    } catch (e) { skip(id, 'gym', e instanceof Error ? e.message : String(e)) }
  }

  // ── Weekly Summaries → reports (two subpages = two files) ──
  try {
    for (const { id, properties: p, createdTime } of await fetchAllPages(notion, weeklyDbId)) {
      try {
        const rawStart = dateStart(p, 'Date') ?? dateStart(p, 'Week') ?? dateStart(p, 'Week Of') ?? dateStart(p, 'Period') ?? dateStart(p, 'Date (for calendar)')
        const startDay = toDay(rawStart) ?? (createdTime ? toDay(createdTime) : null)
        if (!startDay) { skip(id, 'weekly', 'no determinable week date'); continue }
        const endDay = toDay(p['Date']?.date?.end ?? p['Week']?.date?.end ?? p['Period']?.date?.end ?? null) ?? addDays(startDay, 6)
        const title = richText(p, 'Name') ?? richText(p, 'Title') ?? `Week of ${startDay}`
        const overview = await fetchPageMarkdown(notion, id)
        const subs = await fetchSubpages(notion, id)
        let sessionMd: string | null = null, weightMd: string | null = null
        for (const s of subs) {
          if (/weight|composition|body/i.test(s.title)) weightMd = s.content
          else sessionMd = s.content
        }
        reports.push({
          user_id: uid, type: 'weekly', period_start: startDay, period_end: endDay,
          content_md: [`# ${title}`, overview].filter(Boolean).join('\n\n').trim() || title,
          session_summary_md: sessionMd, weight_report_md: weightMd, metrics: null, notion_page_id: id,
        })
      } catch (e) { skip(id, 'weekly', e instanceof Error ? e.message : String(e)) }
    }
  } catch (e) { console.warn(`⚠ Weekly DB ${weeklyDbId} unreadable: ${String(e).slice(0, 100)}`) }

  // ── Report ──
  const summary = {
    daily_logs: dailyLogs.length, nutrition_entries: nutrition.length, body_composition: body.length,
    daily_metrics: metrics.length, sleep_sessions: sleep.length, workout_sessions: sessions.length, reports: reports.length,
  }
  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — rows pulled from Notion:`)
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(18)} ${v}`)

  if (!apply) {
    console.log('\nRe-run with --apply to wipe + insert. Skipped pages below.')
  } else {
    // Clean slate (children before parents); preserve exercises + user_goals.
    for (const t of ['workout_sets', 'workout_sessions', 'nutrition_entries', 'body_composition', 'daily_metrics', 'sleep_sessions', 'water_intake', 'supplements', 'daily_scores', 'daily_logs', 'reports']) {
      const { error } = await supabase.from(t).delete().eq('user_id', uid)
      if (error) console.error(`  delete ${t} failed: ${error.message}`)
    }
    const insertAll = async (table: string, rows: any[], conflict?: string) => {
      let ok = 0
      for (const part of chunk(rows, 500)) {
        const q = conflict
          ? supabase.from(table).upsert(part as any, { onConflict: conflict })
          : supabase.from(table).insert(part as any)
        const { error } = await q
        if (error) console.error(`  insert ${table} failed: ${error.message}`)
        else ok += part.length
      }
      console.log(`  ✓ ${table.padEnd(18)} ${ok}`)
    }
    await insertAll('daily_logs', dailyLogs, 'user_id,date')
    await insertAll('nutrition_entries', nutrition)
    await insertAll('body_composition', body)
    await insertAll('daily_metrics', metrics, 'user_id,date')
    await insertAll('sleep_sessions', sleep)
    await insertAll('workout_sessions', sessions)
    await insertAll('reports', reports, 'user_id,period_start,period_end')
    console.log('✓ Apply complete.')
  }

  if (skips.length) {
    console.log(`\n⚠ Skipped ${skips.length} page(s) — open each, fix, then re-run:`)
    for (const s of skips) console.log(`  [${s.source}] ${notionUrl(s.id)}  — ${s.reason}`)
  }
}

main().catch((err) => { console.error('seed_supabase failed:', err); process.exit(1) })
