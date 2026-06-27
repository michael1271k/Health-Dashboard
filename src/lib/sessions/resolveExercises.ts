import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InsertRow } from '@/lib/supabase/types'
import type { SplitDay } from '@/lib/types/workout'

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
  names: Array<{ name: string; nameHe?: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!names.length) return out

  const { data } = await supabase
    .from('exercises')
    .select('id, name')
    .eq('user_id', userId)

  const existing = (data ?? []) as Array<{ id: string; name: string }>
  const byLower = new Map(existing.map((e) => [e.name.toLowerCase().trim(), e.id]))

  for (const { name, nameHe } of names) {
    const key = name.toLowerCase().trim()
    if (out.has(name)) continue

    const found = byLower.get(key)
    if (found) {
      out.set(name, found)
      continue
    }

    // Create a new exercise for this previously-unseen name
    const insert: InsertRow<'exercises'> = {
      user_id: userId,
      name: name.trim(),
      name_he: nameHe ?? null,
      split_day: splitDay,
      muscle_groups: null,
      is_compound: false,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
