#!/usr/bin/env node
/**
 * Rebuild `routine_templates` from ONE chosen week's sessions.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The template is overwritten on every save (`src/lib/sessions/save.ts`), so it
 * always holds the SHAPE OF THE LAST SESSION — including a maintenance week's.
 * Week 7 (2026-08-30 → 09-05) was the planned maintenance week, logged at two
 * sets per lift, and it rewrote all five rows: Upper A opened as 13 sets where
 * Week 6 had done 18. The founder's rule (Phase 3, decision 5) is that Week 6
 * is the canonical shape, so this rebuilds each `day_key` from that week's
 * session — the same serialiser the save path uses, so the payload cannot
 * differ in shape from one the app would have written itself.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 * Touch `workout_sessions` or `workout_sets`. Rows are the record of what
 * happened; the template is only what opens next time.
 *
 *   node scripts/rebuild-routine-templates.mjs --dry-run              # Week 6
 *   HELIX_APPLY=1 node scripts/rebuild-routine-templates.mjs
 *   node scripts/rebuild-routine-templates.mjs --dry-run --week 2026-08-23
 *
 * IDEMPOTENT: a second run reports every day as unchanged.
 *
 * The week is bucketed on `started_at` in UTC; a session that starts within an
 * hour of local midnight can land on the neighbouring UTC day. Read the
 * dry-run's dates before applying.
 *
 * Cardio: `cardio_logs` stores neither the block's deck name nor its position,
 * and a warm-up walk rebuilt as a finisher named "treadmill" is worse than no
 * block. A session with cardio rows therefore takes the block's name, note and
 * position from the template ALREADY stored for that day, and is skipped with a
 * warning when there is none to copy from.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Service-role: bypasses RLS, so it must never run in the browser bundle.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const DRY = process.argv.includes('--dry-run')
if (!DRY && process.env.HELIX_APPLY !== '1') {
  console.error('pass --dry-run, or set HELIX_APPLY=1 to write')
  process.exit(1)
}
const weekArg = process.argv.indexOf('--week')
const WEEK_START = weekArg > -1 ? process.argv[weekArg + 1] : '2026-08-23'
if (!/^\d{4}-\d{2}-\d{2}$/.test(WEEK_START)) {
  console.error(`--week wants an ISO date, got ${WEEK_START}`)
  process.exit(1)
}
const weekEnd = (() => {
  const d = new Date(`${WEEK_START}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().slice(0, 10)
})()

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

// ── the app's own serialiser ─────────────────────────────────────────────────
// `payloadToTemplate` is the ONLY definition of the jsonb shape. Restating it
// here would be the parity bug this script exists to avoid.
const jiti = createJiti(import.meta.url, {
  alias: { '@': new URL('../src', import.meta.url).pathname },
})
const { payloadToTemplate } = await jiti.import('../src/lib/sessions/routineTemplate.ts')
const { canonicalExerciseName } = await jiti.import('../src/lib/exercises/aliases.ts')

// ── the week's sessions ──────────────────────────────────────────────────────
const { data: sessions, error: sErr } = await db
  .from('workout_sessions')
  .select('id, user_id, day_key, started_at')
  .gte('started_at', `${WEEK_START}T00:00:00Z`)
  .lt('started_at', `${weekEnd}T00:00:00Z`)
  .not('day_key', 'is', null)
  .eq('status', 'complete')
  .order('started_at', { ascending: true })
if (sErr) { console.error(sErr.message); process.exit(1) }

if (!sessions?.length) {
  console.log(`No sessions with a day_key in the week of ${WEEK_START}. Nothing to do.`)
  process.exit(0)
}

// One session per (user, day_key) — the LAST completed one that week wins,
// which for a normal week is the only one.
const byDay = new Map()
for (const s of sessions) byDay.set(`${s.user_id}|${s.day_key}`, s)

const { data: catalogue, error: cErr } = await db.from('exercises').select('id, name')
if (cErr) { console.error(cErr.message); process.exit(1) }
const nameOf = new Map((catalogue ?? []).map((e) => [e.id, e.name]))

const { data: existing, error: tErr } = await db
  .from('routine_templates')
  .select('user_id, day_key, payload, source_session_id')
if (tErr) { console.error(tErr.message); process.exit(1) }
const existingBy = new Map((existing ?? []).map((t) => [`${t.user_id}|${t.day_key}`, t]))

// jsonb hands keys back in ITS order (length, then bytes), so a string compare
// against what we would write is never equal. Compare on a key-sorted form.
const canon = (v) => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  : v
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

const setCount = (t) => (t?.exercises ?? []).reduce((n, e) => n + (e.sets?.length ?? 0), 0)
const shape = (t) => (t?.exercises ?? []).map((e) => `${e.name}:${e.sets?.length ?? 0}`).join(', ')

const plan = []
for (const [, s] of byDay) {
  const dayKey = s.day_key
  const { data: rows, error: rErr } = await db
    .from('workout_sets')
    .select('exercise_id, set_number, weight_kg, reps, rpe, set_type, exercise_order, side, pair_id, created_at')
    .eq('session_id', s.id)
    .order('exercise_order', { ascending: true, nullsFirst: false })
    .order('set_number', { ascending: true })
  if (rErr) { console.error(rErr.message); process.exit(1) }

  // `exercise_order` can be null on rows a client wrote before the column
  // existed. Those are appended after the ordered ones, in the order the rows
  // were written — the closest thing to "performed in" the table still holds.
  const firstSeen = new Map()
  const byWrite = [...(rows ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  for (const r of byWrite) if (!firstSeen.has(r.exercise_id)) firstSeen.set(r.exercise_id, firstSeen.size)
  const orderedCount = new Set((rows ?? []).filter((r) => r.exercise_order != null).map((r) => r.exercise_id)).size
  const nullOrder = new Map()
  for (const r of byWrite) if (r.exercise_order == null && !nullOrder.has(r.exercise_id)) nullOrder.set(r.exercise_id, orderedCount + nullOrder.size)

  const sets = (rows ?? []).map((r) => ({
    exerciseName: canonicalExerciseName(nameOf.get(r.exercise_id) ?? r.exercise_id),
    weightKg: Number(r.weight_kg ?? 0),
    reps: Number(r.reps ?? 0),
    rpe: r.rpe == null ? null : Number(r.rpe),
    setType: r.set_type ?? null,
    exerciseOrder: r.exercise_order ?? nullOrder.get(r.exercise_id) ?? null,
    side: r.side ?? null,
    pairId: r.pair_id ?? null,
  }))

  const prior = existingBy.get(`${s.user_id}|${dayKey}`)

  const { data: cardio, error: kErr } = await db
    .from('cardio_logs')
    .select('distance_m, duration_min, incline_pct')
    .eq('session_id', s.id)
    .order('created_at', { ascending: true })
  if (kErr) { console.error(kErr.message); process.exit(1) }
  // Name, note and deck position come from the stored template (see header).
  const priorCardio = (prior?.payload?.exercises ?? []).filter((e) => e.kind === 'cardio')
  if ((cardio ?? []).length && priorCardio.length < cardio.length) {
    console.warn(`${dayKey}: session ${s.id} has ${cardio.length} cardio block(s) and the stored template names ${priorCardio.length} — skipped rather than invent a name or a position`)
    continue
  }
  const cardioBlocks = (cardio ?? []).map((c, i) => ({
    name: priorCardio[i].name,
    ...(priorCardio[i].note ? { note: priorCardio[i].note } : {}),
    ...(c.distance_m != null ? { distanceKm: Number(c.distance_m) / 1000 } : {}),
    ...(c.duration_min != null ? { durationSec: Math.round(Number(c.duration_min) * 60) } : {}),
    ...(c.incline_pct != null ? { inclinePct: Number(c.incline_pct) } : {}),
    deckOrder: priorCardio[i].order ?? 0,
  }))

  const template = payloadToTemplate(sets, cardioBlocks)
  if (!template) { console.warn(`${dayKey}: session ${s.id} produced no template (all ghosts?) — skipped`); continue }

  const unchanged = !!prior && same(prior.payload, template) && prior.source_session_id === s.id
  plan.push({ dayKey, session: s, template, prior, unchanged })
}

for (const p of plan) {
  const date = p.session.started_at.slice(0, 10)
  console.log(`${p.dayKey.padEnd(8)} ${date}  ${String(setCount(p.prior?.payload)).padStart(2)} → ${String(setCount(p.template)).padStart(2)} sets  ${p.unchanged ? '(unchanged)' : ''}`)
  console.log(`         was: ${shape(p.prior?.payload) || '—'}`)
  console.log(`         now: ${shape(p.template)}`)
}

const changed = plan.filter((p) => !p.unchanged)
if (!changed.length) { console.log('\nEvery template already matches — nothing to do.'); process.exit(0) }
if (DRY) { console.log(`\n--dry-run: ${changed.length} row(s) would be written. Nothing written.`); process.exit(0) }

for (const p of changed) {
  const { error } = await db.from('routine_templates').upsert({
    user_id: p.session.user_id, day_key: p.dayKey, payload: p.template,
    source_session_id: p.session.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,day_key' })
  if (error) { console.error(`${p.dayKey}: ${error.message}`); process.exit(1) }
}
console.log(`\nWrote ${changed.length} template(s) from the week of ${WEEK_START}.`)
