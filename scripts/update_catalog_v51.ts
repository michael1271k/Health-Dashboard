/**
 * SYSTEM UPDATE v5.1 catalog migration:
 *   1. DELETE removed movements (only where they have no workout_sets — safe).
 *   2. UPSERT every HELIX-5.1 / AXIS-4 exercise (new: Hack/Smith Squat, …).
 *   3. Re-tag muscle_groups per the v5.1 alias table.
 *   npx tsx scripts/update_catalog_v51.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PROGRAMS, daySplitEnum } from '../src/lib/programs'

const REMOVED = ['DB Bulgarian Split Squat', 'Bulgarian Split Squat', 'Pallof Press', 'Cable Crunch', 'Russian Twist', 'Standing DB Curl', 'Lying Leg Raise']

const RETAG: Record<string, string[]> = {
  'Calf Press': ['calves'],
  'Hack/Smith Squat': ['quads', 'glutes'],
  'Reverse EZ-Bar Curl': ['forearms', 'biceps'],
  'Hanging Knee Raise': ['core'],
  'Cross-Body Cable Extension': ['triceps'],
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
  if (!uid) { console.error('No app user'); process.exit(1) }

  console.log(`${apply ? '▶ APPLYING' : '◌ DRY RUN'} — v5.1 catalog migration`)

  // 1. Removals (only exercises with zero logged sets)
  const { data: exRaw } = await sb.from('exercises').select('id, name').eq('user_id', uid).in('name', REMOVED)
  for (const ex of (exRaw ?? []) as Array<{ id: string; name: string }>) {
    const { count } = await sb.from('workout_sets').select('*', { count: 'exact', head: true }).eq('exercise_id', ex.id)
    if ((count ?? 0) > 0) { console.log(`  keep   ${ex.name} (${count} logged sets — history preserved)`); continue }
    console.log(`  remove ${ex.name}`)
    if (apply) {
      const { error } = await sb.from('exercises').delete().eq('id', ex.id)
      if (error) console.error(`  ✗ ${ex.name}: ${error.message}`)
    }
  }

  // 2. Upsert the full v5.1 program catalog
  const seen = new Map<string, { muscles: string[]; compound: boolean; split: string }>()
  for (const p of Object.values(PROGRAMS)) {
    for (const d of p.days) {
      for (const e of d.exercises) {
        if (!seen.has(e.name)) seen.set(e.name, { muscles: RETAG[e.name] ?? e.muscles, compound: !!e.compound, split: daySplitEnum(d.key) })
      }
    }
  }
  const rows = [...seen.entries()].map(([name, v]) => ({
    user_id: uid, name, name_he: null, split_day: v.split, muscle_groups: v.muscles, is_compound: v.compound,
  }))
  console.log(`  upsert ${rows.length} v5.1 exercises`)
  if (apply) {
    const { error } = await sb.from('exercises').upsert(rows as never, { onConflict: 'user_id,name', ignoreDuplicates: true })
    if (error) { console.error('  ✗ upsert:', error.message); process.exit(1) }
  }

  // 3. Re-tag muscle groups on existing rows per the alias table
  for (const [name, muscles] of Object.entries(RETAG)) {
    console.log(`  retag  ${name} → ${muscles.join('+')}`)
    if (apply) {
      const { error } = await sb.from('exercises').update({ muscle_groups: muscles } as never).eq('user_id', uid).eq('name', name)
      if (error) console.error(`  ✗ ${name}: ${error.message}`)
    }
  }

  console.log(apply ? '✓ Catalog migrated to v5.1.' : '\nRe-run with --apply to execute.')
}

main().catch((e) => { console.error('update_catalog_v51 failed:', e); process.exit(1) })
