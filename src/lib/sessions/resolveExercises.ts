import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InsertRow } from '@/lib/supabase/types'
import type { SplitDay } from '@/lib/types/workout'
import { canonicalExerciseName } from '@/lib/exercises/aliases'
import { muscleGroupsFor } from '@/lib/exercises/muscleMap'

type DB = SupabaseClient<Database>

/**
 * Resolve free-text exercise names (from the AI parser) to real exercises.id
 * UUIDs for the user. Matches case-insensitively against the existing catalog;
 * creates a new exercise row (under the given split) for any unmatched name.
 *
 * Returns a Map keyed by the ORIGINAL input name → exercise UUID.
 */
export async function resolveExercises(
  supabase: DB,
  userId: string,
  splitDay: SplitDay,
  names: Array<{ name: string; nameHe?: string; muscleGroups?: string[] }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!names.length) return out

  const { data } = await supabase
    .from('exercises')
    .select('id, name')
    .eq('user_id', userId)

  const existing = (data ?? []) as Array<{ id: string; name: string }>
  const byLower = new Map(existing.map((e) => [e.name.toLowerCase().trim(), e.id]))
  // Normalized index: strip "(Barbell)/(Dumbbell)/…" equipment tags + punctuation
  // so Hevy names like "Bench Press (Barbell)" map onto a system "Bench Press".
  const normalize = (s: string) =>
    s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
  const byNorm = new Map<string, string>()
  for (const e of existing) {
    const nk = normalize(e.name)
    if (nk && !byNorm.has(nk)) byNorm.set(nk, e.id)
  }

  for (const { name, nameHe, muscleGroups } of names) {
    if (out.has(name)) continue

    // Alias canonicalization FIRST (Hevy placeholder names → the true movement)
    // so a variant name can never spawn a duplicate catalog row.
    const canonical = canonicalExerciseName(name)
    const key = canonical.toLowerCase().trim()

    const found = byLower.get(key) ?? byNorm.get(normalize(canonical))
    if (found) {
      out.set(name, found)
      continue
    }

    // Create a new exercise for this previously-unseen name
    const insert: InsertRow<'exercises'> = {
      user_id: userId,
      name: canonical.trim(),
      name_he: nameHe ?? null,
      split_day: splitDay,
      // The Freshness dictionary is authoritative; fall back to any provided tags.
      muscle_groups: muscleGroupsFor(canonical) ?? (muscleGroups?.length ? muscleGroups : null),
      is_compound: false,
    }
     
    const { data: createdRaw } = await supabase
      .from('exercises')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insert as unknown as any)
      .select('id')
      .single()
    const created = createdRaw as { id: string } | null
    if (created) {
      out.set(name, created.id)
      byLower.set(key, created.id)
    }
  }

  return out
}
