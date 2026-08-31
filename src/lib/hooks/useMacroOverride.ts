'use client'

import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useOptimisticMutation } from '@/lib/hooks/useOptimisticMutation'
import { todayBundleKey } from '@/lib/hooks/useToday'
import { authedFetch } from '@/lib/utils/authedFetch'
import { logicalTodayISO } from '@/lib/utils/day'
import { recomputeAndPaint } from '@/lib/scoring/applyComputedScore'
import { DAY_KINDS } from '@/lib/native/widgetKinds'
import { resolveDayPhase } from '@/lib/nutrition/phase'
import { activePhase } from '@/lib/programs'
import { manualHkUuid } from '@/lib/nutrition/manualEntry'

export interface MacroValues {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

/** Surfaces that must refresh after a manual macro edit cascades. */
const CASCADE_KEYS: string[][] = [
  // No ['daily_scores'] — nothing is keyed on it; the recomputed score arrives
  // with ['today'] (see workoutKeys.ts). Intake never moves readiness.
  ['today'], ['nutrition_entries'], ['daily_logs'], ['coach'], ['trends'],
  ['day_vault'], ['continuum'], ['weekly_review'], ['fuel_force_session'], ['muscle_analytics'],
  // The weekly export reads `nutrition_entries` for every calorie and macro it
  // prints, and caches the rendered markdown for 60 s. Without this key, editing
  // a day's intake and immediately tapping "Export Week" produced a payload
  // built from the numbers the edit had just replaced — the one failure mode a
  // manual override exists to prevent, and invisible because the string looks
  // perfectly well-formed.
  ['weekly_export'],
]

/**
 * Manual macro override for one day. Writes the canonical daily nutrition row
 * (the DB trigger mirrors macros into daily_logs, so Vitals stays correct),
 * marks it with the per-day manual sentinel so a later HealthKit re-sync won't
 * clobber the hand-entered numbers, then force-recomputes that day's score and
 * revalidates every dependent surface (score, weekly trends, coach).
 *
 * The sentinel MUST be per-day: `hk_uuid` is UNIQUE, so the old shared literal
 * `'manual'` made the second manual day (and a double-tapped save) fail with
 * `duplicate key value violates unique constraint "nutrition_entries_hk_uuid_key"`.
 * See {@link manualHkUuid}. `mutationFn` is also guarded against a concurrent
 * second click by React Query — but the write is idempotent either way now.
 */
export function useMacroOverride(date: string) {
  const qc = useQueryClient()
  return useOptimisticMutation<MacroValues, void>({
    /*
     * ── THE RINGS MOVE ON THE SAVE, NOT ON THE ROUND TRIP ──────────────────
     * The write below is four round trips deep — auth, a flags read, the
     * upsert, then a forced score recompute — and the macro rings held their
     * old numbers through all of it. They are patched here instead.
     *
     * `phase` is deliberately NOT guessed: `resolveDayPhase` needs the day's
     * exception/estimated flags, which are read inside the mutation, and a
     * wrong band flashing before the right one is worse than a band that
     * arrives a moment late. It settles with the invalidation.
     */
    patches: (vals) => {
      const macros = {
        calories: Math.max(0, Math.round(vals.calories)),
        protein_g: Math.max(0, vals.protein_g),
        carbs_g: Math.max(0, vals.carbs_g),
        fat_g: Math.max(0, vals.fat_g),
      }
      return [{
        key: todayBundleKey(date),
        apply: (prev) => {
          const b = prev as { nutrition?: Record<string, unknown> | null } | undefined
          if (!b?.nutrition) return undefined
          return { ...b, nutrition: { ...b.nutrition, ...macros } }
        },
      }]
    },
    mutationFn: async (vals: MacroValues) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const calories = Math.max(0, Math.round(vals.calories))
      // The day's declaration lives on daily_logs, the phase on this row — two
      // tables, two write paths. Read the flags here so a hand-corrected
      // exception day is not re-banded into a phase the block is not in.
      const { data: flags } = await supabase.from('daily_logs')
        .select('nutrition_exception, nutrition_estimated')
        .eq('user_id', user.id).eq('date', date).maybeSingle() as unknown as
        { data: { nutrition_exception: string | null; nutrition_estimated: boolean | null } | null }
      const row = {
        user_id: user.id,
        date,
        meal_type: 'daily',
        hk_uuid: manualHkUuid(date), // per-day sentinel: HealthKit ingest skips it
        logged_at: `${date}T12:00:00Z`,
        calories,
        protein_g: Math.max(0, vals.protein_g),
        carbs_g: Math.max(0, vals.carbs_g),
        fat_g: Math.max(0, vals.fat_g),
        phase: resolveDayPhase({
          calories,
          exception: flags?.nutrition_exception ?? null,
          estimated: flags?.nutrition_estimated ?? false,
          activePhase: activePhase(),
        }),
      }
      const { error } = await supabase.from('nutrition_entries')
        .upsert(row as never, { onConflict: 'user_id,date,meal_type' })
      if (error) throw new Error(error.message)
      // Recompute the day's score/battery from the edited macros (force bypasses
      // the finalized freeze for a past day) and paint the result immediately.
      // DAY_KINDS: macros move the score, the battery and the Fuel face. The
      // Training widget draws none of them, and its reload budget is per kind.
      await recomputeAndPaint(
        qc, date, { force: true, isToday: date === logicalTodayISO() }, authedFetch, DAY_KINDS)
    },
    onSuccess: () => { for (const k of CASCADE_KEYS) qc.invalidateQueries({ queryKey: k }) },
  })
}
