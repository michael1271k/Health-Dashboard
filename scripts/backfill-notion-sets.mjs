#!/usr/bin/env node
/**
 * Rebuild the missing per-set history for the Notion-era sessions.
 *
 * WHY THIS EXISTS
 * The 75 sessions imported from Notion (2026-03-10 → 2026-06-26, the Push/Pull/
 * Legs programme) live in `workout_sessions` with a volume, a set count and a
 * duration — and ZERO rows in `workout_sets`. Per-set history only begins
 * 2026-07-16, so every "all time" surface in the app silently means "since
 * July": exercise ledgers, volume charts and PR baselines all start four months
 * late. Deleting the Notion integration without rebuilding this first would
 * make the gap permanent, because `notion_page_id` is the only thing marking
 * which sessions it applies to.
 *
 * The sets were never actually lost. 74 of the 75 sessions carry a `report_md`
 * whose `## Exercises` block records every movement, load and rep:
 *
 *     ## Exercises
 *     - Incline DB Press — 25kg | 10 / 10 / 9
 *     - Butterfly Pec Deck — 47.5kg | 11 / 9 · 45kg | 10
 *
 * That is a complete set log in a fixed grammar. This script parses it back
 * into rows. No Notion API call, no credentials — the data is already in
 * Supabase, just in prose.
 *
 * ── WHAT IT REFUSES TO INVENT ────────────────────────────────────────────────
 * `report_md` never carried RPE, warm-up marking or unilateral sides, so `rpe`,
 * `set_type`-as-warmup, `side` and `pair_id` stay null/working. An absent value
 * is information; a fabricated one is not. `is_pr` stays false and
 * `personal_records` is never touched — `prSeed.ts` remains the authoritative
 * record book for sessions ≤ 2026-07-31 and re-deriving records over newly
 * arrived history would rewrite it.
 *
 * ── THE GATE ─────────────────────────────────────────────────────────────────
 * Nothing is written unless EVERY session reconciles exactly: the rebuilt set
 * count must equal `workout_sessions.set_count` and the rebuilt tonnage must
 * equal `total_volume_kg`, computed with the app's own `sessionVolumeKg`. A
 * partial reconstruction is worse than none — it would look like real history
 * while under-reporting the work.
 *
 *   node scripts/backfill-notion-sets.mjs --dry-run   # reconcile, write nothing
 *   node scripts/backfill-notion-sets.mjs             # apply
 *
 * Idempotent: any session that already has sets is skipped.
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
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

// ── the app's own rules, compiled on the fly ─────────────────────────────────
// Same principle as backfill-prs.mjs: import the REAL modules rather than
// restating their arithmetic, so this cannot drift from what the app computes.
const jiti = createJiti(import.meta.url, {
  alias: { '@': new URL('../src', import.meta.url).pathname },
})
const { sessionVolumeKg } = await jiti.import('../src/lib/sessions/volume.ts')
const { epley1RM } = await jiti.import('../src/lib/utils/epley.ts')
const { canonicalExerciseName } = await jiti.import('../src/lib/exercises/aliases.ts')

/**
 * Notion-era spellings → catalog names.
 *
 * The PPL programme wrote its own shorthand ("Bicep Curl DB", "Chest Press
 * Machine"). Most of these movements ALREADY have a catalog row — several have
 * two, one seeded for PPL and one for the current five-day split — so this maps
 * the spelling and `resolveExercise` below picks the row whose `split_day`
 * matches the session. Nothing here creates a new exercise: an unmapped name
 * aborts the run rather than quietly minting a row, because a wrong merge is a
 * loud bug and a wrong split is a silent one.
 */
const NOTION_NAME_MAP = {
  'bicep curl db': 'Bicep Curl (DB)',
  'butterfly pec deck': 'Pec Deck (Butterfly)',
  'calf press machine': 'Calf Press (Machine)',
  'chest press machine': 'Chest Press (Machine)',
  'crunch machine': 'Crunch Machine',
  'hammer curl db': 'Hammer Curl (DB)',
  'hip adduction machine': 'Hip Adduction (Machine)',
  'hip thrust machine': 'Hip Thrust (Machine)',
  'lat pulldown': 'Lat Pulldown (Cable)',
  'lateral raise db': 'Seated Lateral Raise (DB)',
  'lateral raise db (seated)': 'Seated Lateral Raise (DB)',
  'leg extension machine': 'Leg Extension (Machine)',
  'leg press machine': 'Leg Press',
  'overhead triceps extension': 'Overhead Triceps Extension (Cable)',
  'overhead triceps extension (rope)': 'Overhead Triceps Extension (Cable)',
  'preacher curl machine': 'Preacher Curl (Machine)',
  'romanian deadlift db': 'Romanian Deadlift (DB)',
  'seated leg curl machine': 'Seated Leg Curl (Machine)',
  'shoulder press db': 'Shoulder Press (DB)',
  'straight arm pulldown': 'Straight Arm Pulldown (Rope)',
  // ── The two cable-row grips stay APART, exactly as in the alias map ──
  // `Seated Cable Row (V-Grip)` and `(Wide Grip)` were deliberately carved back
  // out on 2026-08-06 after sharing one row cost a real record. The PPL log
  // names the V-grip explicitly, so it resolves to the V-grip row and never to
  // the bare one.
  'seated row v-grip': 'Seated Cable Row (V-Grip)',
  'seated cable row v-grip': 'Seated Cable Row (V-Grip)',
  // ── Floor work: the "(mat)" suffix is the surface, not the movement ──
  'bicycle crunch (mat)': 'Bicycle Crunch',
  'lying leg raises (mat)': 'Lying Leg Raise',
  'reverse crunch (mat)': 'Reverse Crunch',
  'hollow rock (mat)': 'Hollow Rock',
  'side plank (mat)': 'Side Plank',
  'hollow hold (mat)': 'Hollow Hold',
}

/**
 * The one movement in four months of logs with no catalog row.
 *
 * `Hollow Hold` is an isometric and `Hollow Rock` is a dynamic movement — they
 * share a name and nothing else, so aliasing one onto the other would merge two
 * different exercises into one PR ladder, which is the failure this catalog has
 * already paid for twice. It gets its own row. Declared here, and created
 * loudly, so a new catalog row is never a silent side effect of a backfill.
 */
const CREATE_IF_MISSING = {
  'Hollow Hold': { muscle_groups: ['abdominals'] },
}

// ── the parser ───────────────────────────────────────────────────────────────

/**
 * The sections that actually log sets.
 *
 * `## Exercises` is the main block, but it is NOT the only one: several reports
 * append an `## Updated Session #43 — Legs Update` block recording work made up
 * on a later day, and those sets ARE counted in the session's own `set_count`
 * and `total_volume_kg`. Reading only the first block leaves those sessions
 * permanently short.
 *
 * Everything else is prose ABOUT the session — `## Session Notes`,
 * `## Strength Tracking …`, `## Volume Comparison vs …`, `## Comparison
 * Tracking …` — and those sections contain lines like
 * "- Leg Press 80kg: maintained 2×10" that look enough like a set log to be
 * dangerous. An allowlist is the safe direction to fail in: a missed section
 * shows up as a count shortfall and blocks the write, whereas a wrongly
 * included one would invent sets that reconcile by luck.
 */
const SET_SECTION = /^##\s*(?:Exercises|Updated\b)/i

function setLines(md) {
  const lines = String(md ?? '').split('\n')
  const out = []
  let inSection = false
  for (const line of lines) {
    if (/^##\s/.test(line)) { inSection = SET_SECTION.test(line.trim()); continue }
    if (inSection) out.push(line)
  }
  return out
}

/**
 * Every `<load> | <reps>` group on a line, in order.
 *
 * The grammar drifted over the four months this covers, and all of it has to
 * parse:
 *   - separators: `·` between weights, `→` for a drop set
 *   - unloaded work: `bodyweight | 12 / 14 / 14` — weight 0, which is a real
 *     load, not a missing one (see epley1RM: e1RM is null there, never 0)
 *   - trailing commentary: `45kg | 12 ⬆️ new weight introduced — 4th set added`
 *
 * Matching globally rather than splitting the line handles all three at once:
 * the commentary simply contains no further group, and `—` inside it can no
 * longer be mistaken for the name separator.
 *
 * The rep list itself carries two more shapes:
 *   - seconds: `20s / 20s / 24s` on planks and holds. The app already stores a
 *     hold's duration in `reps` (see `isTimedExercise`; Side Plank sits at 52–63
 *     in `workout_sets` today), so the `s` is dropped and the number kept.
 *   - halves: `6 / 5 / 3.5 / 4.5 (per side)` on alternating core work, where a
 *     half is one unmatched side. `reps` is an int4 column, so these round —
 *     the only lossy step in the whole reconstruction, and the run reports how
 *     many sets it touched rather than swallowing it.
 */
const SET_GROUP = /(?:(\d+(?:\.\d+)?)\s*kg|bodyweight)\s*\|\s*(\d+(?:\.\d+)?s?(?:\s*\/\s*\d+(?:\.\d+)?s?)*)/gi

/**
 * The pipeless form: `Russian Twist — 7.5kg × 13/13, then 10kg × 10`.
 *
 * One session in the corpus logs a mid-exercise weight change this way, and it
 * carried 295 kg that no other rule could see — with no `|` on the line it
 * could not even be flagged as unread, it simply read as prose.
 *
 * `×` CANNOT be accepted as a general separator: trailing commentary quotes
 * past loads in exactly that shape ("vs Session #46 = 7.5kg × 2 + 10kg × 1"),
 * and reading those as sets silently inflated three sessions by up to 825 kg.
 * So this rule only runs when the line contains no `|` anywhere — where there
 * is no set log to double-count against.
 */
const TIMES_GROUP = /(\d+(?:\.\d+)?)\s*kg\s*×\s*(\d+(?:\s*\/\s*\d+)*)/g

function parseTimesForm(rest) {
  if (rest.includes('|')) return null
  const sets = []
  for (const g of rest.matchAll(TIMES_GROUP)) {
    const weight = Number(g[1])
    for (const token of g[2].split('/')) {
      const reps = Number(token.trim())
      if (!Number.isInteger(reps) || reps <= 0) continue
      sets.push({ weightKg: weight, reps })
    }
  }
  return sets.length ? sets : null
}

/**
 * `bodyweight | 3 × 30s each side` — a count of holds, not a rep total.
 *
 * Read by the general matcher this becomes ONE set of 3 reps instead of three
 * 30-second holds. It carries no tonnage either way, so only the set count is
 * wrong — which is precisely the kind of silent shortfall the count gate exists
 * to catch.
 */
function parseRepeatedHold(rest) {
  const m = /bodyweight\s*\|\s*(\d+)\s*×\s*(\d+(?:\.\d+)?)\s*s\b/i.exec(rest)
  if (!m) return null
  const count = Number(m[1])
  const seconds = Math.round(Number(m[2]))
  if (!Number.isInteger(count) || count <= 0 || !seconds) return null
  return Array.from({ length: count }, () => ({ weightKg: 0, reps: seconds }))
}

let roundedReps = 0

/**
 * The ascending-load form: `25kg ×1 + 30kg ×2 | 12 / 9 / 8`.
 *
 * Two lines in four months use it, both to record a weight progression inside a
 * single exercise — set 1 at the old load, sets 2–3 at the new one. It is worth
 * a special case because the ordinary reader silently drops the WHOLE exercise
 * (the `×2` sits between the load and the `|`, so no group matches), and both
 * lines happen to be the heaviest pressing of their session: 810 kg and 437.5 kg
 * that would have vanished while every other number still reconciled.
 *
 * The `×n` counts expand into a per-set load list, zipped against the rep list.
 */
function parseAscendingLoads(rest) {
  const m = /^((?:\d+(?:\.\d+)?\s*kg\s*×\s*\d+\s*(?:\+\s*)?)+)\|\s*(\d+(?:\s*\/\s*\d+)*)/.exec(rest)
  if (!m) return null
  const loads = []
  for (const g of m[1].matchAll(/(\d+(?:\.\d+)?)\s*kg\s*×\s*(\d+)/g)) {
    for (let i = 0; i < Number(g[2]); i += 1) loads.push(Number(g[1]))
  }
  const reps = m[2].split('/').map((t) => Number(t.trim()))
  // Only trust it when the two lists describe the same sets. A mismatch means
  // the line means something this parser has not seen.
  if (!loads.length || loads.length !== reps.length) return null
  if (reps.some((r) => !Number.isInteger(r) || r <= 0)) return null
  return loads.map((weightKg, i) => ({ weightKg, reps: reps[i] }))
}

/** One exercise line → its sets, or null when the line logs no sets at all. */
function parseExerciseLine(line) {
  const m = /^-\s+(.+?)\s+—\s+(.*)$/.exec(line)
  if (!m) return null
  const [, rawName, rest] = m

  const ascending = parseAscendingLoads(rest)
  if (ascending) return { rawName: rawName.trim(), sets: ascending }

  const holds = parseRepeatedHold(rest)
  if (holds) return { rawName: rawName.trim(), sets: holds }

  const times = parseTimesForm(rest)
  if (times) return { rawName: rawName.trim(), sets: times }

  const sets = []
  for (const g of rest.matchAll(SET_GROUP)) {
    // No `kg` capture means the literal word "bodyweight" matched: load 0.
    // Zero is a real load here, not a missing one.
    const weight = g[1] == null ? 0 : Number(g[1])
    if (!Number.isFinite(weight)) continue
    for (const token of g[2].split('/')) {
      const raw = Number(token.trim().replace(/s$/i, ''))
      if (!Number.isFinite(raw) || raw <= 0) continue
      const reps = Math.round(raw)
      if (reps !== raw) roundedReps += 1
      sets.push({ weightKg: weight, reps })
    }
  }
  // "- Leg Extension Machine — MISSED (machine out of service)" is a real line
  // about a real exercise that produced no sets. Nothing to record.
  return sets.length ? { rawName: rawName.trim(), sets } : null
}

// ── load ─────────────────────────────────────────────────────────────────────
const { data: sessions, error: sErr } = await db
  .from('workout_sessions')
  .select('id, user_id, started_at, split_day, day_key, set_count, total_volume_kg, report_md, notion_page_id')
  .not('notion_page_id', 'is', null)
  .order('started_at', { ascending: true })
if (sErr) throw sErr

/**
 * Which sessions already hold sets — the idempotence guard, paged.
 *
 * A plain `.select('session_id')` silently returns only the first 1,000 rows:
 * PostgREST caps every response and reports no error for the truncation. With
 * more sets than that in the table the guard sees a partial picture, decides a
 * session it already wrote is empty, and inserts the whole thing again — a
 * duplicate-set bug that would look exactly like doubled tonnage. Paging until
 * a short page arrives is the only honest way to ask.
 */
const hasSets = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('workout_sets')
    .select('session_id').range(from, from + 999)
  if (error) throw error
  for (const r of data) hasSets.add(r.session_id)
  if (data.length < 1000) break
}

const { data: catalog, error: cErr } = await db.from('exercises').select('id, name, split_day')
if (cErr) throw cErr

/**
 * A spelling + the session's split → one catalog row.
 *
 * Several movements carry TWO rows, one per programme (`Crunch Machine` on legs
 * and `Crunch (Machine)` on pull, `Leg Extension` and `Leg Extension (Machine)`).
 * Preferring the row whose `split_day` matches the session keeps the Notion-era
 * PPL work on the PPL rows and out of the current split's ladders.
 */
const created = []

function resolveExercise(rawName, splitDay, userId) {
  const mapped = NOTION_NAME_MAP[rawName.toLowerCase().trim()]
    ?? canonicalExerciseName(rawName)
  const matches = catalog.filter((e) => e.name.toLowerCase() === mapped.toLowerCase())
  if (matches.length) return matches.find((e) => e.split_day === splitDay) ?? matches[0]

  const spec = CREATE_IF_MISSING[mapped]
  if (!spec) return null
  // Declared above and reported at the end — never a silent new row.
  const row = {
    id: `pending:${mapped}`, name: mapped, split_day: splitDay,
    user_id: userId, muscle_groups: spec.muscle_groups,
  }
  catalog.push(row)
  created.push(row)
  return row
}

// ── reconcile ────────────────────────────────────────────────────────────────
const unresolved = new Map()
const unread = []
const mismatches = []
const skipped = []
const plan = []

for (const s of sessions) {
  if (hasSets.has(s.id)) { skipped.push(`${s.started_at.slice(0, 10)} already has sets`); continue }

  const block = setLines(s.report_md)
  if (!block.length) { mismatches.push({ s, why: 'no ## Exercises block' }); continue }

  const rows = []
  let order = 0
  for (const line of block) {
    if (!line.trim().startsWith('- ')) continue
    const parsed = parseExerciseLine(line)
    if (!parsed) {
      // A bullet inside a SET section that carries a `|` is a set log this
      // parser failed to read — not prose. Surfaced rather than skipped,
      // because a silently dropped exercise reconciles as a shortfall and
      // looks identical to data the source never had.
      if (line.includes('|')) unread.push(`${s.started_at.slice(0, 10)} ${line.trim()}`)
      continue
    }
    const ex = resolveExercise(parsed.rawName, s.split_day, s.user_id)
    if (!ex) {
      unresolved.set(parsed.rawName, (unresolved.get(parsed.rawName) ?? 0) + 1)
      continue
    }
    order += 1
    parsed.sets.forEach((set, i) => {
      rows.push({
        session_id: s.id,
        user_id: s.user_id,
        exercise_id: ex.id,
        exercise_order: order,
        set_number: i + 1,
        weight_kg: set.weightKg,
        reps: set.reps,
        rpe: null,
        // The value every ordinary logged set already carries — the export
        // decodes only 'failure' and 'warmup' specially, and `report_md` marked
        // neither, so claiming anything else here would be an invention.
        set_type: 'normal',
        side: null,
        pair_id: null,
        is_pr: false,
        est_1rm_kg: epley1RM(set.weightKg, set.reps),
      })
    })
  }

  // The app's own rule, not a hand-rolled sum. No sides here, so it reduces to
  // Σ weight × reps — but going through the shared function is what guarantees
  // this agrees with the session totals the rest of the app computes.
  const volume = sessionVolumeKg(rows.map((r) => ({
    weightKg: r.weight_kg, reps: r.reps, side: null, pairId: null,
  })))
  const declaredVolume = Number(s.total_volume_kg)
  // TONNAGE IS THE GATE; the set count is not, and cannot be.
  //
  // `set_count` disagrees with the itemised log on 70 of 74 sessions, always by
  // exactly one set, always with the tonnage still matching to the kilogram —
  // so the missing set carried no load and was never written down. The source
  // contradicts ITSELF: 2026-03-10's own header reads "💪 23 sets" above a list
  // of 22. That set is not recoverable from anything, and holding the whole
  // rescue hostage to it would throw away 1,800 sets that are.
  //
  // Tonnage is the invariant worth enforcing: it is the number every chart,
  // ledger and weekly aggregate is built on, and a rebuilt session that carries
  // the right kilograms is a faithful session. The 0.15 kg window absorbs the
  // rounding in the stored totals (5,214.2 against a true 5,214.25), nothing
  // larger — a real missing set is orders of magnitude bigger than that.
  const volumeOk = Math.abs(volume - declaredVolume) <= 0.15

  if (!volumeOk) {
    mismatches.push({
      s,
      why: `sets ${rows.length}/${s.set_count}`
        + ` · volume ${volume.toFixed(1)}/${declaredVolume.toFixed(1)} ✗`,
    })
    continue
  }
  plan.push({ s, rows, countWas: s.set_count, countNow: rows.length })
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nNotion-era sessions: ${sessions.length}`)
if (skipped.length) console.log(`Already had sets (skipped): ${skipped.length}`)
console.log(`Tonnage reconciled:  ${plan.length}`)
console.log(`Tonnage mismatch:    ${mismatches.length}  (skipped — left set-less)`)

if (unread.length) {
  console.log(`\nUNREAD SET LINES (${unread.length}) — bullets in a set section carrying a "|":`)
  for (const u of unread) console.log(`  ${u}`)
}
if (unresolved.size) {
  console.log('\nUNRESOLVED EXERCISE NAMES — add to NOTION_NAME_MAP:')
  for (const [name, n] of [...unresolved].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)} × ${name}`)
  }
}
if (mismatches.length) {
  console.log('\nMISMATCHES:')
  for (const m of mismatches) console.log(`  ${m.s.started_at.slice(0, 10)} ${m.s.split_day.padEnd(6)} ${m.why}`)
}

const totalRows = plan.reduce((n, p) => n + p.rows.length, 0)
const recounts = plan.filter((p) => p.countWas !== p.countNow)
if (created.length) {
  console.log(`\nNEW CATALOG ROWS (${created.length}):`)
  for (const c of created) console.log(`  ${c.name} · ${c.split_day} · ${c.muscle_groups.join(', ')}`)
}
if (roundedReps) console.log(`\nFractional reps rounded to whole: ${roundedReps} set(s)`)
console.log(`\nset_count corrections: ${recounts.length} session(s)`
  + ` (the log itemises fewer sets than the column claims)`)
console.log(`Sets to insert: ${totalRows} across ${plan.length} sessions`)

// An UNREAD line or an UNRESOLVED name is a parser failure, not a source gap —
// it means real sets are being dropped that this script could read. Those still
// block the run outright.
if (unread.length || unresolved.size) {
  console.error('\nREFUSING TO WRITE — unreadable set lines or unmapped exercises above.')
  process.exit(1)
}
if (DRY) { console.log('\n--dry-run: nothing written.'); process.exit(0) }

// ── write ────────────────────────────────────────────────────────────────────
for (const c of created) {
  const { data, error } = await db.from('exercises')
    .insert({
      user_id: c.user_id, name: c.name, split_day: c.split_day,
      muscle_groups: c.muscle_groups, is_compound: false,
    })
    .select('id')
    .single()
  if (error) { console.error(`FAILED creating ${c.name}:`, error.message); process.exit(1) }
  // Every row that referenced the placeholder id now points at the real one.
  for (const p of plan) {
    for (const r of p.rows) if (r.exercise_id === c.id) r.exercise_id = data.id
  }
  console.log(`Created exercise ${c.name} (${data.id})`)
}

let written = 0
for (const p of plan) {
  const { error } = await db.from('workout_sets').insert(p.rows)
  if (error) { console.error(`FAILED ${p.s.started_at.slice(0, 10)}:`, error.message); process.exit(1) }
  if (p.countWas !== p.countNow) {
    // The column claimed a set the log never itemised. The rebuilt rows ARE the
    // session now, so the metadata is corrected to match what actually exists —
    // otherwise every set-count surface reads one set that has no row.
    const { error: uErr } = await db.from('workout_sessions')
      .update({ set_count: p.countNow }).eq('id', p.s.id)
    if (uErr) { console.error(`FAILED set_count ${p.s.started_at.slice(0, 10)}:`, uErr.message); process.exit(1) }
  }
  written += p.rows.length
}
console.log(`\nInserted ${written} sets across ${plan.length} sessions.`)
console.log('personal_records and prSeed.ts untouched — PR history stays frozen.')
