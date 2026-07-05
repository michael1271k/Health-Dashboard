/**
 * Inject the AXIS-5 + AXIS-4 exercise catalog into `exercises` so the new
 * programs are loggable. Program/day structure + Week-1 weights live in
 * src/lib/programs.ts; this just ensures every exercise NAME exists (FK target
 * for workout_sets) with its muscle groups. Idempotent (ON CONFLICT DO NOTHING).
 *   npx tsx scripts/seed_programs.ts            # dry run
 *   npx tsx scripts/seed_programs.ts --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PROGRAMS } from '../src/lib/programs'

// Program-day key → an existing split_day enum value (satisfies the CHECK).
const DAY_SPLIT: Record<string, string> = {
  torso: 'upper', quads: 'legs', armory: 'upper', pump: 'upper', posterior: 'legs',
  upper_a: 'upper', lower_a: 'legs', upper_b: 'upper', lower_b: 'legs',
}

function loadEnvLocal() {
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  } catch { /* ignore */ }
}

async function main() {
  loadEnvLocal()
  const apply = process.argv.includes('--apply')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Missing Supabase env'); process.exit(1) }
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data: u } = await sb.auth.admin.listUsers()
  const uid = u?.users?.[0]?.id
  if (!uid) { console.error('No app user found'); process.exit(1) }

  const seen = new Map<string, { muscles: string[]; compound: boolean; split: string }>()
  for (const p of Object.values(PROGRAMS)) {
    for (const d of p.days) {
      for (const e of d.exercises) {
        if (!seen.has(e.name)) seen.set(e.name, { muscles: e.muscles, compound: !!e.compound, split: DAY_SPLIT[d.key] ?? 'upper' })
      }
    }
  }
  const rows = [...seen.entries()].map(([name, v]) => ({
    user_id: uid, name, name_he: null, split_day: v.split, muscle_groups: v.muscles, is_compound: v.compound,
  }))

  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — ${rows.length} unique AXIS exercises`)
  if (apply) {
    const { error } = await sb.from('exercises').upsert(rows as never, { onConflict: 'user_id,name', ignoreDuplicates: true })
    if (error) { console.error('  ✗', error.message); process.exit(1) }
    console.log('✓ Catalog seeded.')
  } else {
    console.log(rows.map((r) => `  ${r.name}`).join('\n'))
  }
}

main().catch((e) => { console.error('seed_programs failed:', e); process.exit(1) })
