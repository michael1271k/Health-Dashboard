#!/usr/bin/env node
/**
 * Raise `workout_sessions.pr_count` to match the records actually filed against
 * each session — and NEVER lower it.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * 2026-08-27 (Upper B) stored `pr_count = 8` while `personal_records` held NINE
 * rows pointing at that session: a Single Arm Triceps Pushdown record was filed
 * after the fact and the session's own tally never heard about it. Every surface
 * that counts records for a day reads the session column, so the app said 8
 * where the record book said 9.
 *
 * ── WHY IT ONLY EVER RAISES ─────────────────────────────────────────────────
 * This is the important half, and it is the reason this is a script rather than
 * a one-line `UPDATE ... = count(*)`.
 *
 * `personal_records` is a CURRENT-BEST table: one row per (exercise, axis),
 * upserted, carrying the `session_id` that holds the record RIGHT NOW. A session
 * that set seven records in July and has since been beaten on four of them
 * therefore has three rows attributed to it today — and 7 is still the true
 * answer to "how many records did that workout set", which is what `pr_count`
 * means (see `pr-count-semantics`). Recomputing it from the join would rewrite
 * every historical session downward and quietly delete the record book's
 * history: 2026-08-20 would fall from 7 to 3, 2026-07-21 from 9 to 4.
 *
 * So `stored > actual` is the NORMAL state and is left alone. Only `stored <
 * actual` is impossible-by-construction — a session cannot currently hold more
 * records than it ever set — and that is the drift this repairs.
 *
 *   node scripts/reconcile-pr-counts.mjs --dry-run   # print the diff, write nothing
 *   node scripts/reconcile-pr-counts.mjs             # apply
 *
 * IDEMPOTENT: a second run finds nothing to do.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Service-role: bypasses RLS, so it must never run in the browser bundle.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry-run')

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: prs, error: prErr } = await db
  .from('personal_records')
  .select('session_id')
  .not('session_id', 'is', null)
if (prErr) { console.error(prErr.message); process.exit(1) }

const attributed = new Map()
for (const r of prs ?? []) attributed.set(r.session_id, (attributed.get(r.session_id) ?? 0) + 1)

const { data: sessions, error: sErr } = await db
  .from('workout_sessions')
  .select('id, started_at, day_key, pr_count')
  .order('started_at', { ascending: false })
if (sErr) { console.error(sErr.message); process.exit(1) }

const behind = (sessions ?? [])
  .map((s) => ({ ...s, actual: attributed.get(s.id) ?? 0 }))
  .filter((s) => (s.pr_count ?? 0) < s.actual)

if (behind.length === 0) {
  console.log('Every session\'s pr_count is at or above the records filed against it — nothing to do.')
  process.exit(0)
}

for (const s of behind) {
  console.log(`${s.started_at.slice(0, 10)}  ${(s.day_key ?? '—').padEnd(8)}  ${s.pr_count ?? 0} → ${s.actual}`)
}
if (DRY) { console.log(`\n--dry-run: ${behind.length} session(s) would be raised.`); process.exit(0) }

for (const s of behind) {
  const { error } = await db.from('workout_sessions').update({ pr_count: s.actual }).eq('id', s.id)
  if (error) { console.error(`${s.id}: ${error.message}`); process.exit(1) }
}
console.log(`\nRaised ${behind.length} session(s).`)
