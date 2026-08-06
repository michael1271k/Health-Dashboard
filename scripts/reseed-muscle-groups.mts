/**
 * Re-seed `exercises.muscle_groups` from the dictionary in
 * `src/lib/exercises/muscleMap.ts`.
 *
 * The column is a CACHE, not a source. Every aggregator resolves muscles from
 * the exercise NAME and only falls back to this column for a row the dictionary
 * has never seen — but the fallback is real, the column is what a future
 * importer or a hand-written query will read, and it had drifted badly:
 * `Face Pull` was still tagged `shoulders, biceps` (neither of which it trains),
 * `Hip Adduction (Machine)` carried `inner_thigh`, a token nothing understood,
 * and the pec deck claimed triceps it never shortens.
 *
 * Written as .mts rather than .mjs on purpose: it IMPORTS the dictionary instead
 * of restating it. A script with its own copy of the mapping is how the column
 * drifted in the first place.
 *
 *   npx tsx scripts/reseed-muscle-groups.mts [--dry-run]
 *
 * Idempotent. Rows already matching are skipped, and an exercise the dictionary
 * does not recognise is left ALONE — never blanked, since its stored tags are
 * then the only thing anyone knows about it.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { muscleGroupsFor } from '../src/lib/exercises/muscleMap'

const DRY = process.argv.includes('--dry-run')

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)

const { data, error } = await sb.from('exercises').select('id, name, muscle_groups').order('name')
if (error) { console.error('read failed:', error.message); process.exit(1) }

const rows = (data ?? []) as Array<{ id: string; name: string; muscle_groups: string[] | null }>
let changed = 0, skipped = 0, unknown = 0

for (const ex of rows) {
  const want = muscleGroupsFor(ex.name)
  if (!want) { unknown += 1; console.log(`?  ${ex.name} — not in the dictionary, left as-is`); continue }
  const has = (ex.muscle_groups ?? []).join(',')
  if (has === want.join(',')) { skipped += 1; continue }
  changed += 1
  console.log(`~  ${ex.name}\n     was [${has}]\n     now [${want.join(',')}]`)
  if (DRY) continue
  const { error: upErr } = await sb.from('exercises')
    .update({ muscle_groups: want } as never).eq('id', ex.id)
  if (upErr) { console.error(`   !! ${ex.name}: ${upErr.message}`); process.exit(1) }
}

console.log(`\n${rows.length} exercises · ${changed} ${DRY ? 'would change' : 'updated'}`
  + ` · ${skipped} already correct · ${unknown} unknown`)
