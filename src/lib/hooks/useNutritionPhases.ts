'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { NUTRITION_PRESETS, type NutritionMode } from '@/lib/types/workout'
import type { Tables } from '@/lib/supabase/types'

export type NutritionPhase = Tables<'nutrition_phases'>

export function useNutritionPhases() {
  return useQuery({
    queryKey: ['nutrition_phases'],
    queryFn: async (): Promise<NutritionPhase[]> => {
      const { data, error } = await supabase
        .from('nutrition_phases').select('*').order('effective_from', { ascending: false })
      if (error) throw error
      return (data ?? []) as NutritionPhase[]
    },
    staleTime: 60_000,
  })
}

/** Active mode for a date = the most recent phase whose effective_from ≤ date. */
export function phaseForDate(phases: NutritionPhase[], date: string): NutritionMode | null {
  for (const p of phases) { // already sorted newest-first
    if (p.effective_from <= date) return p.mode as NutritionMode
  }
  return null
}

/** Drop a dated timeline marker: this mode is effective from today forward. */
export function useSetNutritionPhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mode: NutritionMode) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const preset = NUTRITION_PRESETS[mode]
      const today = new Date().toLocaleDateString('en-CA')
      const row = {
        user_id: session.user.id, mode,
        calorie_goal: preset.calorieGoal,
        protein_g: preset.proteinGoalG, carbs_g: preset.carbsGoalG, fat_g: preset.fatGoalG,
        effective_from: today,
      }
      const { error } = await supabase.from('nutrition_phases').upsert(row as never, { onConflict: 'user_id,effective_from' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition_phases'] }),
  })
}
