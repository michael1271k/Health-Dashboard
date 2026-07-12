/**
 * Enforce the global weight-validity rule (≥ 50 kg) in the DB.
 *   daily_logs.weight_kg < 50        → set NULL (keep the row's other metrics)
 *   body_composition.weight_kg < 50  → DELETE the row (weight is its primary key metric)
 *   npx tsx scripts/purge_bad_weights.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIN = 50

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
  if (!url || !key) { console.error('Missing Supabase env'); process.exit(1) }
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data: u } = await sb.auth.admin.listUsers()
  const uid = u?.users?.[0]?.id
  if (!uid) { console.error('No app user'); process.exit(1) }

  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — purge body weights < ${MIN} kg`)

  const { data: dl } = await sb.from('daily_logs').select('date, weight_kg').eq('user_id', uid).not('weight_kg', 'is', null).lt('weight_kg', MIN)
  console.log(`  daily_logs (→ NULL):        ${dl?.length ?? 0}`, (dl ?? []).map((r: { date: string; weight_kg: number }) => `${r.date}:${r.weight_kg}kg`).join(' '))
  if (apply && dl?.length) {
    const { error } = await sb.from('daily_logs').update({ weight_kg: null } as never).eq('user_id', uid).lt('weight_kg', MIN)
    if (error) console.error('  ✗ daily_logs:', error.message)
  }

  const { data: bc } = await sb.from('body_composition').select('date, weight_kg').eq('user_id', uid).lt('weight_kg', MIN)
  console.log(`  body_composition (→ DELETE): ${bc?.length ?? 0}`, (bc ?? []).map((r: { date: string; weight_kg: number }) => `${r.date}:${r.weight_kg}kg`).join(' '))
  if (apply && bc?.length) {
    const { error } = await sb.from('body_composition').delete().eq('user_id', uid).lt('weight_kg', MIN)
    if (error) console.error('  ✗ body_composition:', error.message)
  }

  console.log(apply ? '✓ Purge complete.' : '\nRe-run with --apply to execute.')
}

main().catch((e) => { console.error('purge_bad_weights failed:', e); process.exit(1) })
