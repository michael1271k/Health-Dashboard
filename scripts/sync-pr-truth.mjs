#!/usr/bin/env node
/**
 * Reconcile `personal_records` with the asserted all-time book in prTruth.ts.
 *
 * WHY THIS EXISTS
 * `backfill-prs.mjs` can only file records it can derive from `workout_sets`,
 * and 75 of 94 sessions — every one from March through June 2026 — carry zero
 * sets. So the derived ledger tops out at whatever Helix happened to witness
 * after 2026-07-16: Calf Press at 70 kg when the real best is 72.5, Leg Press
 * at 72.5 when it is 80, and so on across ten exercises.
 *
 * Flooring the BASELINES (prTruth.ts) stops those coming back as false PRs.
 * This script fixes the other half — what the record book DISPLAYS — by writing
 * the asserted values as standing rows.
 *
 * Asserted rows carry `session_id = null`, which is what marks them as not
 * derived from any session. `backfill-prs.mjs` knows to keep them: its prune
 * deletes anything the replay did not emit, which would otherwise wipe this
 * entire book on the next run.
 *
 * IDEMPOTENT. Values come from a committed constant and are upserted on the
 * natural key (user_id, exercise_key, axis); running it twice writes the same
 * rows. It only ever raises a value — an existing row at or above the asserted
 * figure is left alone, because a real logged record beats an asserted one.
 *
 *   node scripts/sync-pr-truth.mjs --dry-run    # print the diff, write nothing
 *   node scripts/sync-pr-truth.mjs              # apply
 *
 * Run AFTER backfill-prs.mjs. Either order converges (the backfill defers to
 * this book rather than overwriting it), but the backfill prunes, so running it
 * second means one extra pass to re-establish rows this one just wrote.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Service-role: bypasses RLS, so it must never run in the browser bundle.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const DRY = process.argv.includes('--dry-run')

// ── env ──────────────────────────────────────────────────────────────────────
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

// ── the book, compiled on the fly ────────────────────────────────────────────
const jiti = createJiti(import.meta.url, {
  alias: { '@': new URL('../src', import.meta.url).pathname },
})
// PR_TRUTH VERBATIM, not `prFloorFor`. The two answer different questions: the
// floor is what DETECTION may not treat as new (netted against what Helix has
// already logged, so it never erases a record set inside its own window), while
// the ledger is what the record book DISPLAYS — which is the user's number, in
// full, whether or not Helix can derive it.
const { PR_TRUTH, PR_TRUTH_AS_OF, truthAxisValue } = await jiti.import('../src/lib/training/prTruth.ts')

/** Axes a record can stand on. `reps` covers unloaded reps and timed seconds. */
const AXES = ['weight', 'reps', 'volume', 'e1rm', 'sessionVolume']

// ── who ──────────────────────────────────────────────────────────────────────
// Scoped by user_id throughout: the natural key includes it, and a single-user
// database is exactly where a missing scope goes unnoticed until it isn't one.
const { data: owners, error: oErr } = await db
  .from('workout_sessions').select('user_id').limit(1000)
if (oErr) throw oErr
const userIds = [...new Set((owners ?? []).map((r) => r.user_id))]
if (userIds.length !== 1) {
  console.error(`Expected exactly one user in workout_sessions, found ${userIds.length}. Refusing to guess.`)
  process.exit(1)
}
const userId = userIds[0]

// ── preflight ────────────────────────────────────────────────────────────────
const { data: existingRows, error: eErr } = await db
  .from('personal_records')
  .select('exercise_key, axis, value, reps, weight_kg, session_id, achieved_on')
  .eq('user_id', userId)
if (eErr) throw eErr

const current = new Map((existingRows ?? []).map((r) => [`${r.exercise_key}|${r.axis}`, r]))

const writes = []
const unchanged = []
const beaten = []

for (const [name, rec] of Object.entries(PR_TRUTH)) {
  for (const axis of AXES) {
    const asserted = truthAxisValue(rec, axis)
    if (asserted == null) continue

    // The load and reps that made the record, where the book knows them. The
    // ledger renders these beside the value, and `useSessionDetail` matches a
    // record to its set by (weight, reps) — so a wrong pair is worse than none.
    let weightKg = null
    let reps = null
    if (axis === 'weight') weightKg = rec.weight ?? null
    if (axis === 'volume' && rec.setVolume) { weightKg = rec.setVolume.kg; reps = rec.setVolume.reps }
    if (axis === 'reps') { weightKg = 0; reps = rec.seconds ?? rec.reps ?? null }

    const held = current.get(`${name}|${axis}`)
    const heldValue = held ? Number(held.value) : null

    if (heldValue != null && heldValue >= asserted) {
      // A genuinely logged record at or above the asserted figure wins. In
      // practice this is almost all 1RM: Hevy's estimator is not Epley, so on a
      // handful of lifts Helix's own arithmetic on a real set lands slightly
      // higher than the book (Calf Press 101.3 vs 100.75). The derived number
      // beats the imported one — it is attached to a set that exists.
      ;(heldValue > asserted ? beaten : unchanged).push({ name, axis, asserted, heldValue })
      continue
    }
    writes.push({
      user_id: userId, exercise_key: name, axis,
      value: Math.round(asserted * 100) / 100,
      reps, weight_kg: weightKg,
      // NULL marks the row as asserted, not derived. backfill-prs.mjs reads
      // this to decide the row survives its prune.
      session_id: null,
      achieved_on: PR_TRUTH_AS_OF,
    })
  }
}

console.log(`user ${userId}`)
console.log(`${Object.keys(PR_TRUTH).length} exercises in the book · ${existingRows?.length ?? 0} ledger rows today`)
console.log(`${writes.length} to write · ${unchanged.length} already exact · ${beaten.length} already beaten by a logged record${DRY ? ' · DRY RUN' : ''}\n`)

if (writes.length) {
  console.log('WRITE')
  for (const w of writes) {
    const held = current.get(`${w.exercise_key}|${w.axis}`)
    const from = held ? Number(held.value) : null
    console.log(`  ${w.exercise_key.padEnd(36)} ${w.axis.padEnd(14)} ${from == null ? '(none)' : from} → ${w.value}`)
  }
}
if (beaten.length) {
  console.log('\nKEEP — a derived record already beats the book (mostly 1RM: Hevy is not Epley)')
  for (const b of beaten) {
    console.log(`  ${b.name.padEnd(36)} ${b.axis.padEnd(14)} book ${b.asserted} < logged ${b.heldValue}`)
  }
}

if (DRY) { console.log('\nDry run — nothing written.'); process.exit(0) }

for (const row of writes) {
  const { error } = await db.from('personal_records').upsert(row, { onConflict: 'user_id,exercise_key,axis' })
  if (error) throw error
}

// ── verify ───────────────────────────────────────────────────────────────────
// Re-read rather than trust the writes: the whole point of this script is that
// the ledger and the book agree, so prove it rather than assert it.
const { data: after, error: aErr } = await db
  .from('personal_records').select('exercise_key, axis, value').eq('user_id', userId)
if (aErr) throw aErr
const post = new Map((after ?? []).map((r) => [`${r.exercise_key}|${r.axis}`, Number(r.value)]))
let short = 0
for (const [name, rec] of Object.entries(PR_TRUTH)) {
  for (const axis of AXES) {
    const asserted = truthAxisValue(rec, axis)
    if (asserted == null) continue
    const got = post.get(`${name}|${axis}`)
    if (got == null || got < asserted) {
      console.error(`  SHORT  ${name} ${axis}: ledger ${got ?? '(missing)'} < asserted ${asserted}`)
      short += 1
    }
  }
}
if (short) { console.error(`\n${short} rows did not reach the asserted value.`); process.exit(1) }

console.log(`\n${writes.length} rows written · ledger now meets the book on every axis.`)
console.log('Done.')
