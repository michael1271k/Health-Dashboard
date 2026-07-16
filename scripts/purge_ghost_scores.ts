/**
 * Purge "ghost" daily_scores rows — score-only days with zero underlying data.
 *
 * The compute-score backfill sweep used to score past days from trailing
 * baselines even when the day itself had no data (vacation days Jul 9/12/13/14
 * being the canonical case). A ghost is a daily_scores row whose date has no
 * row in ANY source table the scorer reads: daily_logs, daily_metrics,
 * nutrition_entries (meal_type='daily'), workout_sessions, sleep_sessions,
 * water_intake, supplements.
 *
 *   npx tsx scripts/purge_ghost_scores.ts                       # dry run
 *   npx tsx scripts/purge_ghost_scores.ts --apply               # delete ghosts
 *   npx tsx scripts/purge_ghost_scores.ts --from=2026-06-21 --to=2026-07-14
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

function argValue(flag: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`))
  const v = hit?.split('=')[1]
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { console.error(`--${flag} must be YYYY-MM-DD`); process.exit(1) }
  return v ?? fallback
}

async function main() {
  loadEnvLocal()
  const apply = process.argv.includes('--apply')
  const from = argValue('from', '2026-06-21')
  const to = argValue('to', '2026-07-14')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data: u } = await sb.auth.admin.listUsers()
  const uid = u?.users?.[0]?.id
  if (!uid) { console.error('No app user found'); process.exit(1) }

  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — ghost daily_scores sweep ${from} → ${to} for ${uid.slice(0, 8)}…`)

  const { data: scoreRows, error } = await sb
    .from('daily_scores').select('date, score')
    .eq('user_id', uid).gte('date', from).lte('date', to).order('date')
  if (error) { console.error(`daily_scores query failed: ${error.message}`); process.exit(1) }
  const candidates = (scoreRows ?? []) as Array<{ date: string; score: number | null }>
  if (!candidates.length) { console.log('No daily_scores rows in range — nothing to do.'); return }

  const ghosts: string[] = []
  for (const { date, score } of candidates) {
    const end = new Date(`${date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1)
    const endISO = end.toISOString().slice(0, 10)
    const [logs, metrics, nutrition, sessions, sleep, water, supps] = await Promise.all([
      sb.from('daily_logs').select('date', { count: 'exact', head: true }).eq('user_id', uid).eq('date', date),
      sb.from('daily_metrics').select('date', { count: 'exact', head: true }).eq('user_id', uid).eq('date', date),
      sb.from('nutrition_entries').select('date', { count: 'exact', head: true }).eq('user_id', uid).eq('date', date).eq('meal_type', 'daily'),
      sb.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('user_id', uid)
        .gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${endISO}T00:00:00Z`),
      sb.from('sleep_sessions').select('id', { count: 'exact', head: true }).eq('user_id', uid)
        .gte('start_time', `${date}T00:00:00Z`).lt('start_time', `${endISO}T00:00:00Z`),
      sb.from('water_intake').select('date', { count: 'exact', head: true }).eq('user_id', uid).eq('date', date),
      sb.from('supplements').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('date', date),
    ])
    const counts = [logs, metrics, nutrition, sessions, sleep, water, supps].map((r) => r.count ?? 0)
    const total = counts.reduce((a, b) => a + b, 0)
    if (total === 0) {
      ghosts.push(date)
      console.log(`  👻 ${date} — score ${score ?? '—'} with ZERO underlying rows → ghost`)
    } else {
      console.log(`  ✓ ${date} — has real data (${total} source rows), kept`)
    }
  }

  if (!ghosts.length) { console.log('No ghosts found.'); return }
  if (!apply) { console.log(`\n${ghosts.length} ghost(s): ${ghosts.join(', ')}\nRe-run with --apply to delete.`); return }

  const { error: delErr } = await sb.from('daily_scores').delete().eq('user_id', uid).in('date', ghosts)
  if (delErr) { console.error(`✗ delete failed: ${delErr.message}`); process.exit(1) }
  console.log(`✓ Deleted ${ghosts.length} ghost daily_scores row(s): ${ghosts.join(', ')}`)
}

main().catch((e) => { console.error('purge_ghost_scores failed:', e); process.exit(1) })
