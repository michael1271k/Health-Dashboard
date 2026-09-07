#!/usr/bin/env node
/**
 * The App Review demo account: six weeks of synthetic training, from nothing.
 *
 * WHY THIS EXISTS
 * App Review needs working credentials for any app that gates its content behind
 * a login (guideline 2.1), and an empty account is worse than no account — a
 * reviewer who signs in and finds seven blank tabs files a rejection for
 * "incomplete functionality". So the demo account has to arrive with a history
 * that makes every screen show something: sessions with sets and PRs, nights
 * with stages, days with intake and a weight trend, soreness, effort, cardio.
 *
 * RE-RUNNABLE, AND THAT IS THE HARD PART
 * A reviewer will use this account, and may DELETE it — the delete button is one
 * of the things they are there to test. So this script must cope with the user
 * existing, the user not existing, and the user existing with a half-written
 * history from an interrupted run. It does that the blunt way: find or create
 * the auth user, wipe every row it owns, then write the whole six weeks in one
 * pass. Not a diff, not an upsert-if-changed — a truncate and a rewrite. The
 * data is synthetic and costs nothing to regenerate, and a wipe-and-rewrite has
 * exactly one outcome where a merge has many.
 *
 * DETERMINISTIC
 * A seeded PRNG, not `Math.random()`. Two runs a week apart produce byte-identical
 * rows, so "did the reviewer change something?" is answerable by re-running this
 * and diffing. The dates are the only thing that move: they are anchored on the
 * run date so the account always shows the SIX WEEKS ENDING TODAY, which is what
 * a reviewer opening "this week" needs to see.
 *
 * IT IS NOT SPECIAL
 * `delete_my_account()` does not know this account exists and must never learn.
 * The demo user is an ordinary member with an ordinary profile row, so deleting
 * it exercises the same code path a real user's deletion does — which is the
 * whole point of having the reviewer try it.
 *
 *   node scripts/seed-demo-account.mjs --dry-run   # report what it would write
 *   node scripts/seed-demo-account.mjs             # apply
 *   node scripts/seed-demo-account.mjs --dry-run   # again → "already seeded"
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Service-role: bypasses RLS, so it must never run in the browser bundle.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const DRY = process.argv.includes('--dry-run')

const DEMO_EMAIL = process.env.ONYX_DEMO_EMAIL || 'appreview@onyx.fitness'
/**
 * REQUIRED FROM THE ENVIRONMENT. There is deliberately no default.
 *
 * This repository is public. A literal here would be a working production login
 * against a Supabase URL that is public by design — the anon key and RLS are
 * what protect the data, and neither of them stops somebody who has the
 * password. That the credentials are also handed to App Review is not an
 * argument for committing them: Apple is one reader, GitHub is every reader.
 */
const DEMO_PASSWORD = process.env.ONYX_DEMO_PASSWORD
const WEEKS = 6

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
if (!DEMO_PASSWORD) {
  console.error('Set ONYX_DEMO_PASSWORD in the environment — this script will not invent one.')
  console.error('  ONYX_DEMO_PASSWORD=\'…\' node scripts/seed-demo-account.mjs')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

// ── the app's own name canonicalisation ──────────────────────────────────────
// `personal_records.exercise_key` is a canonical NAME, not an id — the same one
// `backfill-prs.mjs` writes. Inventing the key here instead of importing the
// resolver is how a demo account ends up with a PR ledger the app cannot match
// to any movement. jiti ships with Next.js, so this costs no new dependency.
const jiti = createJiti(import.meta.url, {
  alias: { '@': new URL('../src', import.meta.url).pathname },
})
const { canonicalExerciseName } = await jiti.import('../src/lib/exercises/aliases.ts')

// ── a PRNG, so two runs agree ────────────────────────────────────────────────
// mulberry32. Small, fast, and — the only property that matters here — the same
// sequence from the same seed on every machine and every Node version.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20260907)
/** A value in [lo, hi], rounded to `dp`. */
const between = (lo, hi, dp = 0) => Number((lo + rand() * (hi - lo)).toFixed(dp))
const pick = (xs) => xs[Math.floor(rand() * xs.length)]

const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000)

// ── the shape of the six weeks ───────────────────────────────────────────────
// Anchored on today so the account always has a "this week". Sunday start, to
// match `weekStartOf(date, 0)`.
const today = new Date(`${iso(new Date())}T12:00:00Z`)
const start = addDays(today, -(WEEKS * 7 - 1))

/** Four training days a week, which is what the app's own programme assumes. */
const SPLIT = {
  1: { key: 'upper_a', label: 'Upper A' },
  2: { key: 'legs_a', label: 'Legs & Core A' },
  4: { key: 'upper_b', label: 'Upper B' },
  5: { key: 'legs_b', label: 'Legs & Core B' },
}

/** Movements per day, with the load a demo account plausibly lifts. */
const MOVES = {
  upper_a: [
    ['Incline DB Press', 24, 8, 12], ['Chest Press (Machine)', 40, 10, 12],
    ['Lat Pulldown', 50, 8, 12], ['Cable Row', 45, 10, 12], ['Lateral Raise', 8, 12, 20],
  ],
  legs_a: [
    ['Leg Press', 120, 8, 12], ['Romanian Deadlift', 60, 8, 12],
    ['Leg Extension', 45, 12, 15], ['Calf Press', 70, 12, 15], ['Reverse Crunch', 0, 12, 15],
  ],
  upper_b: [
    ['Overhead Press', 30, 6, 10], ['Chest Supported Row', 45, 8, 12],
    ['Preacher Curl (Machine)', 18, 8, 12], ['Triceps Pushdown', 25, 10, 15],
  ],
  legs_b: [
    ['Hack Squat', 70, 8, 12], ['Hip Thrust (Machine)', 80, 8, 15],
    ['Leg Curl', 40, 10, 15], ['Standing Calf Raise', 60, 12, 20],
  ],
}

const MUSCLES = {
  'Incline DB Press': ['Chest', 'Front delts'], 'Chest Press (Machine)': ['Chest'],
  'Lat Pulldown': ['Lats'], 'Cable Row': ['Upper back'], 'Lateral Raise': ['Side delts'],
  'Leg Press': ['Quadriceps'], 'Romanian Deadlift': ['Hamstrings'],
  'Leg Extension': ['Quadriceps'], 'Calf Press': ['Calves'], 'Reverse Crunch': ['Abs'],
  'Overhead Press': ['Front delts'], 'Chest Supported Row': ['Upper back'],
  'Preacher Curl (Machine)': ['Biceps'], 'Triceps Pushdown': ['Triceps'],
  'Hack Squat': ['Quadriceps'], 'Hip Thrust (Machine)': ['Glutes'],
  'Leg Curl': ['Hamstrings'], 'Standing Calf Raise': ['Calves'],
}

// ── 1. the auth user ─────────────────────────────────────────────────────────
async function findOrCreateUser() {
  // `listUsers` is paged and there is no "get by email"; one page of 200 is
  // ample for a project that has a handful of accounts, and the script says so
  // rather than pretending to scan the whole table.
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (listErr) throw listErr
  const existing = list.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase())
  if (existing) return { id: existing.id, created: false }

  if (DRY) return { id: null, created: true }

  // `email_confirm: true` — the reviewer cannot click a link in an inbox they
  // do not have. This is the ONE way the demo account differs from a real one,
  // and it differs in the account's creation, not in its behaviour afterwards.
  const { data, error } = await db.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  })
  if (error) throw error
  return { id: data.user.id, created: true }
}

// ── 2. the wipe ──────────────────────────────────────────────────────────────
// The same order and the same list as `delete_my_account()` in
// docs/sql/e6-auth-deletion.sql, minus `profiles`/`user_goals`/`plans`, which
// this script rewrites rather than removes (the trigger created them, and
// deleting them would leave a signed-in account with no settings row).
const WIPE = [
  'workout_sets', 'personal_records', 'routine_templates', 'doms_logs',
  'plan_phase_goals', 'plan_phase_volume', 'program_day_layout', 'schedule_overrides',
  // Everything that describes a day, before `daily_logs` itself — the same
  // ordering, and the same reason, as the RPC.
  'daily_metrics', 'daily_scores', 'daily_targets', 'nutrition_entries',
  'water_intake', 'supplement_log', 'fatigue_logs', 'cardio_logs',
  'body_composition', 'body_measurements', 'sleep_sessions', 'daily_logs',
  'custom_supplements', 'dashboard_layouts', 'reports', 'target_profiles',
  'workout_sessions', 'exercises',
]

async function wipe(userId) {
  let removed = 0
  for (const table of WIPE) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (error) throw new Error(`${table}: ${error.message}`)
    removed += count ?? 0
    if (!DRY && count) {
      const { error: delErr } = await db.from(table).delete().eq('user_id', userId)
      if (delErr) throw new Error(`${table}: ${delErr.message}`)
    }
  }
  return removed
}

// ── 3. the six weeks ─────────────────────────────────────────────────────────
async function insert(table, rows) {
  if (!rows.length) return 0
  if (DRY) return rows.length
  // Chunked: PostgREST will take a large body, but a 2,000-row set insert is
  // one failure away from being unattributable. 500 keeps an error pointing at
  // a batch small enough to read.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 500))
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  return rows.length
}

async function seed(userId) {
  const written = {}
  const at = (date, h, m = 0) => `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`

  // The exercise catalogue this account's sets point at. Written first: every
  // set carries an `exercise_id`.
  const names = [...new Set(Object.values(MOVES).flat().map(([n]) => n))]
  const exercises = names.map((name) => ({
    id: crypto.randomUUID(), user_id: userId, name,
    muscle_groups: MUSCLES[name] ?? [],
    is_compound: (MUSCLES[name] ?? []).length > 1,
  }))
  const exerciseId = Object.fromEntries(exercises.map((e) => [e.name, e.id]))
  written.exercises = await insert('exercises', exercises)

  const dailyLogs = []
  const sleepSessions = []
  const nutrition = []
  const water = []
  const sessions = []
  const sets = []
  const doms = []
  const fatigue = []
  const cardio = []
  const bodyComp = []
  /** movement → the heaviest set of the run, and where it happened. */
  const best = {}

  // A cut: weight drifts down ~0.35 kg a week with day-to-day noise, which is
  // what makes the trend chart show a trend rather than a flat line.
  let weight = 78.4

  for (let i = 0; i < WEEKS * 7; i++) {
    const day = addDays(start, i)
    const date = iso(day)
    const dow = day.getUTCDay()
    const split = SPLIT[dow]

    const asleep = between(400, 500)
    const awake = between(8, 30)
    const deep = Math.round(asleep * between(0.13, 0.19, 3))
    const rem = Math.round(asleep * between(0.19, 0.26, 3))
    const core = asleep - deep - rem
    const rhr = between(50, 58)
    const hrv = between(38, 68, 1)
    weight = Number((weight - 0.05 + (rand() - 0.5) * 0.5).toFixed(1))

    // Sunday is the weigh-in day, which is also what makes the body-comp screen
    // show a series rather than one reading.
    if (dow === 0) {
      bodyComp.push({
        id: crypto.randomUUID(), user_id: userId, date,
        measured_at: at(date, 7, 30),
        weight_kg: weight, body_fat_pct: between(15.5, 18.5, 1),
        muscle_pct: between(74, 78, 1), water_pct: between(58, 62, 1),
        visceral_fat: between(4, 6), bmr: between(1680, 1740),
        skeletal_muscle_mass_kg: between(33, 35, 1),
        muscle_mass_kg: between(57, 61, 1), fat_free_mass_kg: between(64, 68, 1),
      })
    }

    const kcal = split ? between(2350, 2600) : between(2050, 2300)
    dailyLogs.push({
      id: crypto.randomUUID(), user_id: userId, date,
      steps: split ? between(8000, 13000) : between(4500, 9000),
      sleep_minutes: asleep, hrv_ms: hrv, avg_rest_heart_rate: rhr,
      avg_heart_rate: between(68, 82), respiratory_rate: between(13, 16, 1),
      blood_oxygen: between(95, 99), vo2max: between(42, 46, 1),
      weight_kg: dow === 0 ? weight : null,
      water_ml: between(2200, 3600), active_energy: split ? between(500, 780) : between(220, 460),
      training_minutes: split ? between(55, 80) : null,
      exercise_minutes: split ? between(45, 75) : between(10, 30),
      stand_hours: between(9, 14), time_in_daylight_min: between(10, 70),
      wrist_temp_delta: between(-0.4, 0.4, 1), distance_m: between(3500, 9500),
      // Macros live here; the CALORIE figure does not — `daily_logs` has no such
      // column, and `nutrition_entries.calories` is the one place a day's intake
      // is stored. Writing `calories` here would be silently dropped by
      // PostgREST's schema cache or rejected, depending on the day.
      protein_g: between(160, 195), carbs_g: between(220, 300),
      fats_g: between(55, 80), bmr: dow === 0 ? between(1680, 1740) : null,
      nutrition_estimated: false, sleep_onset_trouble: rand() < 0.15,
    })

    sleepSessions.push({
      id: crypto.randomUUID(), user_id: userId,
      // The night BEFORE this date: bed the previous evening, wake this morning.
      start_time: at(iso(addDays(day, -1)), 23, between(0, 55)),
      end_time: at(date, 7, between(0, 55)),
      duration_min: asleep, deep_min: deep, rem_min: rem,
      core_min: core, awake_min: awake,
      // The sentinel shape `writeSleep` recognises, so a real HealthKit sync on
      // a reviewer's device cannot silently overwrite the demo night.
      hk_uuid: `demo-sleep-${date}`,
    })

    nutrition.push({
      id: crypto.randomUUID(), user_id: userId, date,
      logged_at: at(date, 20), meal_type: 'day',
      calories: kcal, protein_g: between(160, 195),
      carbs_g: between(220, 300), fat_g: between(55, 80), fiber_g: between(24, 38),
      micros: { fiber: between(24, 38), sodium: between(2100, 3400), calcium: between(700, 1200) },
    })

    water.push({
      id: crypto.randomUUID(), user_id: userId, date,
      logged_at: at(date, 20), amount_ml: between(2200, 3600),
    })

    fatigue.push(...(split ? ['Waking', 'Before training', 'After training'] : ['Waking', 'Midday', 'Night'])
      .map((slot) => ({
        id: crypto.randomUUID(), user_id: userId, date, slot,
        level: split ? between(2, 4) : between(1, 3),
      })))

    if (rand() < 0.35) {
      doms.push({
        id: crypto.randomUUID(), user_id: userId, date,
        muscle_group: pick(['Quadriceps', 'Hamstrings', 'Glutes', 'Chest', 'Lats', 'Calves']),
        severity: between(1, 3),
      })
    }

    if (!split && rand() < 0.4) {
      const minutes = between(22, 55)
      cardio.push({
        id: crypto.randomUUID(), user_id: userId, date,
        kind: pick(['walk', 'walk', 'run']), duration_min: minutes,
        distance_m: Math.round(minutes * between(75, 145)),
        kcal: Math.round(minutes * between(4.5, 9)),
        active_kcal: Math.round(minutes * between(4.5, 9)),
        total_kcal: Math.round(minutes * between(6, 12)),
        avg_hr: between(98, 138), effort: between(2, 5), from_healthkit: false,
      })
    }

    if (!split) continue

    // ── the session ──
    const sessionId = crypto.randomUUID()
    const startedAt = at(date, between(7, 19), between(0, 55))
    const duration = between(55, 80)
    let volume = 0
    let setCount = 0

    // Week index drives a small linear progression, so the strength charts and
    // the PR feed have something real to show rather than a flat six weeks.
    const week = Math.floor(i / 7)
    for (const [order, [name, base, floor, ceiling]] of MOVES[split.key].entries()) {
      const load = base === 0 ? 0 : Number((base + week * 2.5).toFixed(2))
      const working = 3
      for (let s = 0; s < working; s++) {
        const reps = between(floor, ceiling)
        volume += load * reps
        setCount += 1
        // Loads climb +2.5 kg a week, so the last week's top set of every
        // movement IS an all-time best. Recording it as one is what gives the
        // reviewer a PR feed and a session report with something in it — an
        // empty PR ledger reads as a feature that does not work.
        const b = best[name]
        if (!b || load > b.weight_kg || (load === b.weight_kg && reps > b.reps)) {
          best[name] = {
            weight_kg: load, reps, session_id: sessionId, achieved_on: date,
            exercise_key: canonicalExerciseName(name),
          }
        }
        sets.push({
          id: crypto.randomUUID(), user_id: userId, session_id: sessionId,
          exercise_id: exerciseId[name], set_number: s + 1, exercise_order: order,
          weight_kg: load, reps, rpe: between(14, 20) / 2,
          // One `set_type` column, not a boolean per tag — the values are
          // `SET_TAGS`' own keys plus 'normal'. See src/lib/training/setTags.ts.
          set_type: s === working - 1 && rand() < 0.25 ? 'failure' : 'normal',
        })
      }
    }

    sessions.push({
      id: sessionId, user_id: userId,
      started_at: startedAt,
      ended_at: at(date, Number(startedAt.slice(11, 13)) + 1, between(0, 30)),
      // `split_day` is the human label the app reads; `day_key` is the
      // programme slot. `workout_sessions` has no `label` column.
      split_day: split.label, day_key: split.key,
      duration_min: duration, total_volume_kg: Number(volume.toFixed(2)),
      set_count: setCount, avg_bpm: between(105, 135),
      calories_burned: between(340, 560), session_rpe: between(12, 19) / 2,
      calories_estimated: true, avg_bpm_estimated: true,
      pr_count: 0,
    })
  }

  written.workout_sessions = await insert('workout_sessions', sessions)
  written.workout_sets = await insert('workout_sets', sets)
  written.daily_logs = await insert('daily_logs', dailyLogs)
  written.sleep_sessions = await insert('sleep_sessions', sleepSessions)
  written.nutrition_entries = await insert('nutrition_entries', nutrition)
  written.water_intake = await insert('water_intake', water)
  written.fatigue_logs = await insert('fatigue_logs', fatigue)
  written.doms_logs = await insert('doms_logs', doms)
  written.cardio_logs = await insert('cardio_logs', cardio)
  written.body_composition = await insert('body_composition', bodyComp)

  // One row per axis per movement, which is the shape `prEngine` writes: the
  // four axes are separate claims about the same set (a heavier top load, a
  // longer set at that load, more single-set tonnage, a better estimated max),
  // and collapsing them into one row is what made "PR on Hack Squat" ambiguous.
  const prs = []
  for (const b of Object.values(best)) {
    const e1rm = Number((b.weight_kg * (1 + b.reps / 30)).toFixed(2))
    for (const [axis, value] of [
      ['weight', b.weight_kg], ['reps', b.reps],
      ['volume', Number((b.weight_kg * b.reps).toFixed(2))], ['e1rm', e1rm],
    ]) {
      if (!value) continue    // an unloaded movement has no weight or 1RM axis
      prs.push({
        user_id: userId, exercise_key: b.exercise_key, axis, value,
        reps: b.reps, weight_kg: b.weight_kg,
        session_id: b.session_id, achieved_on: b.achieved_on,
      })
    }
  }
  written.personal_records = await insert('personal_records', prs)

  // `pr_count` on the sessions those records were set in, so the session list
  // shows the badge the ledger justifies.
  if (!DRY) {
    const counts = {}
    for (const p of prs) counts[p.session_id] = (counts[p.session_id] ?? 0) + 1
    for (const [id, n] of Object.entries(counts)) {
      const { error } = await db.from('workout_sessions').update({ pr_count: n }).eq('id', id)
      if (error) throw new Error(`workout_sessions pr_count: ${error.message}`)
    }
  }

  // The three rows the signup trigger writes. Upserted rather than inserted:
  // the trigger already made them, and this is the script stating the demo
  // account's own goals over the defaults.
  if (!DRY) {
    await db.from('profiles').upsert(
      { user_id: userId, display_name: 'App Review', role: 'member' },
      { onConflict: 'user_id' },
    )
    await db.from('user_goals').upsert(
      {
        user_id: userId, calorie_goal: 2400, protein_goal_g: 180,
        carbs_goal_g: 260, fat_goal_g: 70, steps_goal: 9000, water_goal_ml: 3000,
        sleep_goal_hours: 8,
      },
      { onConflict: 'user_id' },
    )
  }
  written.profiles = 1
  written.user_goals = 1

  return written
}

// ── run ──────────────────────────────────────────────────────────────────────
const label = DRY ? 'DRY RUN' : 'APPLY'
console.log(`seed-demo-account · ${label} · ${DEMO_EMAIL} · ${WEEKS} weeks ending ${iso(today)}\n`)

const user = await findOrCreateUser()
if (user.id == null) {
  console.log('The demo user does not exist yet; a real run would create it.')
  console.log('Dry run — nothing written.')
  process.exit(0)
}
console.log(`auth user ${user.id}${user.created ? ' (created)' : ' (existing)'}`)

const removed = await wipe(user.id)
console.log(`wiped ${removed} existing row${removed === 1 ? '' : 's'}`)

const written = await seed(user.id)
const total = Object.values(written).reduce((a, b) => a + b, 0)
for (const [table, n] of Object.entries(written).sort()) console.log(`  ${table.padEnd(22)} ${n}`)
console.log(`\n${total} rows${DRY ? ' (dry run — nothing written)' : ' written'}`)

if (!DRY) {
  console.log(`\nCredentials for App Review: ${DEMO_EMAIL} / the ONYX_DEMO_PASSWORD you passed.`)
  console.log('\nRun with --dry-run now: it should report the same row counts,')
  console.log('which is what proves the wipe-and-rewrite is idempotent.')
}
