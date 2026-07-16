/**
 * One-off Notion → Supabase backfill.
 *
 * Pulls the historical "📅 Daily Log" (nutrition + weight + body composition)
 * from Notion and upserts it into Supabase to fill data gaps. Notion is a
 * read-only backup — Apple Health / the native iOS app is the source of truth
 * going forward, so this is a recovery tool, not a sync.
 *
 * WHAT IT WRITES (idempotent; safe to re-run):
 *   • nutrition_entries  — calories + macros           (key: hk_uuid)
 *   • body_composition   — weight + composition        (key: hk_uuid)
 *   • daily_logs         — ONLY the nutrition/weight/body-comp columns
 *                          (key: user_id,date). Steps, sleep, water, journal and
 *                          all Apple-Health/native fields are LEFT UNTOUCHED.
 *
 * WHAT IT DOES NOT DO:
 *   • Workouts are intentionally NOT imported. Notion holds only per-session
 *     prose, not per-set data, so re-importing would be lossy — keep the richer
 *     workout_sessions / workout_sets already in Supabase and re-log any gaps
 *     via Hevy.
 *   • The 29 Jun – 14 Jul 2026 vacation window is skipped (left empty) by design.
 *
 * ONE-TIME SETUP:
 *   1. Create an internal integration at https://notion.so/my-integrations
 *   2. Share the "📅 Daily Log" database with that integration.
 *   3. Add to .env.local:
 *        NOTION_TOKEN=secret_xxxxxxxx
 *        NOTION_DAILY_LOG_DB_ID=e21698bd-8e65-42ca-9834-3ceb2c06fc35
 *
 * RUN:
 *   npx tsx scripts/import_notion.ts            # dry run — prints what it would write
 *   npx tsx scripts/import_notion.ts --apply    # writes to Supabase
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NOTION_VERSION = '2022-06-28'
const GAP_START = '2026-06-29'   // inclusive vacation window to leave empty
const GAP_END = '2026-07-14'

function loadEnvLocal() {
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  } catch { /* ignore */ }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (p: any): number | null => (p && typeof p.number === 'number' ? p.number : null)
const dateStart = (p: any): string | null => p?.date?.start ?? null
const plain = (arr: any[] | undefined): string | null => {
  const s = (arr ?? []).map((t: any) => t.plain_text ?? '').join('').trim()
  return s || null
}
const round = (v: number | null): number | null => (v == null ? null : Math.round(v))

/** cut ≤ 2050 · maintenance < 2450 · bulk otherwise (mirrors lib/nutrition/phase). */
function derivePhase(cal: number | null): string | null {
  if (cal == null) return null
  if (cal <= 2050) return 'cut'
  if (cal < 2450) return 'maintenance'
  return 'bulk'
}

async function fetchAllPages(token: string, dbId: string): Promise<any[]> {
  const out: any[] = []
  let cursor: string | undefined
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    })
    if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
    const j = await res.json() as { results: any[]; has_more: boolean; next_cursor: string | null }
    out.push(...j.results)
    cursor = j.has_more ? (j.next_cursor ?? undefined) : undefined
  } while (cursor)
  return out
}

function dateOf(props: any): string | null {
  const cal = dateStart(props['Date (for calendar)'])
  if (cal) return cal.slice(0, 10)
  const title = plain(props['Date']?.title)
  const m = title?.match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}

function chunk<T>(a: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
}

async function main() {
  loadEnvLocal()
  const apply = process.argv.includes('--apply')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const notionToken = process.env.NOTION_TOKEN
  const dbId = process.env.NOTION_DAILY_LOG_DB_ID
  if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
  if (!notionToken || !dbId) { console.error('Missing NOTION_TOKEN / NOTION_DAILY_LOG_DB_ID in .env.local (see file header)'); process.exit(1) }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data: u } = await sb.auth.admin.listUsers()
  const uid = u?.users?.[0]?.id
  if (!uid) { console.error('No app user found'); process.exit(1) }

  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — Notion → Supabase import (user ${uid.slice(0, 8)}…)`)
  const pages = await fetchAllPages(notionToken, dbId)
  console.log(`  fetched ${pages.length} Notion rows`)

  const nutritionRows: any[] = []
  const bodyRows: any[] = []
  const dailyRows: any[] = []
  let skippedGap = 0, skippedNoDate = 0

  for (const pg of pages) {
    const p = pg.properties ?? {}
    const date = dateOf(p)
    if (!date) { skippedNoDate++; continue }
    if (date >= GAP_START && date <= GAP_END) { skippedGap++; continue }

    const calories = num(p['Calories'])
    const protein = num(p['Protein g'])
    const carbs = num(p['Carbs g'])
    const fat = num(p['Fat g'])
    const weight = num(p['Weight (kg)'])
    const bodyFat = num(p['Body Fat Percentage (%)'])
    const muscleKg = num(p['Muscle Mass (kg)'])
    const musclePct = num(p['Muscle Percentage (%)'])
    const waterPct = num(p['Body Water Percentage (%)'])
    const boneKg = num(p['Bone Mineral Content (kg)'])
    const bmi = num(p['BMI'])
    const bmr = num(p['Basal Metabolic Rate'])
    const visceral = num(p['Visceral Fat Rating'])
    const leanKg = num(p['Fat Free Body Weight (kg)'])
    const ts = `${date}T12:00:00Z`

    if (calories != null || protein != null || carbs != null || fat != null) {
      nutritionRows.push({
        user_id: uid, hk_uuid: `notion:nutrition:${date}`, date, logged_at: ts, meal_type: 'daily',
        calories: calories ?? 0, protein_g: protein ?? 0, carbs_g: carbs ?? 0, fat_g: fat ?? 0,
        phase: derivePhase(calories),
      })
    }
    if (weight != null) {
      bodyRows.push({
        user_id: uid, hk_uuid: `notion:body:${date}`, date, measured_at: ts,
        weight_kg: weight, body_fat_pct: bodyFat, muscle_mass_kg: muscleKg,
        water_pct: waterPct, bone_mass_kg: boneKg, bmi,
      })
    }
    // daily_logs — ONLY the nutrition/weight/body-comp columns (consistent shape
    // so the batch upsert touches exactly these and leaves steps/sleep/water/
    // journal + Apple-Health fields intact).
    dailyRows.push({
      user_id: uid, date,
      weight_kg: weight, carbs_g: carbs, protein_g: protein, fats_g: fat,
      bmi, body_fat_pct: bodyFat, lean_mass_kg: leanKg,
      muscle_percent: musclePct, water_percent: waterPct, bone_mineral: boneKg,
      visceral_fat: visceral, bmr: round(bmr),
    })
  }

  console.log(`  → nutrition_entries ${nutritionRows.length} · body_composition ${bodyRows.length} · daily_logs ${dailyRows.length}`)
  console.log(`  → skipped ${skippedGap} in vacation gap (${GAP_START}…${GAP_END}), ${skippedNoDate} without a date`)

  if (!apply) {
    const sample = dailyRows[0]
    if (sample) console.log(`  sample daily row:`, JSON.stringify(sample))
    console.log('\nRe-run with --apply to write.')
    return
  }

  for (const c of chunk(nutritionRows, 200)) {
    const { error } = await sb.from('nutrition_entries').upsert(c as never[], { onConflict: 'hk_uuid' })
    if (error) console.error('  ✗ nutrition_entries:', error.message)
  }
  for (const c of chunk(bodyRows, 200)) {
    const { error } = await sb.from('body_composition').upsert(c as never[], { onConflict: 'hk_uuid' })
    if (error) console.error('  ✗ body_composition:', error.message)
  }
  for (const c of chunk(dailyRows, 200)) {
    const { error } = await sb.from('daily_logs').upsert(c as never[], { onConflict: 'user_id,date' })
    if (error) console.error('  ✗ daily_logs:', error.message)
  }
  console.log('✓ Import complete.')
}

main().catch((e) => { console.error('import_notion failed:', e); process.exit(1) })
