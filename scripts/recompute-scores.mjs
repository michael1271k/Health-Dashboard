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
 * run; back for battery v8 (2026-09-05) and kept for readiness v9 (Wave 10,
 * the same day), which changes `battery_pct` on EVERY scored day — the charge
 * reads HRV and resting HR as z-scores against a 42-day baseline, and the
 * stress drain became a load drain and a wellness drain — so the candidate set
 * is every `daily_scores` row in the range, not a sleep-filtered subset.
 *
 * ── IT RUNS AGAINST A LOCAL `next start`, ON PURPOSE ────────────────────────
 * The formula lives in the working tree long before it is deployed, and this
 * script recomputes by POSTing to a RUNNING SERVER. Pointed at the deployed
 * URL it would faithfully rewrite every sealed day with the OLD formula,
 * report success, and leave history exactly as wrong as it found it. So the
 * target defaults to `http://localhost:3000`, and a non-local target is
 * refused unless `--allow-remote` says you mean it.
 *
 *   npx next build && npx next start &
 *   node scripts/recompute-scores.mjs --dry-run
 *   HELIX_APPLY=1 node scripts/recompute-scores.mjs
 *
 * Usage:
 *   node scripts/recompute-scores.mjs --dry-run                # every scored day, last 400
 *   node scripts/recompute-scores.mjs 2026-07-15               # one date
 *   node scripts/recompute-scores.mjs --from 2026-07-01 --to 2026-08-04
 *   node scripts/recompute-scores.mjs --app-url http://localhost:3001
 *
 * Needs .env.local (SUPABASE_SERVICE_ROLE_KEY for the read and to mint the
 * owner's token, NEXT_PUBLIC_SUPABASE_ANON_KEY to exchange it,
 * NEXT_PUBLIC_APP_URL or --app-url for the recompute POST). `--env <path>`
 * points at another env file, for a worktree that has none of its own. The
 * service-role key is server-only and never ships in the client bundle.
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
/** `battery_pct` before the run, per date, so the tail can print the delta. */
const before = new Map()
let dates = explicitDates
if (dates.length) {
  const { data } = await supabase.from('daily_scores').select('date, battery_pct').in('date', dates)
  for (const r of data ?? []) before.set(r.date, r.battery_pct)
}
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
  for (const r of rows) before.set(r.date, r.battery_pct)
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
// `--app-url` overrides the local default. See the header for why the default
// is local and why a remote target needs `--allow-remote`.
const LOCAL_DEFAULT = 'http://localhost:3000'
const appUrl = (opt('app-url') ?? LOCAL_DEFAULT).replace(/\/$/, '')
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(appUrl)
if (!isLocal && !flag('allow-remote')) {
  console.error(`refusing ${appUrl}: a deployed server runs the formula it was deployed with, not the one in this tree.`)
  console.error('Start a local server (`npx next build && npx next start`) or pass --allow-remote if you really mean it.')
  process.exit(1)
}
console.log(`target: ${appUrl}${isLocal ? ' (local)' : ' (REMOTE — --allow-remote)'}`)

// The server must be up AND running THIS tree's formula. `/api/compute-score`
// answers 401 to an unauthenticated POST when it is up at all; a connection
// refusal means nothing is listening and every day below would "fail" one by
// one with the same message.
try {
  const probe = await fetch(`${appUrl}/api/compute-score`, { method: 'POST' })
  if (probe.status !== 401) console.warn(`  probe: unexpected ${probe.status} from /api/compute-score (expected 401 unauthenticated)`)
} catch (e) {
  console.error(`cannot reach ${appUrl}: ${e?.cause?.message ?? e?.message ?? e}`)
  process.exit(1)
}

// ── A REAL TOKEN, NOT A FORGED ORIGIN ──────────────────────────────────────
// This used to send `Origin: <appUrl>` and rely on the route treating any
// same-origin-looking caller as the household admin. That "check" was a header
// any client can set, so it was also how an anonymous request read the whole
// health record; the route is JWT-only now. The service-role key can mint a
// session for the owner, which is what a headless admin job should carry.
const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
if (usersError || !users?.length) {
  console.error('cannot list users to mint a token:', usersError?.message ?? 'none found')
  process.exit(1)
}
const owner = users[0]
const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: owner.email,
})
if (linkError || !link?.properties?.hashed_token) {
  console.error('cannot mint a token:', linkError?.message ?? 'no hashed_token')
  process.exit(1)
}
// `verifyOtp` needs the ANON client — the service-role one is not a user agent.
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: session, error: otpError } = await anon.auth.verifyOtp({
  type: 'magiclink',
  token_hash: link.properties.hashed_token,
})
if (otpError || !session?.session?.access_token) {
  console.error('cannot exchange the token:', otpError?.message ?? 'no session')
  process.exit(1)
}
const accessToken = session.session.access_token
console.log(`signed in as: ${owner.email}`)

let ok = 0
for (const date of dates) {
  try {
    // `force` overrides the finalized seal; the bearer token says whose days.
    const res = await fetch(`${appUrl}/api/compute-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ date, force: true, isToday: date === today, backfillDays: 0 }),
    })
    if (res.ok) {
      ok += 1
      const body = await res.json().catch(() => null)
      const after = body?.score?.battery_pct
      const was = before.get(date)
      const delta = after != null && was != null ? ` (${was}% → ${after}%)` : after != null ? ` (${after}%)` : ''
      console.log(`  ${date} ✓${delta}`)
    } else {
      console.warn(`  ${date} failed (${res.status}): ${(await res.text()).slice(0, 160)}`)
    }
  } catch (e) {
    console.warn(`  ${date} request failed:`, e?.message ?? e)
  }
}
console.log(`done — ${ok}/${dates.length} recomputed`)
