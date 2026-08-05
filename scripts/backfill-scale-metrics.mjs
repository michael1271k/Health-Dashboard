#!/usr/bin/env node
/**
 * Backfill the two Xiaomi scale readings Helix could not derive.
 *
 * WHY THIS EXISTS
 * `skeletal_muscle_mass_kg` and `estimated_waist_to_hip_ratio` are the only two
 * body numbers the scale computes internally. Neither can be recovered from
 * weight and a percentage — skeletal muscle needs segmental impedance, and the
 * ratio is the scale's own estimate, not a division of two circumferences
 * (Helix tracks NO tape measurements). So they cannot be repaired the way
 * `repair-body-composition.mjs` repairs the masses; they have to be transcribed.
 *
 * The 13 readings below came from the Xiaomi app, read out by the user on
 * 2026-08-05. They are ASSERTED, exactly like the PR seed: the script never
 * infers a value for a date that isn't listed, and never interpolates between
 * two that are.
 *
 *   node scripts/backfill-scale-metrics.mjs --dry-run   # print the plan, write nothing
 *   node scripts/backfill-scale-metrics.mjs             # apply
 *
 * IDEMPOTENT by construction — it writes fixed values to fixed dates, so a
 * second run is a no-op diff.
 *
 * SELF-HEALING per column. `estimated_waist_to_hip_ratio` ships ahead of its
 * paste-SQL; if the column doesn't exist yet the script writes the skeletal
 * mass anyway and reports the ratio as pending, rather than failing the whole
 * backfill. Re-run it after the DDL to fill the ratios in.
 *
 * daily_logs is UPSERTED (a scale reading can exist on a day with no other
 * row). body_composition is UPDATE-ONLY: its `weight_kg` is NOT NULL, so a date
 * with no ledger row genuinely cannot open one from a muscle reading alone.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Service-role: bypasses RLS, so it must never run in the browser bundle.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

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

// ── the readings ─────────────────────────────────────────────────────────────
/** [date, estimated waist-to-hip ratio, skeletal muscle mass kg] */
const READINGS = [
  ['2026-07-15', 0.9, 27.3],
  ['2026-07-16', 0.8, 27.0],
  ['2026-07-18', 0.8, 26.9],
  ['2026-07-19', 0.8, 27.0],
  ['2026-07-21', 0.8, 26.7],
  ['2026-07-23', 0.8, 26.8],
  ['2026-07-25', 0.7, 26.7],
  ['2026-07-27', 0.7, 26.6],
  ['2026-07-29', 0.7, 26.5],
  ['2026-07-30', 0.7, 26.5],
  ['2026-07-31', 0.7, 26.7],
  ['2026-08-02', 0.8, 26.8],
  ['2026-08-05', 0.8, 26.8],
]

const RATIO_COL = 'estimated_waist_to_hip_ratio'
const SMM_COL = 'skeletal_muscle_mass_kg'

/** Does a column exist? One cheap probe beats 13 failed writes. */
async function columnExists(table, column) {
  const { error } = await db.from(table).select(column).limit(1)
  return !error
}

const main = async () => {
  const { data: { user } } = { data: { user: null } }   // service role: no session
  // The single-user app still needs a user_id for an INSERT, so read it off an
  // existing row rather than hardcoding a UUID into the repo.
  const { data: anyRow, error: anyErr } = await db
    .from('daily_logs').select('user_id').limit(1).maybeSingle()
  if (anyErr || !anyRow?.user_id) {
    console.error('Could not resolve user_id from daily_logs:', anyErr?.message ?? 'no rows')
    process.exit(1)
  }
  const userId = anyRow.user_id
  void user

  const hasRatioDaily = await columnExists('daily_logs', RATIO_COL)
  const hasRatioComp = await columnExists('body_composition', RATIO_COL)
  const hasSmmDaily = await columnExists('daily_logs', SMM_COL)
  const hasSmmComp = await columnExists('body_composition', SMM_COL)

  console.log(`\ncolumns · daily_logs: ${SMM_COL}=${hasSmmDaily} ${RATIO_COL}=${hasRatioDaily}`)
  console.log(`columns · body_composition: ${SMM_COL}=${hasSmmComp} ${RATIO_COL}=${hasRatioComp}`)
  if (!hasRatioDaily || !hasRatioComp) {
    console.log(`\n⚠  ${RATIO_COL} is missing — writing skeletal mass only. Run the paste-SQL, then re-run this script.`)
  }
  console.log(`\n${DRY ? 'DRY RUN — nothing will be written' : 'APPLYING'}\n`)

  let daily = 0, comp = 0, skippedComp = 0

  for (const [date, ratio, smm] of READINGS) {
    const patch = {}
    if (hasSmmDaily) patch[SMM_COL] = smm
    if (hasRatioDaily) patch[RATIO_COL] = ratio
    console.log(`${date}  SMM ${smm} kg   W:H ${ratio}${hasRatioDaily ? '' : '  (ratio pending)'}`)

    if (!DRY && Object.keys(patch).length) {
      const { error } = await db.from('daily_logs')
        .upsert({ user_id: userId, date, ...patch }, { onConflict: 'user_id,date' })
      if (error) { console.error(`  ✗ daily_logs ${date}: ${error.message}`); continue }
      daily += 1
    }

    // Mirror into the ledger ONLY where a row already exists — see the header.
    const cPatch = {}
    if (hasSmmComp) cPatch[SMM_COL] = smm
    if (hasRatioComp) cPatch[RATIO_COL] = ratio
    if (!DRY && Object.keys(cPatch).length) {
      const { data: existing } = await db.from('body_composition')
        .select('id').eq('user_id', userId).eq('date', date).limit(1).maybeSingle()
      if (!existing) { skippedComp += 1; continue }
      const { error } = await db.from('body_composition').update(cPatch).eq('id', existing.id)
      if (error) { console.error(`  ✗ body_composition ${date}: ${error.message}`); continue }
      comp += 1
    }
  }

  console.log(`\n${DRY ? 'would write' : 'wrote'}: daily_logs ${daily}/${READINGS.length} · body_composition ${comp}/${READINGS.length}`)
  if (skippedComp) console.log(`${skippedComp} date(s) have no body_composition row (weight_kg is NOT NULL) — daily_logs still carries them.`)

  if (!DRY) {
    const { data: check } = await db.from('daily_logs')
      .select(`date, ${SMM_COL}${hasRatioDaily ? `, ${RATIO_COL}` : ''}`)
      .in('date', READINGS.map(([d]) => d)).order('date')
    console.log('\nverify:')
    for (const r of check ?? []) {
      console.log(`  ${r.date}  SMM ${r[SMM_COL]}${hasRatioDaily ? `  W:H ${r[RATIO_COL]}` : ''}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
