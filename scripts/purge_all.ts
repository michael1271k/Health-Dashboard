/**
 * Total health-metrics wipe — an absolute blank slate for the Notion baseline.
 *
 * DELETES every row for the app user from the pure health-metric tables:
 *   daily_metrics · nutrition_entries · body_composition · water_intake ·
 *   daily_scores · sleep_sessions
 * and NULLs the metric columns on daily_logs.
 *
 * PRESERVES (never touched):
 *   • workout_sessions + workout_sets   (native training records)
 *   • daily_logs.journal_md / effort_rating / mood   (your journals)
 *   • supplement_log · reports
 *
 * Note: this also clears Apple-Health-only fields on daily_logs (HRV, VO₂max,
 * etc.) that are NOT in Notion — by design, Notion becomes the historical
 * baseline and the native app re-syncs Apple Health going forward.
 *
 *   npx tsx scripts/purge_all.ts            # dry run — counts only
 *   npx tsx scripts/purge_all.ts --apply    # actually wipe
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  } catch { /* ignore */ }
}

// Pure health-metric tables — wiped entirely (all rows for the user).
const WIPE_TABLES = [
  'daily_metrics', 'nutrition_entries', 'body_composition',
  'water_intake', 'daily_scores', 'sleep_sessions',
]

// daily_logs metric columns to NULL (journal_md / effort_rating / mood are preserved).
const DAILY_LOG_METRIC_COLS = [
  'steps', 'water_ml', 'sleep_minutes', 'carbs_g', 'protein_g', 'fats_g',
  'weight_kg', 'lean_mass_kg', 'bmi', 'training_minutes', 'active_energy', 'body_fat_pct',
  'standing_minutes', 'avg_heart_rate', 'avg_rest_heart_rate', 'respiratory_rate', 'blood_oxygen',
  'muscle_percent', 'water_percent', 'bone_mineral', 'visceral_fat', 'bmr',
  'hrv_ms', 'exercise_minutes', 'stand_hours', 'vo2max',
  'wrist_temp_delta', 'time_in_daylight_min', 'heart_rate_recovery',
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

  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — TOTAL health-metrics wipe (workouts + journals preserved)`)

  for (const t of WIPE_TABLES) {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('user_id', uid)
    console.log(`  ${t.padEnd(20)} ${count ?? 0} rows`)
    if (apply) {
      const { error } = await sb.from(t).delete().eq('user_id', uid)
      if (error) console.error(`  ✗ ${t}: ${error.message}`)
    }
  }

  const { count: dlCount } = await sb.from('daily_logs').select('*', { count: 'exact', head: true }).eq('user_id', uid)
  console.log(`  daily_logs           ${dlCount ?? 0} rows → metric columns NULLed (journal/effort/mood kept)`)
  if (apply) {
    const nullPatch = Object.fromEntries(DAILY_LOG_METRIC_COLS.map((c) => [c, null]))
    const { error } = await sb.from('daily_logs').update(nullPatch as never).eq('user_id', uid)
    if (error) console.error(`  ✗ daily_logs: ${error.message}`)
  }

  console.log(apply ? '✓ Wipe complete — ready for the Notion import.' : '\nRe-run with --apply to wipe.')
}

main().catch((e) => { console.error('purge_all failed:', e); process.exit(1) })
