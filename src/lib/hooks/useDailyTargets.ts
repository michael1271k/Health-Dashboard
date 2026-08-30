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
import { DAILY_TARGET_COLUMNS, type DailyTarget } from '@/lib/nutrition/dailyTargets'

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

/** The override for one date, or null when the day has none. */
export function useDailyTarget(date: string) {
  return useQuery({
    queryKey: dailyTargetKey(date),
    queryFn: async (): Promise<DailyTarget | null> => {
      const { data, error } = await supabase
        .from('daily_targets')
        .select(DAILY_TARGET_COLUMNS)
        .eq('date', date)
        .maybeSingle()
      if (error) return null // table not migrated yet
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
      const { data, error } = await supabase
        .from('daily_targets')
        .select(DAILY_TARGET_COLUMNS)
        .gte('date', startISO)
        .lte('date', endISO)
      if (error) return new Map()
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
      const { error } = await supabase.from('daily_targets').upsert({
        user_id: session.user.id,
        date,
        kcal: patch.kcal ?? null,
        protein_g: patch.protein_g ?? null,
        carbs_g: patch.carbs_g ?? null,
        fat_g: patch.fat_g ?? null,
        steps_goal: patch.steps_goal ?? null,
        note: patch.note ?? null,
        updated_at: new Date().toISOString(),
      } as unknown as never, { onConflict: 'user_id,date' })
      if (error) throw error
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
