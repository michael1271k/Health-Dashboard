#!/usr/bin/env node
/**
 * Rebuild every body-composition MASS from first principles.
 *
 * WHY THIS EXISTS
 * `daily_logs.lean_mass_kg` held two different quantities depending on which
 * source wrote it last:
 *
 *   HealthKit  LeanBodyMass  = FAT-FREE MASS   = weight × (1 − BF%)
 *   InBody card               = MUSCLE MASS     = weight × muscle%
 *
 * They differ by ~2.6 kg. Live data shows the switch happening on 2026-07-23 —
 * 51.1 → 53.3 with no matching change in weight or body fat — which the trend
 * chart drew as a lean-mass GAIN in the middle of a cut, and the weekly export
 * reported as fact.
 *
 * The repair does NOT try to classify which definition each old row held. Both
 * masses are recomputed from the inputs that are unambiguous — weight, body-fat
 * % and muscle % — using the same `deriveBodyComp` the app uses. Where an input
 * is missing the output is written as NULL: 2026-07-17 and 07-20 have no muscle
 * %, so their muscle mass is genuinely unknown and is recorded as unknown
 * rather than inheriting the fat-free number.
 *
 *   node scripts/repair-body-composition.mjs --dry-run   # print the diff, write nothing
 *   node scripts/repair-body-composition.mjs             # apply
 *
 * Idempotent: it derives from raw inputs, so running it twice is a no-op.
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

// The REAL derivation module. A repair that disagrees with the app is worse
// than none — the next manual save would just undo it.
const jiti = createJiti(import.meta.url, {
  alias: { '@': new URL('../src', import.meta.url).pathname },
})
const { deriveBodyComp } = await jiti.import('../src/lib/body/composition.ts')

// ── load ─────────────────────────────────────────────────────────────────────
const MASS_COLS = [
  'fat_mass_kg', 'fat_free_mass_kg', 'muscle_mass_kg',
  'water_mass_kg', 'bone_mineral_kg', 'protein_mass_kg',
]

const { data: logs, error: logErr } = await db.from('daily_logs')
  .select(`id, user_id, date, weight_kg, body_fat_pct, muscle_percent, water_percent, bone_mineral, protein_percent, lean_mass_kg, ${MASS_COLS.join(', ')}`)
  .order('date', { ascending: true })
if (logErr) { console.error('daily_logs read failed:', logErr.message); process.exit(1) }

const { data: ledger, error: bcErr } = await db.from('body_composition')
  .select('id, user_id, date, weight_kg, body_fat_pct, muscle_mass_kg, fat_free_mass_kg, fat_mass_kg, muscle_pct, water_pct')
  .order('date', { ascending: true })
if (bcErr) { console.error('body_composition read failed:', bcErr.message); process.exit(1) }

console.log(`daily_logs: ${logs.length} rows · body_composition: ${ledger.length} rows\n`)

// ── plan ─────────────────────────────────────────────────────────────────────
/** Deep-equal for a nullable number, tolerating float noise. */
const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.005)
const f = (v) => (v == null ? '  —  ' : v.toFixed(2).padStart(6))

const logUpdates = []
const ledgerUpdates = []

for (const r of logs) {
  // Every mass, derived. Absent keys mean "cannot be known from this row" and
  // must be written as an explicit null — a stale value is the bug we are here
  // to remove, so leaving one in place would defeat the whole repair.
  const d = deriveBodyComp({
    weight_kg: r.weight_kg, body_fat_pct: r.body_fat_pct,
    muscle_percent: r.muscle_percent, water_percent: r.water_percent,
    bone_mineral: r.bone_mineral, protein_percent: r.protein_percent,
  })
  const next = Object.fromEntries(MASS_COLS.map((c) => [c, d[c] ?? null]))
  if (MASS_COLS.every((c) => same(r[c], next[c]))) continue
  logUpdates.push({ id: r.id, date: r.date, before: r, after: next })
}

for (const r of ledger) {
  // The ledger has no percentages of its own on HealthKit-written rows, so the
  // day's daily_logs entry is the authority; fall back to the ledger's own
  // muscle_pct when there is no log row for that date.
  const log = logs.find((l) => l.date === r.date && l.user_id === r.user_id)
  const d = deriveBodyComp({
    weight_kg: r.weight_kg ?? log?.weight_kg,
    body_fat_pct: r.body_fat_pct ?? log?.body_fat_pct,
    muscle_percent: log?.muscle_percent ?? r.muscle_pct,
    water_percent: log?.water_percent ?? r.water_pct,
  })
  const next = {
    muscle_mass_kg: d.muscle_mass_kg ?? null,
    fat_free_mass_kg: d.fat_free_mass_kg ?? null,
    fat_mass_kg: d.fat_mass_kg ?? null,
  }
  if (Object.keys(next).every((k) => same(r[k], next[k]))) continue
  ledgerUpdates.push({ id: r.id, date: r.date, before: r, after: next })
}

// ── report ───────────────────────────────────────────────────────────────────
console.log('daily_logs — muscle mass vs fat-free mass')
console.log('date         wt   old lean |  muscle    FFM     fat')
for (const u of logUpdates) {
  console.log(
    `${u.date} ${f(u.before.weight_kg)} ${f(u.before.lean_mass_kg)} | `
    + `${f(u.after.muscle_mass_kg)} ${f(u.after.fat_free_mass_kg)} ${f(u.after.fat_mass_kg)}`
    + (u.after.muscle_mass_kg == null ? '   (no muscle % — muscle mass unknown)' : ''),
  )
}
console.log(`\n${logUpdates.length} daily_logs rows · ${ledgerUpdates.length} body_composition rows to update`)

if (DRY) {
  console.log('\n--dry-run: nothing written.')
  process.exit(0)
}

// ── apply ────────────────────────────────────────────────────────────────────
let ok = 0
for (const u of logUpdates) {
  const { error } = await db.from('daily_logs').update(u.after).eq('id', u.id)
  if (error) console.error(`  daily_logs ${u.date}: ${error.message}`)
  else ok += 1
}
let ok2 = 0
for (const u of ledgerUpdates) {
  const { error } = await db.from('body_composition').update(u.after).eq('id', u.id)
  if (error) console.error(`  body_composition ${u.date}: ${error.message}`)
  else ok2 += 1
}
console.log(`\nUpdated ${ok}/${logUpdates.length} daily_logs · ${ok2}/${ledgerUpdates.length} body_composition rows.`)
