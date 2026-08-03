#!/usr/bin/env node
/**
 * Correct the load or reps of already-logged sets, and repair everything the
 * stored value fed.
 *
 * WHY THIS EXISTS
 * A mis-keyed load is not a single wrong number. `workout_sets.weight_kg` is
 * copied forward into `est_1rm_kg` at save time and summed into
 * `workout_sessions.total_volume_kg`, and it becomes the PR BASELINE that every
 * later session is judged against — so one bad row silently suppresses every
 * future record on that exercise.
 *
 * That is exactly what happened: Incline DB Press was logged at 63.75 kg × 12
 * on 2026-07-26, between 35 kg on 07-19 and 40 kg on 08-02. The 40 kg × 10 on
 * 08-02 was a real record and derived detection could not see it, because the
 * bar it had to clear was a load never actually lifted. The 08-02 session had
 * to be hand-asserted in `ASSERTED_DATES` to show the truth.
 *
 *   node scripts/correct-logged-sets.mjs --dry-run   # print the diff, write nothing
 *   node scripts/correct-logged-sets.mjs             # apply
 *
 * Idempotent: a set already holding the corrected value is skipped, so a second
 * run reports "0 to change".
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not re-run PR detection. Every session at or before `SEED_CUTOFF`,
 * plus the dates in `ASSERTED_DATES`, is an ASSERTED record book — the seed is
 * the authority there, not the arithmetic, so re-deriving would overwrite a
 * human judgement with a machine guess. Run `scripts/nuke-and-seed-prs.mjs`
 * afterwards if the record book itself needs replaying.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Service-role: bypasses RLS, so it must never run in the browser bundle.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const DRY = process.argv.includes('--dry-run')

/**
 * The corrections. Each entry identifies ONE set by its natural key
 * (date + canonical exercise name + set number) and states what it should hold.
 *
 * Historical loads supplied by the athlete on 2026-08-03. 07-19 and 08-02
 * already matched and are listed anyway — an assertion that reads as a no-op is
 * the cheapest proof the identification logic found the right rows.
 */
const CORRECTIONS = [
  // ── Incline DB Press ── the 07-26 row read 63.75 kg × 12 on all three sets.
  { date: '2026-07-19', exercise: 'Incline DB Press', setNumber: 1, weightKg: 35, reps: 12 },
  { date: '2026-07-19', exercise: 'Incline DB Press', setNumber: 2, weightKg: 35, reps: 12 },
  { date: '2026-07-19', exercise: 'Incline DB Press', setNumber: 3, weightKg: 35, reps: 11 },
  { date: '2026-07-26', exercise: 'Incline DB Press', setNumber: 1, weightKg: 35, reps: 12 },
  { date: '2026-07-26', exercise: 'Incline DB Press', setNumber: 2, weightKg: 35, reps: 12 },
  { date: '2026-07-26', exercise: 'Incline DB Press', setNumber: 3, weightKg: 35, reps: 12 },
  { date: '2026-08-02', exercise: 'Incline DB Press', setNumber: 1, weightKg: 35, reps: 12 },
  { date: '2026-08-02', exercise: 'Incline DB Press', setNumber: 2, weightKg: 40, reps: 10 },
  { date: '2026-08-02', exercise: 'Incline DB Press', setNumber: 3, weightKg: 40, reps: 8 },
]

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

// The REAL formulas. A script that reimplemented either would drift from the
// app the first time a rule changed.
const jiti = createJiti(import.meta.url, {
  alias: { '@': new URL('../src', import.meta.url).pathname },
})
const { epley1RM } = await jiti.import('../src/lib/utils/epley.ts')
const { sessionVolumeKg } = await jiti.import('../src/lib/sessions/volume.ts')
const { canonicalExerciseName } = await jiti.import('../src/lib/exercises/aliases.ts')

console.log(DRY ? '── DRY RUN — nothing will be written ──\n' : '── APPLYING ──\n')

// ── resolve every named exercise to its catalog row ──────────────────────────
const names = [...new Set(CORRECTIONS.map((c) => canonicalExerciseName(c.exercise)))]
const { data: exRows, error: exErr } = await db.from('exercises').select('id, name').in('name', names)
if (exErr) { console.error('exercises read failed:', exErr.message); process.exit(1) }
const exByName = new Map(exRows.map((e) => [e.name, e.id]))
for (const n of names) {
  if (!exByName.has(n)) { console.error(`No exercises row named "${n}".`); process.exit(1) }
}

// ── load every set of every affected exercise, with its session date ─────────
const { data: allSets, error: setErr } = await db
  .from('workout_sets')
  .select('id, session_id, exercise_id, set_number, weight_kg, reps, est_1rm_kg, workout_sessions(started_at)')
  .in('exercise_id', [...exByName.values()])
if (setErr) { console.error('workout_sets read failed:', setErr.message); process.exit(1) }

const dateOf = (s) => String(s.workout_sessions?.started_at ?? '').slice(0, 10)
const keyOf = (date, exId, n) => `${date}|${exId}|${n}`
const byKey = new Map(allSets.map((s) => [keyOf(dateOf(s), s.exercise_id, s.set_number), s]))

// ── build the diff ───────────────────────────────────────────────────────────
const updates = []
const touchedSessions = new Set()
let matched = 0

for (const c of CORRECTIONS) {
  const exId = exByName.get(canonicalExerciseName(c.exercise))
  const row = byKey.get(keyOf(c.date, exId, c.setNumber))
  if (!row) {
    console.error(`NO MATCH  ${c.date}  ${c.exercise}  set ${c.setNumber} — refusing to guess.`)
    process.exit(1)
  }
  matched++
  const e1rm = epley1RM(c.weightKg, c.reps)
  const same = row.weight_kg === c.weightKg && row.reps === c.reps && row.est_1rm_kg === e1rm
  const mark = same ? '  ok' : '  ✎ '
  console.log(
    `${mark} ${c.date}  ${c.exercise} set ${c.setNumber}  ` +
    `${row.weight_kg}kg ×${row.reps} (e1RM ${row.est_1rm_kg})` +
    (same ? '' : `  →  ${c.weightKg}kg ×${c.reps} (e1RM ${e1rm})`),
  )
  if (same) continue
  updates.push({ id: row.id, weight_kg: c.weightKg, reps: c.reps, est_1rm_kg: e1rm })
  touchedSessions.add(row.session_id)
}

console.log(`\n${matched} set(s) identified · ${updates.length} to change · ${touchedSessions.size} session(s) to re-total`)
if (!updates.length) { console.log('\nNothing to do.'); process.exit(0) }

// ── apply the set corrections ────────────────────────────────────────────────
if (!DRY) {
  for (const u of updates) {
    const { id, ...patch } = u
    const { error } = await db.from('workout_sets').update(patch).eq('id', id)
    if (error) { console.error(`update ${id} failed:`, error.message); process.exit(1) }
  }
  console.log(`\nUpdated ${updates.length} set(s).`)
}

// ── re-total every affected session ──────────────────────────────────────────
// Re-read rather than patch the in-memory copies: the session total is the sum
// of ALL its sets, most of which this script never loaded.
const pending = new Map(updates.map((u) => [u.id, u]))
console.log('\n── session totals ──')
for (const sessionId of touchedSessions) {
  const { data: sets, error } = await db
    .from('workout_sets')
    .select('id, weight_kg, reps, side, pair_id')
    .eq('session_id', sessionId)
  if (error) { console.error(`session ${sessionId} sets read failed:`, error.message); process.exit(1) }

  const volume = sessionVolumeKg(
    sets.map((s) => {
      // On a dry run the rows still hold the OLD loads, so overlay the pending
      // corrections — a preview that showed the unchanged total would be a lie.
      const p = DRY ? pending.get(s.id) : undefined
      return {
        weightKg: p?.weight_kg ?? s.weight_kg ?? 0,
        reps: p?.reps ?? s.reps ?? 0,
        side: s.side,
        pairId: s.pair_id,
      }
    }),
  )
  const { data: sess } = await db
    .from('workout_sessions').select('started_at, day_key, total_volume_kg').eq('id', sessionId).single()

  console.log(
    `  ${String(sess?.started_at).slice(0, 10)}  ${sess?.day_key ?? '—'}  ` +
    `${sess?.total_volume_kg} kg  →  ${volume} kg  (${sets.length} sets)`,
  )
  if (!DRY) {
    const { error: upErr } = await db
      .from('workout_sessions').update({ total_volume_kg: volume, set_count: sets.length }).eq('id', sessionId)
    if (upErr) { console.error(`session ${sessionId} update failed:`, upErr.message); process.exit(1) }
  }
}

console.log(DRY ? '\nDry run complete — nothing was written.' : '\nDone.')
