#!/usr/bin/env node
/**
 * Wipe every personal record, then write back only the asserted record book.
 *
 * WHY THIS EXISTS
 * PR state lives in THREE independent stores, and clearing one leaves the
 * others contradicting it:
 *
 *   personal_records          the ledger — one standing row per (user, exercise, axis)
 *   workout_sets.is_pr        the per-set trophy flag
 *   workout_sessions.pr_count the per-session headline
 *
 * A ledger-only wipe would still leave TrainingCard, WeeklyReviewCard, the
 * widget snapshot, compute-score, the Notion export and the weekly loop all
 * reporting the old counts, because none of them read the ledger. This clears
 * all three, then replays `SEEDED_PRS` through the real engine.
 *
 * NOTE: this does NOT change what future sessions are judged against. Baselines
 * are derived from `workout_sets` on every path (save.ts, useExerciseBaselines,
 * backfill-prs) and are untouched — deliberately, so the ~20 exercises absent
 * from the seed keep their true all-time bars instead of resetting to nothing.
 *
 *   node scripts/nuke-and-seed-prs.mjs --dry-run   # print the plan, write nothing
 *   node scripts/nuke-and-seed-prs.mjs             # apply
 *
 * Idempotent. Safe to re-run, and `scripts/backfill-prs.mjs` afterwards is a
 * no-op because the engine reproduces the seed by construction.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Service-role: bypasses RLS, so it must never run in the browser bundle.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

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

// The REAL engine and the REAL seed. A script that reimplements either would
// drift from the app the first time a rule changed.
const jiti = createJiti(import.meta.url, {
  alias: { '@': new URL('../src', import.meta.url).pathname },
})
const { detectSessionPrs, recordSets, EMPTY_BASELINES } = await jiti.import('../src/lib/training/prEngine.ts')
const { isTimedExercise } = await jiti.import('../src/lib/exercises/timed.ts')
const { SEEDED_PRS, SEED_CUTOFF } = await jiti.import('../src/lib/training/prSeed.ts')

// ── load ─────────────────────────────────────────────────────────────────────
const { data: sessions, error: sErr } = await db.from('workout_sessions')
  .select('id, user_id, started_at, day_key, pr_count')
  .order('started_at', { ascending: true })
if (sErr) { console.error('sessions read failed:', sErr.message); process.exit(1) }

const { data: sets, error: wErr } = await db.from('workout_sets')
  .select('id, session_id, user_id, exercise_id, set_number, exercise_order, weight_kg, reps, set_type, is_pr, exercises(name)')
  .limit(5000)
if (wErr) { console.error('sets read failed:', wErr.message); process.exit(1) }

const byId = new Map(sessions.map((s) => [s.id, s]))
const bySession = new Map()
for (const r of sets) {
  if (!byId.has(r.session_id)) continue
  const list = bySession.get(r.session_id) ?? []
  list.push(r)
  bySession.set(r.session_id, list)
}

console.log(`${sessions.length} sessions · ${sets.length} sets`)
console.log(`Seed: ${SEEDED_PRS.length} records, cutoff ${SEED_CUTOFF}\n`)

// ── plan ─────────────────────────────────────────────────────────────────────
const flagOn = []          // set ids that must end up is_pr = true
const counts = new Map()   // session id → pr_count
const ledger = []

for (const s of sessions) {
  const dateStr = String(s.started_at).slice(0, 10)
  const rows = (bySession.get(s.id) ?? []).sort((a, b) =>
    (a.exercise_order ?? 999) - (b.exercise_order ?? 999) || (a.set_number ?? 0) - (b.set_number ?? 0))
  if (!rows.length) { counts.set(s.id, 0); continue }

  // Keyed by exercise NAME so the ledger's exercise_key lines up with
  // `exercises.name`, which is what useSessionDetail matches chips on.
  const candidates = rows.map((r) => {
    const name = r.exercises?.name ?? r.exercise_id
    return {
      key: name,
      weightKg: r.weight_kg ?? 0,
      reps: r.reps ?? 0,
      setType: r.set_type ?? null,
      timed: isTimedExercise(name),
      date: dateStr,
      exerciseName: name,
      setNumber: r.set_number ?? null,
    }
  })

  // EMPTY_BASELINES is correct here and only here: inside the seeded era the
  // engine ignores baselines entirely, and every session in this database is
  // inside it. Live saves keep using history-derived baselines as always.
  const result = detectSessionPrs(candidates, EMPTY_BASELINES)
  counts.set(s.id, result.prCount)
  result.perSet.forEach((d, i) => { if (d.axes.length) flagOn.push(rows[i].id) })

  const records = recordSets(candidates, result)
  for (const [name, axes] of result.axesByKey) {
    const byAxis = records.get(name)
    for (const axis of axes) {
      const rec = byAxis?.get(axis)
      ledger.push({
        user_id: s.user_id, exercise_key: name, axis,
        value: Math.round((rec?.value ?? 0) * 100) / 100,
        reps: axis === 'reps' ? (rec?.reps ?? null) : null,
        weight_kg: axis === 'weight' || axis === 'reps' ? (rec?.weightKg ?? null) : null,
        session_id: s.id, achieved_on: dateStr,
      })
    }
  }

  if (result.prCount) {
    console.log(`${dateStr}  ${s.day_key ?? '—'}  pr_count ${s.pr_count ?? 0} → ${result.prCount}`)
    for (const [name, axes] of result.axesByKey) console.log(`    ${name}: ${[...axes].join(', ')}`)
  }
}

const standing = new Set(ledger.map((r) => `${r.user_id}|${r.exercise_key}|${r.axis}`))
const sessionsWithPrs = [...counts.values()].filter((n) => n > 0).length

console.log(`\nflagged sets        ${flagOn.length}`)
console.log(`ledger rows         ${standing.size} standing (${ledger.length} writes, later sessions overwrite)`)
console.log(`sessions with PRs   ${sessionsWithPrs} / ${sessions.length}`)
console.log(`axis-achievements   ${[...counts.values()].reduce((a, b) => a + b, 0)}`)

if (DRY) { console.log('\n--dry-run: nothing written.'); process.exit(0) }

// ── apply ────────────────────────────────────────────────────────────────────
const userIds = [...new Set(sessions.map((s) => s.user_id))]

// 1. Empty the ledger. Scoped by user_id — the natural key includes it.
const { error: dErr } = await db.from('personal_records').delete().in('user_id', userIds)
if (dErr) { console.error('ledger wipe failed:', dErr.message); process.exit(1) }

// 2. Clear every trophy flag, then set only the seeded ones. Clearing first
//    means a set that USED to be flagged and no longer is cannot be missed.
const { error: fErr } = await db.from('workout_sets')
  .update({ is_pr: false }).in('user_id', userIds).eq('is_pr', true)
if (fErr) { console.error('is_pr clear failed:', fErr.message); process.exit(1) }
for (const id of flagOn) {
  const { error } = await db.from('workout_sets').update({ is_pr: true }).eq('id', id)
  if (error) { console.error(`  flag ${id}: ${error.message}`) }
}

// 3. pr_count on every session, including the ones going back to zero.
for (const [id, n] of counts) {
  if ((byId.get(id)?.pr_count ?? 0) === n) continue
  const { error } = await db.from('workout_sessions').update({ pr_count: n }).eq('id', id)
  if (error) console.error(`  pr_count ${id}: ${error.message}`)
}

// 4. Replay the ledger in date order, so the last writer per (exercise, axis)
//    leaves the standing record.
for (const row of ledger) {
  const { error } = await db.from('personal_records')
    .upsert(row, { onConflict: 'user_id,exercise_key,axis' })
  if (error) console.error(`  ledger ${row.exercise_key}/${row.axis}: ${error.message}`)
}

const { data: after } = await db.from('personal_records').select('exercise_key, axis').in('user_id', userIds)
const { data: flagged } = await db.from('workout_sets').select('id').in('user_id', userIds).eq('is_pr', true)
console.log(`\nDone. ${flagged?.length ?? 0} flagged sets · ${after?.length ?? 0} ledger rows.`)
