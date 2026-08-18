/**
 * Recompute `workout_sessions.total_volume_kg` under the corrected unilateral rule.
 *
 * WHY THIS EXISTS: until 2026-08-18 a unilateral L/R pair was scored at the
 * weaker side and then counted TWICE — `2 × min(w) × min(reps)` — on the
 * reasoning that both arms did the work. The same physical set is logged both
 * ways in this database, so a split single-arm raise weighed roughly double the
 * identical set logged as one unsided row. See `src/lib/sessions/volume.ts`.
 *
 * `total_volume_kg` is written once at commit, so every session containing a
 * split set carries the old number until it is rewritten. Only those sessions
 * move; everything else recomputes to the value already stored, which is what
 * makes this safe to re-run.
 *
 * IDEMPOTENT: the target is a pure function of the session's sets, so running
 * it twice writes the same figure. Rows whose stored value already matches are
 * skipped entirely (no write, no updated_at churn).
 *
 * Usage:
 *   node scripts/recompute-session-volume.mjs --dry-run     # preflight, writes nothing
 *   node scripts/recompute-session-volume.mjs               # apply
 *   node scripts/recompute-session-volume.mjs --from 2026-07-16
 *
 * Needs .env.local (SUPABASE_SERVICE_ROLE_KEY). Server-only key; never bundled.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(`--${n}`)
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null }
const DRY = flag('dry-run')
const FROM = opt('from') ?? '2000-01-01'

const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

/**
 * The ONE rule, transcribed from `src/lib/sessions/volume.ts`.
 *
 * Deliberately a copy rather than an import: this file is plain ESM run by
 * node, the source is TypeScript behind the `@/` alias, and a build step for a
 * twenty-line function is a worse dependency than the duplication. The unit
 * tests in `src/tests/session-volume.test.ts` guard the original; if the two
 * ever disagree, the original wins and this script is stale.
 */
function sessionVolumeKg(sets) {
  const pairs = new Map()
  let total = 0
  for (const s of sets) {
    const w = Number.isFinite(s.weightKg) ? s.weightKg : 0
    const r = Number.isFinite(s.reps) ? s.reps : 0
    if (s.pairId && (s.side === 'L' || s.side === 'R')) {
      const bucket = pairs.get(s.pairId) ?? []
      bucket.push({ weightKg: w, reps: r, side: s.side })
      pairs.set(s.pairId, bucket)
      continue
    }
    total += w * r
  }
  for (const bucket of pairs.values()) {
    const left = bucket.find((x) => x.side === 'L')
    const right = bucket.find((x) => x.side === 'R')
    if (left && right) {
      total += Math.min(left.weightKg, right.weightKg) * Math.min(left.reps, right.reps)
    } else {
      for (const x of bucket) total += x.weightKg * x.reps
    }
  }
  return Math.round(total * 100) / 100
}

const { data: sessions, error: sErr } = await supabase
  .from('workout_sessions')
  .select('id, started_at, day_key, total_volume_kg')
  .gte('started_at', `${FROM}T00:00:00Z`)
  .order('started_at', { ascending: true })
if (sErr) { console.error(sErr.message); process.exit(1) }

console.log(`${sessions.length} session(s) since ${FROM}.`)

// PREFLIGHT: read every set first and report the damage before touching a row.
const changes = []
for (const s of sessions) {
  const { data: rows, error } = await supabase
    .from('workout_sets')
    .select('weight_kg, reps, side, pair_id')
    .eq('session_id', s.id)
  if (error) { console.error(`  ${s.id}: ${error.message}`); process.exit(1) }
  if (!rows.length) continue          // Notion-era session: no per-set history to recompute from
  const next = sessionVolumeKg(rows.map((r) => ({
    weightKg: Number(r.weight_kg), reps: Number(r.reps), side: r.side, pairId: r.pair_id,
  })))
  const stored = s.total_volume_kg == null ? null : Number(s.total_volume_kg)
  if (stored != null && Math.abs(stored - next) < 0.005) continue
  changes.push({ id: s.id, day: s.started_at.slice(0, 10), dayKey: s.day_key, stored, next })
}

if (!changes.length) { console.log('Nothing to change — every stored total already matches.'); process.exit(0) }

console.log(`\n${changes.length} session(s) would change:`)
for (const c of changes) {
  const delta = c.stored == null ? null : Math.round((c.next - c.stored) * 100) / 100
  console.log(`  ${c.day}  ${String(c.dayKey ?? '—').padEnd(8)}  ${String(c.stored ?? '—').padStart(10)} → ${String(c.next).padStart(10)}  ${delta == null ? '' : `(${delta > 0 ? '+' : ''}${delta})`}`)
}

if (DRY) { console.log('\n--dry-run: nothing written.'); process.exit(0) }

let written = 0
for (const c of changes) {
  const { error } = await supabase
    .from('workout_sessions')
    .update({ total_volume_kg: c.next })
    .eq('id', c.id)
  if (error) { console.error(`  ${c.id}: ${error.message}`); process.exit(1) }
  written += 1
}
console.log(`\nRewrote ${written} session total(s).`)
