'use client'

/**
 * Read and write one day's target override.
 *
 * The resolver and the reasoning live in `@/lib/nutrition/dailyTargets`, which is
 * server-safe because `computeForDate` shares it. This file is only the client
 * plumbing: a query, an upsert and a clear.
 *
 * Every read self-heals if the table is absent, the same way
 * `useCustomSupplements` does — an app running against a database that has not
 * had the DDL applied simply resolves no overrides and behaves exactly as it did
 * before per-day targets existed.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import {
  DAILY_TARGET_COLUMNS, DAILY_TARGET_COLUMNS_LEGACY, type DailyTarget,
} from '@/lib/nutrition/dailyTargets'

const KEY = 'daily_targets'

/**
 * Surfaces that must refresh when a day's target moves.
 *
 * `daily_scores` because the number the day is GRADED against just changed and
 * the ring would otherwise keep drawing against the old one until a reload;
 * `weekly_export` because it caches its rendered markdown and the Targets &
 * Levers section prints these figures.
 */
const CASCADE_KEYS: readonly (readonly string[])[] = [
  [KEY], ['daily_scores'], ['weekly_export'], ['nutrition'],
]

export function dailyTargetKey(date: string) {
  return [KEY, date] as const
}

/**
 * The same row without the three columns a pre-migration table does not have.
 *
 * Named rather than rest-destructured so the omission is a statement — three
 * discarded bindings called `_pk`, `_tc`, `_tf` say nothing about WHY they are
 * being dropped, and the linter is right that a variable assigned and never read
 * is usually a mistake. Here it is the point, so it gets a function and a name.
 */
function withoutProfileColumns<T extends Record<string, unknown>>(row: T) {
  const out: Record<string, unknown> = { ...row }
  delete out.profile_key
  delete out.track_carbs
  delete out.track_fat
  return out
}

/**
 * ── ONE READ, WITH ONE KNOWN FALLBACK ────────────────────────────────────────
 * `profile_key`, `track_carbs` and `track_fat` are the newest columns here, and
 * a select naming a column that does not exist fails the whole statement — which
 * would cost the day every target it has, not just its stamp.
 *
 * The usual fix in this codebase is an isolated query per new column, but that
 * does not work for these three: they QUALIFY the figures in the same row, and
 * resolving the targets from one read and the tracking flags from another that
 * failed would silently grade a restaurant day on carbohydrate. So the retry
 * falls back to exactly the column list the table is known to have had, and a
 * pre-migration database resolves its targets with every macro tracked — which
 * is what those rows meant when they were written.
 */
async function selectTargets(build: (columns: string) => PromiseLike<{ data: unknown; error: unknown }>) {
  const first = await build(DAILY_TARGET_COLUMNS)
  if (!first.error) return first.data
  const retry = await build(DAILY_TARGET_COLUMNS_LEGACY)
  return retry.error ? null : retry.data
}

/** The override for one date, or null when the day has none. */
export function useDailyTarget(date: string) {
  return useQuery({
    queryKey: dailyTargetKey(date),
    queryFn: async (): Promise<DailyTarget | null> => {
      const data = await selectTargets((columns) => supabase
        .from('daily_targets')
        .select(columns)
        .eq('date', date)
        .maybeSingle())
      return (data as DailyTarget | null) ?? null
    },
    staleTime: 60_000,
  })
}

/** Every override inside an inclusive date range, keyed by date. */
export function useDailyTargetRange(startISO: string, endISO: string, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'range', startISO, endISO] as const,
    queryFn: async (): Promise<Map<string, DailyTarget>> => {
      const data = await selectTargets((columns) => supabase
        .from('daily_targets')
        .select(columns)
        .gte('date', startISO)
        .lte('date', endISO))
      return new Map(((data ?? []) as DailyTarget[]).map((t) => [t.date, t]))
    },
    enabled,
    staleTime: 60_000,
  })
}

/**
 * Write one day's override.
 *
 * A field passed as `null` is cleared and falls back to the rung below it, which
 * is what "no opinion" means throughout this layer — so raising a day's calories
 * without mentioning protein leaves protein where the lever put it.
 */
export function useSaveDailyTarget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ date, ...patch }: DailyTarget) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const row = {
        user_id: session.user.id,
        date,
        kcal: patch.kcal ?? null,
        protein_g: patch.protein_g ?? null,
        carbs_g: patch.carbs_g ?? null,
        fat_g: patch.fat_g ?? null,
        steps_goal: patch.steps_goal ?? null,
        note: patch.note ?? null,
        // Hand-editing a figure keeps the day's stamp and its tracking flags:
        // nudging a restaurant day's calories from 2,400 to 2,650 is still a
        // restaurant day, and must not silently start grading its fat again.
        // `matchesProfile` is what stops the picker claiming it is still 2,400.
        profile_key: patch.profile_key ?? null,
        track_carbs: patch.track_carbs ?? true,
        track_fat: patch.track_fat ?? true,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('daily_targets')
        .upsert(row as unknown as never, { onConflict: 'user_id,date' })
      if (!error) return
      // Same one-known-fallback retry as the read — see `selectTargets`.
      const back = await supabase.from('daily_targets')
        .upsert(withoutProfileColumns(row) as unknown as never, { onConflict: 'user_id,date' })
      if (back.error) throw back.error
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: dailyTargetKey(v.date) })
      for (const k of CASCADE_KEYS) qc.invalidateQueries({ queryKey: k })
    },
  })
}

/** Drop a day's override entirely — the day goes back to whatever rung is in force. */
export function useClearDailyTarget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase.from('daily_targets').delete().eq('date', date)
      if (error) throw error
    },
    onSuccess: (_r, date) => {
      qc.invalidateQueries({ queryKey: dailyTargetKey(date) })
      for (const k of CASCADE_KEYS) qc.invalidateQueries({ queryKey: k })
    },
  })
}
