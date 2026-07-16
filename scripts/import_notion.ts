/**
 * Comprehensive Notion → Supabase import — the full historical baseline.
 *
 * Pulls EVERY row from the Notion "📅 Daily Log" and maps the complete InBody /
 * nutrition breakdown into Supabase. Notion is a read-only backup; Apple Health /
 * the native iOS app is the source of truth going forward.
 *
 * COLUMN MAP (Notion → Supabase):
 *   Date                          → date (all tables)
 *   Phase                         → nutrition_entries.phase (normalised to cut/maintenance/bulk)
 *   Calories/Carbs g/Fat g/Protein g/Target kcal → nutrition_entries (+ daily_logs macros)
 *   Steps                         → daily_metrics.steps + daily_logs.steps
 *   Sleep h                       → daily_logs.sleep_minutes (× 60)
 *   Weight (kg)                   → body_composition.weight_kg + daily_logs.weight_kg
 *   BMI                           → body_composition.bmi + daily_logs.bmi
 *   Body Fat Percentage (%)       → body_composition.body_fat_pct + daily_logs.body_fat_pct
 *   Muscle Mass (kg)              → body_composition.muscle_mass_kg
 *   Muscle Percentage (%)         → body_composition.muscle_pct + daily_logs.muscle_percent
 *   Body Water Mass (kg)          → body_composition.body_water_mass_kg
 *   Body Water Percentage (%)     → body_composition.water_pct + daily_logs.water_percent
 *   Fat Mass (kg)                 → body_composition.fat_mass_kg
 *   Bone Mineral Content (kg)     → body_composition.bone_mass_kg + daily_logs.bone_mineral
 *   Bone Mineral Percentage (%)   → body_composition.bone_mineral_pct
 *   Protein Mass (kg)             → body_composition.protein_mass_kg
 *   Protein Percentage (%)        → body_composition.protein_pct
 *   Skeletal Muscle Mass (kg)     → body_composition.skeletal_muscle_mass_kg
 *   Fat Free Body Weight (kg)     → body_composition.fat_free_mass_kg + daily_logs.lean_mass_kg
 *   Visceral Fat Rating           → body_composition.visceral_fat + daily_logs.visceral_fat
 *   Basal Metabolic Rate          → body_composition.bmr + daily_logs.bmr
 *   Estimated Waist-to-Hip Ratio  → body_composition.waist_hip_ratio
 *
 * The Notion "Workout/Training" relation is intentionally IGNORED — native
 * workout_sessions / workout_sets stay authoritative.
 *
 * PREREQUISITE: run supabase/migrations/003_extend_body_metrics.sql once in the
 * Supabase SQL editor first (adds the extended body_composition columns), and set
 * NOTION_TOKEN + NOTION_DAILY_LOG_DB_ID in .env.local.
 *
 * RUN:
 *   npx tsx scripts/import_notion.ts            # dry run — prints counts + a sample
 *   npx tsx scripts/import_notion.ts --apply    # writes to Supabase
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NOTION_VERSION = '2022-06-28'

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
const plain = (arr: any[] | undefined): string | null => {
  const s = (arr ?? []).map((t: any) => t.plain_text ?? '').join('').trim()
  return s || null
}

/** Robust numeric extractor — handles number, formula, rollup, and numbers-in-strings. */
function asNum(p: any): number | null {
  if (p == null) return null
  if (typeof p.number === 'number') return p.number
  if (p.formula) {
    if (typeof p.formula.number === 'number') return p.formula.number
    if (typeof p.formula.string === 'string') return parseLoose(p.formula.string)
  }
  if (p.rollup && typeof p.rollup.number === 'number') return p.rollup.number
  const txt = plain(p.rich_text ?? p.title)
  return txt != null ? parseLoose(txt) : null
}
function parseLoose(s: string): number | null {
  const n = parseFloat(String(s).replace(/,/g, '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
function asText(p: any): string | null {
  if (p == null) return null
  if (typeof p.formula?.string === 'string') return p.formula.string.trim() || null
  if (p.select?.name) return p.select.name
  if (p.status?.name) return p.status.name
  return plain(p.rich_text ?? p.title)
}
const round = (v: number | null): number | null => (v == null ? null : Math.round(v))

/** Normalise Notion's Phase label to the app enum; fall back to a calorie band. */
function normPhase(raw: string | null, cal: number | null): string | null {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('cut')) return 'cut'
  if (s.includes('bulk')) return 'bulk'
  if (s.includes('maint')) return 'maintenance'
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
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
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
  const cal = props['Date (for calendar)']?.date?.start
  if (cal) return String(cal).slice(0, 10)
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
  const token = process.env.NOTION_TOKEN
  const dbId = process.env.NOTION_DAILY_LOG_DB_ID
  if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
  if (!token || !dbId) { console.error('Missing NOTION_TOKEN / NOTION_DAILY_LOG_DB_ID in .env.local'); process.exit(1) }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data: u } = await sb.auth.admin.listUsers()
  const uid = u?.users?.[0]?.id
  if (!uid) { console.error('No app user found'); process.exit(1) }

  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — Notion → Supabase full import (user ${uid.slice(0, 8)}…)`)
  const pages = await fetchAllPages(token, dbId)
  console.log(`  fetched ${pages.length} Notion rows`)

  const metricRows: any[] = []
  const bodyRows: any[] = []
  const nutritionRows: any[] = []
  const dailyRows: any[] = []
  let skippedNoDate = 0

  for (const pg of pages) {
    const p = pg.properties ?? {}
    const date = dateOf(p)
    if (!date) { skippedNoDate++; continue }
    const ts = `${date}T12:00:00Z`

    const weight = asNum(p['Weight (kg)'])
    const bmi = asNum(p['BMI'])
    const bodyFat = asNum(p['Body Fat Percentage (%)'])
    const bodyWaterMass = asNum(p['Body Water Mass (kg)'])
    const fatMass = asNum(p['Fat Mass (kg)'])
    const boneContent = asNum(p['Bone Mineral Content (kg)'])
    const boneMineralPct = asNum(p['Bone Mineral Percentage (%)'])
    const proteinMass = asNum(p['Protein Mass (kg)'])
    const proteinPct = asNum(p['Protein Percentage (%)'])
    const muscleMass = asNum(p['Muscle Mass (kg)'])
    const musclePct = asNum(p['Muscle Percentage (%)'])
    const waterPct = asNum(p['Body Water Percentage (%)'])
    const skeletalMuscle = asNum(p['Skeletal Muscle Mass (kg)'])
    const visceral = asNum(p['Visceral Fat Rating'])
    const bmr = asNum(p['Basal Metabolic Rate'])
    const waistHip = asNum(p['Estimated Waist-to-Hip Ratio'])
    const fatFree = asNum(p['Fat Free Body Weight (kg)'])
    const calories = asNum(p['Calories'])
    const carbs = asNum(p['Carbs g'])
    const fat = asNum(p['Fat g'])
    const protein = asNum(p['Protein g'])
    const targetKcal = asNum(p['Target kcal'])
    const steps = asNum(p['Steps'])
    const sleepH = asNum(p['Sleep h'])
    const phase = normPhase(asText(p['Phase']), calories)

    if (steps != null) {
      metricRows.push({ user_id: uid, date, steps: round(steps) })
    }
    if (weight != null) {
      bodyRows.push({
        user_id: uid, hk_uuid: `notion:body:${date}`, date, measured_at: ts,
        weight_kg: weight, body_fat_pct: bodyFat, muscle_mass_kg: muscleMass,
        water_pct: waterPct, bone_mass_kg: boneContent, bmi,
        fat_mass_kg: fatMass, body_water_mass_kg: bodyWaterMass, protein_mass_kg: proteinMass,
        muscle_pct: musclePct, protein_pct: proteinPct, bone_mineral_pct: boneMineralPct,
        skeletal_muscle_mass_kg: skeletalMuscle, fat_free_mass_kg: fatFree,
        waist_hip_ratio: waistHip, visceral_fat: visceral, bmr,
      })
    }
    if (calories != null || protein != null || carbs != null || fat != null) {
      nutritionRows.push({
        user_id: uid, hk_uuid: `notion:nutrition:${date}`, date, logged_at: ts, meal_type: 'daily',
        calories: calories ?? 0, protein_g: protein ?? 0, carbs_g: carbs ?? 0, fat_g: fat ?? 0,
        target_kcal: round(targetKcal), phase,
      })
    }
    // daily_logs — consistent shape (the Nexus/dashboard aggregation).
    dailyRows.push({
      user_id: uid, date,
      weight_kg: weight, carbs_g: carbs, protein_g: protein, fats_g: fat,
      steps: round(steps), sleep_minutes: sleepH != null ? Math.round(sleepH * 60) : null,
      bmi, body_fat_pct: bodyFat, lean_mass_kg: fatFree,
      muscle_percent: musclePct, water_percent: waterPct, bone_mineral: boneContent,
      visceral_fat: visceral, bmr,
    })
  }

  console.log(`  → daily_metrics ${metricRows.length} · body_composition ${bodyRows.length} · nutrition_entries ${nutritionRows.length} · daily_logs ${dailyRows.length}`)
  if (skippedNoDate) console.log(`  → skipped ${skippedNoDate} rows without a date`)

  if (!apply) {
    if (bodyRows[0]) console.log('  sample body_composition:', JSON.stringify(bodyRows[0]))
    console.log('\n⚠  Run supabase/migrations/003_extend_body_metrics.sql once first (adds the extended columns).')
    console.log('Re-run with --apply to write.')
    return
  }

  for (const c of chunk(metricRows, 200)) {
    const { error } = await sb.from('daily_metrics').upsert(c as never[], { onConflict: 'user_id,date' })
    if (error) console.error('  ✗ daily_metrics:', error.message)
  }
  for (const c of chunk(bodyRows, 200)) {
    const { error } = await sb.from('body_composition').upsert(c as never[], { onConflict: 'hk_uuid' })
    if (error) console.error('  ✗ body_composition:', error.message)
  }
  for (const c of chunk(nutritionRows, 200)) {
    const { error } = await sb.from('nutrition_entries').upsert(c as never[], { onConflict: 'hk_uuid' })
    if (error) console.error('  ✗ nutrition_entries:', error.message)
  }
  for (const c of chunk(dailyRows, 200)) {
    const { error } = await sb.from('daily_logs').upsert(c as never[], { onConflict: 'user_id,date' })
    if (error) console.error('  ✗ daily_logs:', error.message)
  }
  console.log('✓ Import complete.')
}

main().catch((e) => { console.error('import_notion failed:', e); process.exit(1) })
