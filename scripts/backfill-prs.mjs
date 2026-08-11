#!/usr/bin/env node
/**
 * Recompute personal records for every logged session, chronologically.
 *
 * WHY THIS EXISTS
 * PR detection used to be disabled outright during "re-entry" weeks
 * (2026-07-19 → 08-01, ~90% loads). That silently ate real records: the July 31
 * Legs & Core B session logged Hip Thrust 27.5kg × 13 and a 58 s Side Plank —
 * both genuine all-time bests — and saved with pr_count = 0, every is_pr false,
 * and nothing in personal_records. The gate now lives on the *coaching* side
 * only; this script repairs the history it already cost us.
 *
 * It is idempotent: it replays every session in order against the same
 * `prEngine` the app uses, so running it twice produces the same result.
 *
 *   node scripts/backfill-prs.mjs --dry-run     # print the diff, write nothing
 *   node scripts/backfill-prs.mjs               # apply
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

// ── the engine, compiled on the fly ──────────────────────────────────────────
// Importing the REAL TS module (rather than reimplementing the rules here) is
// the whole point: a backfill that disagrees with the app is worse than none.
// jiti ships with Next.js, so this needs no extra dependency; the alias mirrors
// the `@/*` path in tsconfig.
const jiti = createJiti(import.meta.url, {
  alias: { '@': new URL('../src', import.meta.url).pathname },
})
const { buildBaselines, detectSessionPrs, recordSets } = await jiti.import('../src/lib/training/prEngine.ts')
const { isTimedExercise } = await jiti.import('../src/lib/exercises/timed.ts')
const { repWindowFor } = await jiti.import('../src/lib/training/ceilings.ts')
const { prFloorFor } = await jiti.import('../src/lib/training/prTruth.ts')
const { canonicalExerciseName } = await jiti.import('../src/lib/exercises/aliases.ts')

// ── load everything, once ────────────────────────────────────────────────────
const { data: sessions, error: sErr } = await db
  .from('workout_sessions')
  .select('id, user_id, started_at, day_key, pr_count')
  .order('started_at', { ascending: true })
if (sErr) throw sErr

const { data: sets, error: setErr } = await db
  .from('workout_sets')
  .select('id, session_id, user_id, exercise_id, set_number, exercise_order, weight_kg, reps, set_type, side, pair_id, is_pr, exercises(name)')
  .order('session_id')
if (setErr) throw setErr

const bySession = new Map()
for (const r of sets) {
  const list = bySession.get(r.session_id) ?? []
  list.push(r)
  bySession.set(r.session_id, list)
}

console.log(`${sessions.length} sessions · ${sets.length} sets${DRY ? ' · DRY RUN' : ''}\n`)

// PREFLIGHT — the reads must be COMPLETE, because an incomplete one deletes.
// PostgREST truncates at a max-rows cap with no error and no flag, and a
// truncated `sets` read means later sessions never enter the replay, never
// enter `keep`, and their ledger rows are pruned as superseded. A silent read
// failure would therefore present as data loss.
const PGRST_CAP = 1000
if (!sessions.length || !sets.length) { console.error('Empty read — refusing to run.'); process.exit(1) }
for (const [label, n] of [['sessions', sessions.length], ['sets', sets.length]]) {
  if (n % PGRST_CAP === 0) {
    console.error(`${label} came back at exactly ${n} — that is the PostgREST page cap, so the read is truncated. Refusing to run.`)
    process.exit(1)
  }
}

// ── replay chronologically ───────────────────────────────────────────────────
/** Every set seen so far, in the shape buildBaselines wants. Keyed by name so
 *  the ledger's exercise_key (also a name) lines up. */
const dateStrOf = (s) => s.started_at.slice(0, 10)
const seen = []
const setUpdates = []       // { id, is_pr }
const sessionUpdates = []   // { id, pr_count }
const ledger = []
let flipped = 0

for (const s of sessions) {
  const rows = (bySession.get(s.id) ?? []).slice().sort(
    (a, b) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0) || (a.set_number ?? 0) - (b.set_number ?? 0),
  )
  if (!rows.length) continue

  // The asserted floor, same as the app. Without it the replay reproduces the
  // very false positives it is meant to clear: sets only exist from 2026-07-16,
  // so a return to a pre-July load looks like a first-ever best. See prTruth.ts.
  const baselines = buildBaselines(seen, isTimedExercise, (k) => prFloorFor(canonicalExerciseName(k)))
  const dateStr = dateStrOf(s)
  const unnamed = rows.filter((r) => !r.exercises?.name)
  if (unnamed.length) {
    console.error(`${dateStrOf(s)} — ${unnamed.length} set(s) with no exercise name. Refusing to guess a key.`)
    process.exit(1)
  }
  const candidates = rows.map((r) => {
    // Canonicalised, matching `save.ts` — the ledger key is a canonical NAME.
    // Keying raw here while the app keys canonical would file two rows for one
    // lift the day an alias acquires a set, and the orphan is unprunable.
    const name = canonicalExerciseName(r.exercises?.name ?? '')
    // Same window the app resolves, so the e1RM axis is gated identically.
    const win = repWindowFor(name, s.day_key ?? undefined)
    return {
      key: name,
      weightKg: r.weight_kg ?? 0,
      reps: r.reps ?? 0,
      setType: r.set_type ?? null,
      timed: isTimedExercise(name),
      repFloor: win?.floor ?? null,
      // Unilateral pairs collapse to one tonnage for the volume axis.
      side: r.side ?? null,
      pairId: r.pair_id ?? null,
      date: dateStr,
      exerciseName: name,
      setNumber: r.set_number ?? null,
    }
  })
  const result = detectSessionPrs(candidates, baselines)
  const changed = []
  result.perSet.forEach((d, i) => {
    const want = d.axes.length > 0
    if (want !== !!rows[i].is_pr) {
      setUpdates.push({ id: rows[i].id, is_pr: want })
      changed.push(`${candidates[i].key} set ${rows[i].set_number} ${candidates[i].weightKg}kg × ${candidates[i].reps} → ${want ? d.axes.join('+') : 'not a PR'}`)
      flipped += 1
    }
  })
  if ((s.pr_count ?? 0) !== result.prCount) {
    sessionUpdates.push({ id: s.id, pr_count: result.prCount })
  }

  // Ledger rows: the set that WON each axis (same helper the app uses).
  const records = recordSets(candidates, result)
  for (const [name, axes] of result.axesByKey) {
    const byAxis = records.get(name)
    for (const axis of axes) {
      const rec = byAxis?.get(axis)
      ledger.push({
        user_id: s.user_id, exercise_key: name, axis,
        value: Math.round((rec?.value ?? 0) * 100) / 100,
        // EVERY axis carries the winning set's load and reps, matching
        // `saveSession`. Volume and e1RM used to store null for both; the
        // session ledger matches a record to the set that earned it by
        // (weight, reps), so a null pair hung the chip on whichever set came
        // last. A backfill that disagrees with the app is worse than none.
        reps: rec?.reps ?? null,
        weight_kg: rec?.weightKg ?? null,
        session_id: s.id, achieved_on: dateStr,
      })
    }
  }

  if (changed.length || (s.pr_count ?? 0) !== result.prCount) {
    console.log(`${dateStr}  pr_count ${s.pr_count ?? 0} → ${result.prCount}`)
    for (const c of changed) console.log(`    ${c}`)
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    seen.push({
      key: candidates[i].key,
      weightKg: r.weight_kg, reps: r.reps, setType: r.set_type ?? null,
      side: r.side ?? null, pairId: r.pair_id ?? null,
      repFloor: candidates[i].repFloor,
    })
  }
}

// ── what will actually be written, computed BEFORE the dry-run exit ──────────
// A dry run that hides the deletes is not a dry run. `--dry-run` used to print
// a count of intentions and stop, while the destructive half — the prune — was
// computed only in the write path and never shown.
//
// DEFERRAL: a row is not written when the netted floor holds a higher value for
// that axis. Detection already respects the floor, but the SEEDED era does not
// go through detection — `detectSessionPrs` takes its axes straight from prSeed
// for any session on or before 2026-07-31 — so a seeded win can carry a value
// below the all-time best and would overwrite it. `prFloorFor`, not the raw
// book: comparing against the book re-admits the Hevy-vs-Epley noise the floor
// exists to reject, and would strand ~11 real e1RM records with no ledger row
// while `is_pr` stayed true on their sets.
const floorValue = (name, axis) => {
  const f = prFloorFor(canonicalExerciseName(name))
  if (!f) return null
  return (axis === 'reps' ? (f.seconds ?? f.reps) : f[axis]) ?? null
}
const toWrite = []
const deferred = []
for (const row of ledger) {
  const asserted = floorValue(row.exercise_key, row.axis)
  if (asserted != null && asserted > row.value) { deferred.push({ row, asserted }); continue }
  toWrite.push(row)
}

const keep = new Set(toWrite.map((r) => `${r.user_id}|${r.exercise_key}|${r.axis}`))
const userIds = [...new Set(ledger.map((r) => r.user_id))]
const { data: existing, error: readErr } = await db
  .from('personal_records')
  .select('user_id, exercise_key, axis, value, session_id')
  .in('user_id', userIds)
if (readErr) throw readErr

// ASSERTED ROWS SURVIVE. A row with a null session_id was not derived from any
// session — sync-pr-truth.mjs wrote it from the all-time book, and it exists
// precisely BECAUSE no session in the database can produce it. Pruning
// "anything the replay did not emit" would delete the entire vault on the first
// run after seeding it, silently, and the false positives would come straight
// back.
const asserted = (existing ?? []).filter((r) => r.session_id == null)
const toPrune = (existing ?? []).filter((r) => r.session_id != null
  && !keep.has(`${r.user_id}|${r.exercise_key}|${r.axis}`))

console.log(`\n${flipped} set flags to change · ${sessionUpdates.length} pr_counts to change`)
console.log(`${toWrite.length} ledger rows to write · ${deferred.length} deferred to the asserted book · ${asserted.length} asserted rows kept`)
console.log(`${toPrune.length} ledger rows to DELETE of ${existing?.length ?? 0} present`)
if (deferred.length) {
  console.log('\nDEFER (a seeded win below the all-time best)')
  for (const { row, asserted: a } of deferred) console.log(`  ${row.exercise_key.padEnd(36)} ${row.axis.padEnd(8)} ${row.value} < ${a}`)
}
if (toPrune.length) {
  console.log('\nDELETE')
  for (const r of toPrune) console.log(`  ${r.exercise_key.padEnd(36)} ${r.axis.padEnd(8)} ${r.value}`)
}

// A prune that wants most of the table is a truncated read, not a rule change.
if (existing?.length && toPrune.length > existing.length / 2) {
  console.error(`\nRefusing to delete ${toPrune.length} of ${existing.length} ledger rows — that is a truncated read, not a rule change.`)
  process.exit(1)
}

if (DRY) { console.log('\nDry run — nothing written.'); process.exit(0) }

// ── write ────────────────────────────────────────────────────────────────────
// Individual updates, not an upsert: an upsert on workout_sets would need every
// NOT NULL column echoed back, and getting one wrong would rewrite real data.
for (const u of setUpdates) {
  const { error } = await db.from('workout_sets').update({ is_pr: u.is_pr }).eq('id', u.id)
  if (error) throw error
}
for (const u of sessionUpdates) {
  const { error } = await db.from('workout_sessions').update({ pr_count: u.pr_count }).eq('id', u.id)
  if (error) throw error
}

// The ledger holds the CURRENT record per (user, exercise, axis). Replaying in
// order means later sessions overwrite earlier ones, leaving the standing best.
for (const row of toWrite) {
  const { error } = await db.from('personal_records').upsert(row, { onConflict: 'user_id,exercise_key,axis' })
  if (error) throw error
}

for (const row of toPrune) {
  const { error } = await db.from('personal_records')
    .delete()
    .eq('user_id', row.user_id).eq('exercise_key', row.exercise_key).eq('axis', row.axis)
  if (error) throw error
}
if (toPrune.length) console.log(`${toPrune.length} superseded ledger rows pruned`)

console.log('Done.')
