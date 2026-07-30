/**
 * One-shot data correction: overwrite ONE day's daily nutrition row, then force
 * that day's score to recompute.
 *
 *   node scripts/fix-nutrition-day.mjs 2026-07-29 1916 164 194 56
 *   node scripts/fix-nutrition-day.mjs                # defaults to the Jul-29 fix
 *
 * Writes the row exactly as the in-app manual override does — `meal_type='daily'`
 * with the per-day `manual-<date>` sentinel — so a later HealthKit sync will NOT
 * clobber it (see src/lib/nutrition/manualEntry.ts), and re-running the script is
 * idempotent rather than a unique-constraint violation.
 *
 * Reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * The score recompute POSTs /api/compute-score with `force: true` (the day is
 * finalized, so nothing else would rewrite it).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv(file = '.env.local') {
  const out = {}
  let raw = ''
  try { raw = readFileSync(resolve(process.cwd(), file), 'utf8') } catch { return out }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const env = { ...loadEnv(), ...process.env }

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)')
  process.exit(1)
}

// ── args ─────────────────────────────────────────────────────────────────────
const [date = '2026-07-29', kcal = '1916', protein = '164', carbs = '194', fat = '56'] = process.argv.slice(2)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`Bad date "${date}" — expected YYYY-MM-DD`)
  process.exit(1)
}
const calories = Math.round(Number(kcal))

/** Same bands as src/lib/nutrition/phase.ts — kept in sync by hand. */
const derivePhase = (c) => (c <= 0 ? null : c <= 2050 ? 'cut' : c < 2450 ? 'maintenance' : 'bulk')

const supabase = createClient(URL_, KEY, { auth: { persistSession: false } })

// ── 1. whose day is it? ──────────────────────────────────────────────────────
const { data: { users } = {}, error: usersError } = await supabase.auth.admin.listUsers()
if (usersError || !users?.length) {
  console.error('Could not list users:', usersError?.message ?? 'none found')
  process.exit(1)
}
const wanted = (env.NEXT_PUBLIC_DEV_EMAIL ?? '').toLowerCase()
const user = users.find((u) => u.email?.toLowerCase() === wanted) ?? users[0]
console.log(`user: ${user.email} (${user.id})`)

// ── 2. write the corrected macros ────────────────────────────────────────────
const row = {
  user_id: user.id,
  date,
  meal_type: 'daily',
  hk_uuid: `manual-${date}`,
  logged_at: `${date}T12:00:00Z`,
  calories,
  protein_g: Number(protein),
  carbs_g: Number(carbs),
  fat_g: Number(fat),
  phase: derivePhase(calories),
}
const { error: upsertError } = await supabase
  .from('nutrition_entries')
  .upsert(row, { onConflict: 'user_id,date,meal_type' })
if (upsertError) {
  console.error('nutrition upsert failed:', upsertError.message)
  process.exit(1)
}
console.log(`nutrition ${date}: ${calories} kcal · ${protein}P / ${carbs}C / ${fat}F ✓`)

// ── 3. force the day score to recompute ──────────────────────────────────────
const appUrl = (env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
if (!appUrl) {
  console.warn('NEXT_PUBLIC_APP_URL unset — skipped score recompute. Open the day in the app to trigger it.')
  process.exit(0)
}
try {
  // The guard accepts same-origin callers, so present the app's own origin.
  const res = await fetch(`${appUrl}/api/compute-score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: appUrl, Referer: `${appUrl}/` },
    body: JSON.stringify({ date, force: true, isToday: false, backfillDays: 0 }),
  })
  const body = await res.text()
  console.log(res.ok ? `score recomputed ✓ ${body}` : `score recompute failed (${res.status}): ${body}`)
} catch (e) {
  console.warn('score recompute request failed:', e?.message ?? e)
}
