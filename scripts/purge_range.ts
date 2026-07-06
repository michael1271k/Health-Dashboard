/**
 * Delete all tracked data in a date window (inclusive) for the app user.
 * Phase 12: wipe the Thailand vacation window 2026-06-27 … 2026-07-04.
 *   npx tsx scripts/purge_range.ts            # dry run (counts only)
 *   npx tsx scripts/purge_range.ts --apply    # actually delete
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FROM = '2026-06-27'
const TO = '2026-07-06'      // Phase 13: extended vacation window
const END_EXCL = '2026-07-07' // exclusive upper bound for timestamp columns

function loadEnvLocal() {
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  } catch { /* ignore */ }
}

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

  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — purge ${FROM} … ${TO}`)

  const dateTables = ['daily_logs', 'nutrition_entries', 'body_composition', 'daily_metrics', 'daily_scores', 'water_intake', 'supplement_log']
  for (const t of dateTables) {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('date', FROM).lte('date', TO)
    console.log(`  ${t.padEnd(20)} ${count ?? 0}`)
    if (apply) {
      const { error } = await sb.from(t).delete().eq('user_id', uid).gte('date', FROM).lte('date', TO)
      if (error) console.error(`  ✗ ${t}: ${error.message}`)
    }
  }

  // Timestamp-keyed tables (workout_sets cascade from workout_sessions).
  const tsTables: Array<[string, string]> = [['sleep_sessions', 'start_time'], ['workout_sessions', 'started_at']]
  for (const [t, col] of tsTables) {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('user_id', uid).gte(col, `${FROM}T00:00:00Z`).lt(col, `${END_EXCL}T00:00:00Z`)
    console.log(`  ${t.padEnd(20)} ${count ?? 0}`)
    if (apply) {
      const { error } = await sb.from(t).delete().eq('user_id', uid).gte(col, `${FROM}T00:00:00Z`).lt(col, `${END_EXCL}T00:00:00Z`)
      if (error) console.error(`  ✗ ${t}: ${error.message}`)
    }
  }

  console.log(apply ? '✓ Purge complete.' : '\nRe-run with --apply to delete.')
}

main().catch((e) => { console.error('purge_range failed:', e); process.exit(1) })
