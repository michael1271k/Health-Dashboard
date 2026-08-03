/**
 * One-shot: null out `workout_sets.est_1rm_kg` on UNLOADED sets.
 *
 * `epley1RM` returned `weight × (1 + reps/30)` unconditionally, which is exactly
 * 0 for every bodyweight set, and 0 was written to the column as though it were
 * an estimate. It is not — a movement with no external load has no one-rep max
 * to estimate — and the app printed it: "1RM 0" beside every Reverse Crunch and
 * Hanging Knee Raise row in the session report, a flat zero series on the PR
 * history chart, and a per-session trend of 0 → 0 that made real rep progress
 * look like nothing happening.
 *
 * The formula now returns null at 0 kg (`src/lib/utils/epley.ts`), so new rows
 * are correct. This fixes the ones already written. Idempotent: re-running it
 * finds nothing, because a null is not 0.
 *
 *   node scripts/repair-bodyweight-e1rm.mjs --dry-run
 *   node scripts/repair-bodyweight-e1rm.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const DRY = process.argv.includes('--dry-run')

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: rows, error } = await db
  .from('workout_sets')
  .select('id, weight_kg, reps, est_1rm_kg, exercises!inner(name)')
  .lte('weight_kg', 0)
  .not('est_1rm_kg', 'is', null)
if (error) throw error

const byName = new Map()
for (const r of rows) byName.set(r.exercises.name, (byName.get(r.exercises.name) ?? 0) + 1)

console.log(`${rows.length} unloaded sets carry a stored est_1rm_kg${DRY ? ' · DRY RUN' : ''}`)
for (const [name, n] of byName) console.log(`  ${name.padEnd(28)} ${n}`)

if (!rows.length) { console.log('\nNothing to repair.'); process.exit(0) }
if (DRY) { console.log('\nDry run — nothing written.'); process.exit(0) }

let done = 0
for (const r of rows) {
  const { error: uErr } = await db.from('workout_sets').update({ est_1rm_kg: null }).eq('id', r.id)
  if (uErr) throw uErr
  done += 1
}
console.log(`\n${done} rows set to NULL. Done.`)
