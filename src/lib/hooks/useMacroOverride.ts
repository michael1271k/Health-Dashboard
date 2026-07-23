'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { authedFetch } from '@/lib/utils/authedFetch'
import { logicalTodayISO } from '@/lib/utils/day'
import { derivePhase } from '@/lib/nutrition/phase'

export interface MacroValues {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

/** Surfaces that must refresh after a manual macro edit cascades. */
const CASCADE_KEYS: string[][] = [
  ['nutrition_entries'], ['daily_logs'], ['daily_scores'], ['coach'], ['trends'],
  ['day_vault'], ['continuum'], ['weekly_review'], ['fuel_force_session'], ['muscle_analytics'],
]

/**
 * Manual macro override for one day. Writes the canonical daily nutrition row
 * (the DB trigger mirrors macros into daily_logs, so Vitals stays correct),
 * marks it `hk_uuid='manual'` so a later HealthKit re-sync won't clobber the
 * hand-entered numbers, then force-recomputes that day's score and revalidates
 * every dependent surface (score, weekly trends, coach).
 */
export function useMacroOverride(date: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vals: MacroValues) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const calories = Math.max(0, Math.round(vals.calories))
      const row = {
        user_id: user.id,
        date,
        meal_type: 'daily',
        hk_uuid: 'manual', // sentinel: HealthKit ingest skips a manual-override day
        logged_at: `${date}T12:00:00Z`,
        calories,
        protein_g: Math.max(0, vals.protein_g),
        carbs_g: Math.max(0, vals.carbs_g),
        fat_g: Math.max(0, vals.fat_g),
        phase: derivePhase(calories),
      }
      const { error } = await supabase.from('nutrition_entries')
        .upsert(row as never, { onConflict: 'user_id,date,meal_type' })
      if (error) throw new Error(error.message)
      // Recompute the day's score/battery from the edited macros (force bypasses
      // the finalized freeze for a past day).
      await authedFetch('/api/compute-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, force: true, isToday: date === logicalTodayISO() }),
      })
    },
    onSuccess: () => { for (const k of CASCADE_KEYS) qc.invalidateQueries({ queryKey: k }) },
  })
}
