/**
 * Seed `routine_templates` from the most recent session of each programme day.
 *
 * The table is written on every commit and every edit, so it fills itself in
 * within one cycle of the split. This script just removes the wait: until a day
 * has been logged once under the new code it has no template, and both the
 * Settings screen and drag-reorder persistence need one to exist.
 *
 * Written as .mts rather than .mjs on purpose: it IMPORTS `payloadToTemplate`
 * instead of restating the grouping. A script with its own copy of that logic is
 * how a stored payload drifts from what the app can read.
 *
 *   npx tsx scripts/backfill-routine-templates.mts [--dry-run] [--only cb_a,legs_a]
 *
 * IDEMPOTENT. A day whose stored template already matches what the source
 * session produces is skipped, so re-running writes nothing. A day that has
 * never been logged is left alone — there is nothing to derive a shape from,
 * and seeding falls through to history exactly as before.
 *
 * `--only` exists because the source session is taken on trust. A day whose
 * most recent session contains a set that should not be there — the very ghost
 * this release removes — would have that set written into its template and
 * reproduced every week after. Seed the clean days, and let the affected one be
 * written by its next real commit.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { payloadToTemplate, parseTemplate, type TemplateSourceSet } from '../src/lib/sessions/routineTemplate'
import { countCommittedSets } from '../src/lib/sessions/schema'

const DRY = process.argv.includes('--dry-run')

const ALL_DAY_KEYS = ['cb_a', 'legs_a', 'arms', 'cb_b', 'legs_b'] as const
const onlyArg = process.argv[process.argv.indexOf('--only') + 1]
const only = process.argv.includes('--only') && onlyArg
  ? new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean))
  : null
const DAY_KEYS = ALL_DAY_KEYS.filter((k) => !only || only.has(k))
if (only) console.log(`--only ${[...only].join(', ')} → ${DAY_KEYS.length} day(s)`)

/**
 * Key-order-independent serialisation, for the idempotency check.
 *
 * `payload` is a jsonb column, and Postgres normalises jsonb object keys (by
 * length, then bytewise) rather than preserving insertion order. So a template
 * written as {name, order, sets} reads back as {name, sets, order} — identical
 * data, different `JSON.stringify`, and the script would have rewritten all five
 * rows on every run while reporting them as changed.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// ── Preflight ────────────────────────────────────────────────────────────────
const { count: existing, error: countErr } = await supabase
  .from('routine_templates').select('*', { count: 'exact', head: true })
if (countErr) {
  console.error('routine_templates unreadable — run the paste-SQL first:', countErr.message)
  process.exit(1)
}
console.log(`${DRY ? '[dry-run] ' : ''}routine_templates currently holds ${existing ?? 0} row(s)`)

let written = 0
let skipped = 0
let missing = 0

for (const dayKey of DAY_KEYS) {
  // The most recent session of this programme day, whoever logged it.
  const { data: sessRows, error: sessErr } = await supabase
    .from('workout_sessions')
    .select('id, user_id, started_at')
    .eq('day_key', dayKey)
    .order('started_at', { ascending: false })
    .limit(1)
  if (sessErr) {
    console.error(`  ${dayKey}: session read failed — ${sessErr.message}`)
    continue
  }
  const session = (sessRows ?? [])[0] as { id: string; user_id: string; started_at: string } | undefined
  if (!session) {
    console.log(`  ${dayKey}: never logged — skipped (seeding falls through to history)`)
    missing += 1
    continue
  }

  const { data: setRows, error: setsErr } = await supabase
    .from('workout_sets')
    .select('weight_kg, reps, set_type, exercise_order, set_number, side, pair_id, exercises!inner(name)')
    .eq('session_id', session.id)
    .order('exercise_order', { ascending: true })
    .order('set_number', { ascending: true })
  if (setsErr) {
    console.error(`  ${dayKey}: sets read failed — ${setsErr.message}`)
    continue
  }

  const sets: TemplateSourceSet[] = ((setRows ?? []) as unknown as Array<{
    weight_kg: number; reps: number; set_type: string | null
    exercise_order: number | null; side: string | null; pair_id: string | null
    exercises: { name: string }
  }>).map((r) => ({
    exerciseName: r.exercises.name,
    weightKg: r.weight_kg,
    reps: r.reps,
    setType: r.set_type,
    exerciseOrder: r.exercise_order,
    side: r.side,
    pairId: r.pair_id,
  }))

  const template = payloadToTemplate(sets)
  if (!template) {
    console.log(`  ${dayKey}: latest session (${session.started_at.slice(0, 10)}) has no sets — skipped`)
    missing += 1
    continue
  }

  // Idempotency: compare against what is already stored.
  const { data: current } = await supabase
    .from('routine_templates').select('payload')
    .eq('user_id', session.user_id).eq('day_key', dayKey).maybeSingle()
  const stored = parseTemplate((current as { payload?: unknown } | null)?.payload)
  if (stored && canonical(stored) === canonical(template)) {
    console.log(`  ${dayKey}: already up to date — skipped`)
    skipped += 1
    continue
  }

  // PHYSICAL sets, not rows. A unilateral pair is two rows and one set, and
  // printing the row count is how "4 sets" would be read off a day that was
  // three — the exact confusion this whole change exists to remove.
  const summary = template.exercises
    .map((e) => {
      const rows = e.sets.length
      const physical = countCommittedSets(e.sets)
      return `${e.name} ×${physical}${rows === physical ? '' : ` (${rows} rows)`}`
    })
    .join(', ')
  console.log(`  ${dayKey}: ${DRY ? 'would write' : 'writing'} from ${session.started_at.slice(0, 10)} — ${template.exercises.length} exercises (${summary})`)

  if (DRY) { written += 1; continue }

  const { error: upErr } = await supabase.from('routine_templates').upsert({
    user_id: session.user_id,
    day_key: dayKey,
    payload: template,
    source_session_id: session.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,day_key' })
  if (upErr) console.error(`  ${dayKey}: upsert failed — ${upErr.message}`)
  else written += 1
}

console.log(
  `\n${DRY ? '[dry-run] would write' : 'wrote'} ${written} · skipped ${skipped} (unchanged) · ${missing} day(s) with nothing to derive from`,
)
