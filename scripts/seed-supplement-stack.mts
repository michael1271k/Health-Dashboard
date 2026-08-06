/**
 * Move the hardcoded supplement protocol into `custom_supplements`, so the stack
 * becomes data the user owns instead of a constant only a deploy can change.
 *
 *   npx tsx scripts/seed-supplement-stack.mts [--dry-run]
 *
 * WHAT MATTERS HERE IS THE KEY. `supplement_log.item_key` holds months of ticked
 * history against the strings 'creatine', 'citrulline', 'multivitamin' …, and
 * `SUPPLEMENT_MICROS` is keyed by the same ones. Each seeded row therefore
 * carries its key in `schedule.key`, and the app reads that in preference to the
 * row's uuid. Seeding with fresh `custom:<uuid>` keys would have silently
 * orphaned every tick ever recorded — the checklist would look fine and the
 * history would be gone.
 *
 * Idempotent: matched by `schedule->>key`, so re-running updates nothing it has
 * already placed and NEVER overwrites a dose the user has since edited. That is
 * the point of the whole exercise; a seeder that resets user edits on every run
 * is just the hardcoded list with extra steps.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { SUPPLEMENT_PROTOCOL } from '../src/lib/supplements'
import { SUPPLEMENT_MICROS } from '../src/lib/nutrition/supplementMicros'

const DRY = process.argv.includes('--dry-run')

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)

const { data: { users }, error: authErr } = await sb.auth.admin.listUsers()
if (authErr) { console.error('auth:', authErr.message); process.exit(1) }
const userId = users[0]?.id
if (!userId) { console.error('no user'); process.exit(1) }

const { data: existing, error: readErr } = await sb
  .from('custom_supplements').select('id, name, dose, schedule')
if (readErr) { console.error('read failed:', readErr.message); process.exit(1) }

const seen = new Set(
  ((existing ?? []) as Array<{ schedule: { key?: string } | null }>)
    .map((r) => r.schedule?.key).filter(Boolean) as string[],
)

const rows: Array<Record<string, unknown>> = []
for (const slot of SUPPLEMENT_PROTOCOL) {
  for (const item of slot.items) {
    if (seen.has(item.key)) { console.log(`=  ${item.name} — already seeded, left untouched`); continue }
    rows.push({
      user_id: userId,
      name: item.name,
      dose: item.dose,
      color: slot.accent,
      form: null,
      time: slot.time,
      schedule: {
        key: item.key,
        slot: slot.label,
        ...(item.trainingOnly ? { trainingOnly: true } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
      },
      // The payload travels with the row so a future edit can carry its own.
      micros: SUPPLEMENT_MICROS[item.key] ?? null,
    })
    console.log(`+  ${slot.time} ${item.name} — ${item.dose}`
      + `${item.trainingOnly ? ' (training days only)' : ''}${item.notes ? ` · ${item.notes}` : ''}`)
  }
}

if (!rows.length) { console.log('\nnothing to seed'); process.exit(0) }
if (DRY) { console.log(`\n${rows.length} rows would be inserted`); process.exit(0) }

const { error } = await sb.from('custom_supplements').insert(rows as never[])
if (error) { console.error('insert failed:', error.message); process.exit(1) }
console.log(`\n${rows.length} supplements seeded`)
