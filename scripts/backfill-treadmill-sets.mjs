#!/usr/bin/env node
/**
 * Give every treadmill set the five minutes and 0.37 km it was performed at.
 *
 * WHY THIS EXISTS
 * A treadmill block is a `workout_sets` row (see `docs/sql/treadmill-backfill.sql`
 * for why it is not a `cardio_logs` one), and until this wave the phone had no
 * control for the three numbers such a row carries. So the rows exist, sit at
 * `exercise_order` 0 of the session they open, and hold `0 kg × 0` with a NULL
 * duration and a NULL distance — which is not a bout, it is an empty set. Every
 * reader treats it as one: the ledger prints `0 kg × 0`, the deck refused to
 * TICK it (`toggleDone` wants reps or cardio content, and a row with neither has
 * neither), and the session summary counts a set that says nothing happened.
 *
 * WHAT IT WRITES
 * `duration_sec = 300` and `distance_km = 0.370` — `WarmupCardio`'s own two
 * numbers, which are what this athlete's warm-up actually is and what the two
 * days already repaired by hand carry. `incline` is deliberately NOT invented:
 * a bout walked at an unknown gradient is a bout with an unknown gradient, and
 * unlike the duration there is no default that is more true than NULL. Weight,
 * reps, `set_type` and the session totals are untouched — a 0 kg × 0 bout
 * contributes nothing to tonnage either way, which is why the warm-up type is
 * already correct.
 *
 * IDEMPOTENT, and narrow: only rows whose duration AND distance are both absent
 * or zero are written. A bout that already carries a real 12-minute run is left
 * exactly as it is — this repairs the empty ones, it does not normalise the
 * measured ones.
 *
 *   node scripts/backfill-treadmill-sets.mjs --dry-run   # print, write nothing
 *   node scripts/backfill-treadmill-sets.mjs             # apply
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry-run')

/** `WarmupCardio` in OnyxCore, and `WARMUP_CARDIO` on the web. One walk. */
const DURATION_SEC = 300
const DISTANCE_KM = 0.37

/**
 * What counts as a treadmill.
 *
 * By NAME, because the exercise catalogue has no modality column — the same
 * reason `Unilateral` and `TimedExercise` match on names. Kept to the machines
 * that are actually walked or run on: a rower and a bike are bouts too, but
 * nobody has logged one on this account and inventing 0.37 km for a rower would
 * be writing a measurement rather than repairing one.
 */
const TREADMILL = /treadmill|walk|incline\s*walk|run(ning)?\s*machine/i

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

const { data: exercises, error: exError } = await db.from('exercises').select('id, name')
if (exError) throw exError
const treadmills = (exercises ?? []).filter((e) => TREADMILL.test(e.name ?? ''))
if (!treadmills.length) {
  console.log('No treadmill in the exercise catalogue — nothing to repair.')
  process.exit(0)
}
console.log(`Treadmill catalogue rows: ${treadmills.map((e) => e.name).join(', ')}`)

const { data: rows, error } = await db
  .from('workout_sets')
  .select('id, session_id, set_number, weight_kg, reps, duration_sec, distance_km, incline')
  .in('exercise_id', treadmills.map((e) => e.id))
  .order('session_id', { ascending: true })
if (error) throw error

const PGRST_CAP = 1000
if (rows.length && rows.length % PGRST_CAP === 0) {
  console.error(`workout_sets came back at exactly ${rows.length} — the PostgREST page cap. The read is truncated; refusing to run.`)
  process.exit(1)
}

// Absent OR zero. A row written by an older client can carry 0 rather than
// NULL, and a zero-second bout is exactly as untrue as a missing one.
const empty = (v) => v == null || Number(v) === 0
const targets = rows.filter((r) => empty(r.duration_sec) && empty(r.distance_km))

console.log(`${rows.length} treadmill sets · ${targets.length} without a duration or a distance${DRY ? ' · DRY RUN' : ''}`)
if (!targets.length) process.exit(0)

for (const row of targets) {
  console.log(`  ${row.session_id} · set ${row.set_number}: → ${DURATION_SEC}s, ${DISTANCE_KM} km`)
  if (DRY) continue
  const { error: upError } = await db
    .from('workout_sets')
    .update({ duration_sec: DURATION_SEC, distance_km: DISTANCE_KM })
    .eq('id', row.id)
  if (upError) throw upError
}

console.log(DRY ? '\nDry run — nothing written.' : `\n${targets.length} treadmill sets repaired.`)
