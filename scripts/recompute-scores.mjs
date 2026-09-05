/**
 * Re-run the daily scorer over past days.
 *
 * WHY THIS EXISTS: `/api/compute-score` writes `finalized: true` for any day
 * that isn't today, and a finalized row is never revisited. That is correct for
 * data — a sealed day's inputs don't change — but WRONG for a formula change:
 * when the scoring rules are rewritten, every sealed row keeps the number the
 * old rules produced. Today self-corrects on the next sync; history does not.
 *
 * First written for the 2026-08-04 recovery rewrite and deleted once that had
 * run; back for battery v8 (2026-09-05), which changes `battery_pct` on EVERY
 * scored day — the wake charge now reads the stages share and HRV, and the
 * stress term is new — so the candidate set is every `daily_scores` row in the
 * range, not a sleep-filtered subset.
 *
 * Usage:
 *   node scripts/recompute-scores.mjs --dry-run                # every scored day, last 400
 *   node scripts/recompute-scores.mjs 2026-07-15               # one date
 *   node scripts/recompute-scores.mjs --from 2026-07-01 --to 2026-08-04
 *
 * Needs .env.local (SUPABASE_SERVICE_ROLE_KEY for the read, NEXT_PUBLIC_APP_URL
 * or --app-url for the recompute POST). `--env <path>` points at another env
 * file, for a worktree that has none of its own. The service-role key is
 * server-only and never ships in the client bundle.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : null
}

const env = Object.fromEntries(
  readFileSync(opt('env') ?? '.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const DRY = flag('dry-run')
// Bare dates only — a date that is the VALUE of --from / --to is a range bound,
// not a request for that one day (the original filtered every date-shaped
// argument, so `--from X --to Y` recomputed exactly X and Y).
const explicitDates = argv.filter((a, i) => /^\d{4}-\d{2}-\d{2}$/.test(a) && !(i > 0 && argv[i - 1].startsWith('--')))

const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const iso = (d) => d.toISOString().slice(0, 10)
const today = iso(new Date())
const from = opt('from') ?? iso(new Date(Date.now() - 400 * 86400_000))
const to = opt('to') ?? today

// ── which days ───────────────────────────────────────────────────────────────
// Every day that HAS a score row: those are the rows carrying the old number.
// A day with no row is left alone — the ghost guard in `computeForDate` would
// refuse it anyway, and a recompute must not invent history.
let dates = explicitDates
if (!dates.length) {
  const { data, error } = await supabase
    .from('daily_scores')
    .select('date, battery_pct')
    .gte('date', from)
    .lte('date', to)
    .order('date')
  if (error) {
    console.error('read failed:', error.message)
    process.exit(1)
  }
  const rows = data ?? []
  dates = rows.map((r) => r.date)
  console.log(`range ${from} → ${to}: ${rows.length} scored day(s)`)
  for (const r of rows) console.log(`  ${r.date}  battery ${r.battery_pct ?? '—'}%`)
}

if (!dates.length) {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('date, sleep_minutes')
    .gte('date', from)
    .lte('date', to)
    .order('date')
  if (error) {
    console.error('read failed:', error.message)
    process.exit(1)
  }
  const rows = data ?? []
  // The sleep gate only bites below `goal − 1h`; anything at or above it scores
  // identically under both formulas, so recomputing it is pure noise.
  const { data: goalRows } = await supabase.from('user_goals').select('sleep_goal_hours').limit(1)
  const goalHours = goalRows?.[0]?.sleep_goal_hours ?? 8
  const thresholdMin = Math.min(7, Math.max(5, goalHours - 1)) * 60
  dates = rows
    .filter((r) => !SHORT_ONLY || (r.sleep_minutes > 0 && r.sleep_minutes < thresholdMin))
    .map((r) => r.date)

  const short = rows.filter((r) => r.sleep_minutes > 0 && r.sleep_minutes < thresholdMin)
  console.log(`range ${from} → ${to}: ${rows.length} logged days, ${short.length} below the ${thresholdMin / 60}h threshold`)
  for (const r of short) console.log(`  ${r.date}  ${(r.sleep_minutes / 60).toFixed(2)}h`)
}

if (!dates.length) {
  console.log('nothing to recompute')
  process.exit(0)
}
console.log(`${DRY ? '[dry-run] would recompute' : 'recomputing'} ${dates.length} day(s)`)
if (DRY) {
  console.log(dates.join(' '))
  process.exit(0)
}

// ── recompute ────────────────────────────────────────────────────────────────
// `--app-url` overrides NEXT_PUBLIC_APP_URL.
//
// A formula change lives in the working tree long before it is deployed, and
// this script recomputes by POSTing to a RUNNING SERVER — so pointed at the
// deployed URL it would faithfully rewrite every sealed day using the OLD
// formula, report success, and leave history exactly as wrong as it found it.
// Point it at a local `next start` instead:
//
//   npx next build && npx next start &
//   node scripts/recompute-scores.mjs --app-url http://localhost:3000
const appUrl = (opt('app-url') ?? env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
if (!appUrl) {
  console.error('NEXT_PUBLIC_APP_URL unset — cannot reach /api/compute-score.')
  process.exit(1)
}
console.log(`target: ${appUrl}`)

let ok = 0
for (const date of dates) {
  try {
    // `force` overrides the finalized seal; the route accepts same-origin callers.
    const res = await fetch(`${appUrl}/api/compute-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: appUrl, Referer: `${appUrl}/` },
      body: JSON.stringify({ date, force: true, isToday: date === today, backfillDays: 0 }),
    })
    if (res.ok) {
      ok += 1
      console.log(`  ${date} ✓`)
    } else {
      console.warn(`  ${date} failed (${res.status}): ${(await res.text()).slice(0, 160)}`)
    }
  } catch (e) {
    console.warn(`  ${date} request failed:`, e?.message ?? e)
  }
}
console.log(`done — ${ok}/${dates.length} recomputed`)
