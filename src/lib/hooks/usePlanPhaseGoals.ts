'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { NutritionMode, NutritionPreset } from '@/lib/types/workout'
import { phaseGoalsFor } from '@/lib/types/workout'

/** A user's editable macro override for one plan+phase (subset of the preset). */
export interface PlanPhaseOverride {
  calorieGoal?: number | null
  proteinGoalG?: number | null
  carbsGoalG?: number | null
  fatGoalG?: number | null
  fiberMin?: number | null
  fiberMax?: number | null
}

const key = (planId: string, phase: NutritionMode) => `${planId}|${phase}`

type Row = {
  plan_id: string; phase: string
  kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null
  fiber_min: number | null; fiber_max: number | null
}

const rowToOverride = (r: Row): PlanPhaseOverride => ({
  calorieGoal: r.kcal, proteinGoalG: r.protein_g, carbsGoalG: r.carbs_g,
  fatGoalG: r.fat_g, fiberMin: r.fiber_min, fiberMax: r.fiber_max,
})

/**
 * Per-plan+phase macro overrides the user has hand-edited in Settings, layered on
 * top of the static PLAN_PHASES / NUTRITION_PRESETS defaults. Reads the
 * plan_phase_goals table (self-healing: a missing table just yields no overrides).
 */
export function usePlanPhaseGoals() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['plan_phase_goals'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, PlanPhaseOverride>> => {
      const { data, error } = await supabase
        .from('plan_phase_goals')
        .select('plan_id, phase, kcal, protein_g, carbs_g, fat_g, fiber_min, fiber_max')
      if (error) return new Map() // table not migrated yet — degrade to defaults
      const map = new Map<string, PlanPhaseOverride>()
      for (const r of (data ?? []) as Row[]) map.set(key(r.plan_id, r.phase as NutritionMode), rowToOverride(r))
      return map
    },
  })

  const save = useMutation({
    mutationFn: async ({ planId, phase, patch }: { planId: string; phase: NutritionMode; patch: PlanPhaseOverride }) => {
      const row = {
        plan_id: planId, phase,
        kcal: patch.calorieGoal ?? null, protein_g: patch.proteinGoalG ?? null,
        carbs_g: patch.carbsGoalG ?? null, fat_g: patch.fatGoalG ?? null,
        fiber_min: patch.fiberMin ?? null, fiber_max: patch.fiberMax ?? null,
      }
      // Self-healing: a missing table is swallowed (the live goals still saved).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from('plan_phase_goals').upsert(row as any, { onConflict: 'user_id,plan_id,phase' }).then(() => {}, () => {})
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plan_phase_goals'] }) },
  })

  /** The resolved goals for a plan+phase: user override merged over the default. */
  const resolve = (planId: string, phase: NutritionMode): NutritionPreset => {
    const base = phaseGoalsFor(planId, phase)
    const o = query.data?.get(key(planId, phase))
    if (!o) return base
    const merged = { ...base }
    if (o.calorieGoal != null) merged.calorieGoal = o.calorieGoal
    if (o.proteinGoalG != null) merged.proteinGoalG = o.proteinGoalG
    if (o.carbsGoalG != null) merged.carbsGoalG = o.carbsGoalG
    if (o.fatGoalG != null) merged.fatGoalG = o.fatGoalG
    if (o.fiberMin != null) merged.fiberMin = o.fiberMin
    if (o.fiberMax != null) merged.fiberMax = o.fiberMax
    return merged
  }

  return { overrides: query.data, resolve, saveOverride: save.mutateAsync }
}
