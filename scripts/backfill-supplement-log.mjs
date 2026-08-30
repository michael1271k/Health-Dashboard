#!/usr/bin/env node
/**
 * Materialise the supplement rows the auto-log pass never got to write.
 *
 * WHY THIS EXISTS
 * A dose only counted once `supplement_log` held a row for it, and the only
 * thing that wrote one — short of a manual tap — was a client-side pass that ran
 * when the app happened to be OPEN after the slot's clock time. The bedtime slot
 * is 22:00. Eight days in August 2026 alone carry no bedtime rows at all —
 * the 5th, 7th, 9th, 10th, 11th, 19th, 26th and 30th — and every one of them was
 * reported in the weekly export as three skipped doses that were swallowed on
 * time.
 *
 * The app no longer needs these rows: absence means TAKEN now, so the read rule
 * heals all of it with no writes at all. This script is for everything that
 * reads the table directly rather than through the app — an ad-hoc SQL query, a
 * future migration, anyone counting rows — so that `supplement_log` is a
 * complete record rather than a sparse one whose gaps have to be interpreted.
 *
 * ── WHAT IT WILL NOT INVENT ──────────────────────────────────────────────────
 * `taken_at` is the SCHEDULED time, in the user's own timezone, never a guess at
 * when the tablet was actually swallowed. That is the same stamp the auto-log
 * pass wrote, so a backfilled row is indistinguishable from the ones it is
 * standing in for — which is the point. It never touches a date that already has
 * a row for that item, so a real tap and a real SKIP both survive untouched.
 *
 * ── THE SCHEDULE IS RESOLVED PER DATE ────────────────────────────────────────
 * Which items were on protocol changes with the day: `schedule.days` gates the
 * weekday, and `trainingOnly` items (the pre-workout stimulants) are not asked
 * for on a rest day. Crediting a rest day with a caffeine dose would be exactly
 * the fabrication this script exists to avoid, so the training/rest split is
 * resolved from the same `schedule_overrides` + programme the app reads.
 *
 *   node scripts/backfill-supplement-log.mjs --dry-run   # print, write nothing
 *   node scripts/backfill-supplement-log.mjs             # apply
 *
 * Idempotent: rows are inserted with `ignoreDuplicates`, so a second run writes
 * nothing. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in
 * .env.local. Service-role: bypasses RLS, so it must never run in the browser.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const DRY = process.argv.includes('--dry-run')

/** The first day the programme logged anything. Nothing before this is protocol. */
const FIRST_DAY = '2026-07-15'

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

// ── the app's own resolvers, compiled on the fly ─────────────────────────────
// Importing the REAL modules rather than reimplementing the schedule rules is
// the whole point: a backfill that disagrees with the app is worse than none.
const jiti = createJiti(import.meta.url, {
  alias: { '@': new URL('../src', import.meta.url).pathname },
})
const { customSlotsForDate } = await jiti.import('../src/lib/hooks/useCustomSupplements.ts')
const { stackForDate } = await jiti.import('../src/lib/supplements.ts')
const { scheduleDayIn, isTrainingDayIn } = await jiti.import('../src/lib/programs.ts')
const { parseLayout } = await jiti.import('../src/lib/schedule/layout.ts')

// ── load everything, once ────────────────────────────────────────────────────
const { data: goalsRows, error: gErr } = await db
  .from('user_goals').select('user_id, active_plan, active_program, active_phase, goal_preset, timezone')
if (gErr) throw gErr
if (!goalsRows?.length) { console.error('No user_goals rows — refusing to run.'); process.exit(1) }

const { data: customs, error: cErr } = await db
  .from('custom_supplements').select('id, user_id, name, dose, color, form, time, schedule, micros')
if (cErr) throw cErr
if (!customs?.length) { console.error('No custom_supplements rows — refusing to run.'); process.exit(1) }

const { data: existing, error: eErr } = await db
  .from('supplement_log').select('user_id, date, item_key').gte('date', FIRST_DAY)
if (eErr) throw eErr

const { data: overrides, error: oErr } = await db
  .from('schedule_overrides').select('user_id, date, day_key')
if (oErr) throw oErr

const { data: layouts } = await db.from('program_day_layout').select('user_id, program_id, layout')

// PREFLIGHT — a truncated read means rows that DO exist look missing, and this
// script would then write duplicates of real history. PostgREST pages silently.
const PGRST_CAP = 1000
if ((existing?.length ?? 0) % PGRST_CAP === 0 && existing?.length) {
  console.error(`supplement_log came back at exactly ${existing.length} — that is the PostgREST page cap, so the read is truncated. Refusing to run.`)
  process.exit(1)
}

const have = new Set((existing ?? []).map((r) => `${r.user_id}|${r.date}|${r.item_key}`))

const today = new Date().toISOString().slice(0, 10)
const isoAdd = (d, n) => {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

const inserts = []
const perDate = new Map()

for (const goals of goalsRows) {
  const userId = goals.user_id
  const mine = customs.filter((c) => c.user_id === userId)
  if (!mine.length) continue

  const programId = goals.active_plan ?? goals.active_program ?? undefined
  const phase = ['bulk', 'maintenance'].includes(goals.active_phase ?? goals.goal_preset)
    ? (goals.active_phase ?? goals.goal_preset) : 'cut'
  const ctx = {
    programId,
    phase,
    overrides: Object.fromEntries(
      (overrides ?? []).filter((o) => o.user_id === userId).map((o) => [o.date, o.day_key]),
    ),
    layout: parseLayout((layouts ?? []).find((l) => l.user_id === userId && l.program_id === programId)?.layout),
  }

  // Yesterday, not today: today's late slots have not happened yet, and writing
  // a row for a 22:00 dose at lunchtime is the one thing the old auto-log pass
  // was careful never to do.
  for (let date = FIRST_DAY; date < today; date = isoAdd(date, 1)) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    let training
    try {
      training = isTrainingDayIn(ctx, date)
      void scheduleDayIn(ctx, date)
    } catch {
      training = true
    }
    const slots = stackForDate(customSlotsForDate(mine, weekday, training), training, weekday)
    for (const slot of slots) {
      for (const item of slot.items) {
        const id = `${userId}|${date}|${item.key}`
        if (have.has(id)) continue
        have.add(id)
        inserts.push({
          user_id: userId,
          date,
          item_key: item.key,
          taken: true,
          // The slot's own clock time, in the user's timezone. `+00:00` would
          // put a 22:00 dose on the following day for anyone east of UTC.
          taken_at: new Date(`${date}T${slot.time}:00`).toISOString(),
        })
        perDate.set(date, (perDate.get(date) ?? 0) + 1)
      }
    }
  }
}

console.log(`${inserts.length} row${inserts.length === 1 ? '' : 's'} to write${DRY ? ' · DRY RUN' : ''}`)
for (const [date, n] of [...perDate.entries()].sort()) {
  if (n >= 3) console.log(`  ${date}  +${n}`)
}

if (!inserts.length) { console.log('Nothing to do.'); process.exit(0) }
if (DRY) process.exit(0)

for (let i = 0; i < inserts.length; i += 500) {
  const chunk = inserts.slice(i, i + 500)
  const { error } = await db.from('supplement_log')
    .upsert(chunk, { onConflict: 'user_id,date,item_key', ignoreDuplicates: true })
  if (error) throw error
  console.log(`  wrote ${Math.min(i + 500, inserts.length)}/${inserts.length}`)
}
console.log('Done.')
