/**
 * Inject the Jul 15 2026 baseline — Helix Cut 5.1 Day 1 (a Wednesday REST day).
 *
 * Idempotent upserts across nutrition_entries, body_composition, daily_metrics,
 * daily_logs (journal/effort/mood preserved), supplement_log, and user_goals.
 * Requires supabase/migrations/003_extend_body_metrics.sql to be applied first
 * (extended body_composition columns).
 *
 *   npx tsx scripts/inject_july15.ts            # dry run — prints the rows
 *   npx tsx scripts/inject_july15.ts --apply    # writes to Supabase
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DATE = '2026-07-15'
const TS = `${DATE}T20:00:00Z`

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
// Standard daily supplements taken on a REST day — caffeine + citrulline (the
// training-only pre-workout stimulants) are intentionally excluded.
const SUPPLEMENTS: Array<{ key: string; time: string }> = [
  { key: 'multivitamin', time: '10:30' }, { key: 'd3k2', time: '10:30' },
  { key: 'creatine', time: '15:00' }, { key: 'omega3', time: '15:00' },
  { key: 'magnesium', time: '22:00' }, { key: 'glycine', time: '22:00' }, { key: 'theanine', time: '22:00' },
]

async function main() {
  loadEnvLocal()
  const apply = process.argv.includes('--apply')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data: u } = await sb.auth.admin.listUsers()
  const uid = u?.users?.[0]?.id
  if (!uid) { console.error('No app user found'); process.exit(1) }

  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — inject ${DATE} baseline (Helix Cut 5.1 Day 1 · REST) for ${uid.slice(0, 8)}…`)

  const nutrition = {
    user_id: uid, hk_uuid: `manual:nutrition:${DATE}`, date: DATE, logged_at: TS, meal_type: 'daily',
    calories: 1921, protein_g: 170, carbs_g: 195, fat_g: 52, target_kcal: 1955, phase: 'cut',
  }
  const body = {
    user_id: uid, hk_uuid: `manual:body:${DATE}`, date: DATE, measured_at: TS,
    weight_kg: 65.7, bmi: 22.7, body_fat_pct: 18, muscle_mass_kg: 51.1, water_pct: 57.5, bone_mass_kg: 2.8,
    fat_mass_kg: 11.8, body_water_mass_kg: 37.8, protein_mass_kg: 12.7, muscle_pct: 77.8, protein_pct: 19.3,
    bone_mineral_pct: 4.3, skeletal_muscle_mass_kg: 27.3, fat_free_mass_kg: 53.9, waist_hip_ratio: 0.9,
    visceral_fat: 6, bmr: 1534,
  }
  const metrics = { user_id: uid, date: DATE, steps: 6350 }
  const dailyLog = {
    user_id: uid, date: DATE,
    weight_kg: 65.7, carbs_g: 195, protein_g: 170, fats_g: 52,
    steps: 6350, sleep_minutes: 195, water_ml: 1500,
    bmi: 22.7, body_fat_pct: 18, lean_mass_kg: 53.9,
    muscle_percent: 77.8, water_percent: 57.5, bone_mineral: 2.8, visceral_fat: 6, bmr: 1534,
  }
  const supps = SUPPLEMENTS.map((s) => ({
    user_id: uid, date: DATE, item_key: s.key, taken: true, taken_at: `${DATE}T${s.time}:00Z`,
  }))
  const goals = { user_id: uid, calorie_goal: 1955, protein_goal_g: 170, carbs_goal_g: 195, fat_goal_g: 55 }

  console.log('  nutrition_entries: 1921 kcal · 170P/195C/52F · target 1955')
  console.log('  body_composition : 65.7 kg · 18% BF · 51.1 kg muscle · BMR 1534')
  console.log('  daily_logs       : steps 6350 · sleep 195m (3.25h) · water 1500ml (journal preserved)')
  console.log(`  supplement_log   : ${supps.map((s) => s.item_key).join(', ')} (NO caffeine/citrulline — rest day)`)
  console.log('  user_goals       : 1955 / 170P / 195C / 55F')

  if (!apply) { console.log('\nRe-run with --apply to write.'); return }

  const w = async (label: string, p: PromiseLike<{ error: any }>) => { const { error } = await p; if (error) console.error(`  ✗ ${label}: ${error.message}`); else console.log(`  ✓ ${label}`) }
  await w('nutrition_entries', sb.from('nutrition_entries').upsert(nutrition as never, { onConflict: 'hk_uuid' }))
  await w('body_composition', sb.from('body_composition').upsert(body as never, { onConflict: 'hk_uuid' }))
  await w('daily_metrics', sb.from('daily_metrics').upsert(metrics as never, { onConflict: 'user_id,date' }))
  await w('daily_logs', sb.from('daily_logs').upsert(dailyLog as never, { onConflict: 'user_id,date' }))
  await w('supplement_log', sb.from('supplement_log').upsert(supps as never, { onConflict: 'user_id,date,item_key' }))
  await w('user_goals', sb.from('user_goals').upsert(goals as never, { onConflict: 'user_id' }))
  console.log('✓ Injection complete.')
}

main().catch((e) => { console.error('inject_july15 failed:', e); process.exit(1) })
