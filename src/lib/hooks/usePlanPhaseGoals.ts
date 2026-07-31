'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { NutritionMode, NutritionPreset } from '@/lib/types/workout'
import { phaseGoalsFor } from '@/lib/types/workout'
import { LANDMARK_MUSCLES, programTargets, type LandmarkMuscle, type ProgramPhase } from '@/lib/training/landmarks'

/**
 * A user's editable goals for one plan+phase.
 *
 * This is the whole point of nesting Phase inside Plan: a phase is not a label,
 * it's the set of numbers the plan runs on. Everything the phase dictates —
 * macros, activity goals, body targets, and weekly set volume — is editable here
 * and keyed by `(plan, phase)`.
 */
export interface PlanPhaseOverride {
  calorieGoal?: number | null
  proteinGoalG?: number | null
  carbsGoalG?: number | null
  fatGoalG?: number | null
  fiberMin?: number | null
  fiberMax?: number | null
  stepsGoal?: number | null
  targetWeightKg?: number | null
  targetBodyFatPct?: number | null
  targetMuscleMassKg?: number | null
  rateMinKgWk?: number | null
  rateMaxKgWk?: number | null
}

export const planPhaseKey = (planId: string, phase: NutritionMode) => `${planId}|${phase}`

type Row = {
  plan_id: string; phase: string
  kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null
  fiber_min: number | null; fiber_max: number | null
  steps_goal?: number | null; target_weight_kg?: number | null
  target_body_fat_pct?: number | null; target_muscle_mass_kg?: number | null
  rate_min_kg_wk?: number | null; rate_max_kg_wk?: number | null
}

type VolumeRow = { plan_id: string; phase: string; muscle: string; target_sets: number }

const rowToOverride = (r: Row): PlanPhaseOverride => ({
  calorieGoal: r.kcal, proteinGoalG: r.protein_g, carbsGoalG: r.carbs_g,
  fatGoalG: r.fat_g, fiberMin: r.fiber_min, fiberMax: r.fiber_max,
  stepsGoal: r.steps_goal ?? null, targetWeightKg: r.target_weight_kg ?? null,
  targetBodyFatPct: r.target_body_fat_pct ?? null,
  targetMuscleMassKg: r.target_muscle_mass_kg ?? null,
  rateMinKgWk: r.rate_min_kg_wk ?? null, rateMaxKgWk: r.rate_max_kg_wk ?? null,
})

const SELECT_FULL = 'plan_id, phase, kcal, protein_g, carbs_g, fat_g, fiber_min, fiber_max, steps_goal, target_weight_kg, target_body_fat_pct, target_muscle_mass_kg, rate_min_kg_wk, rate_max_kg_wk'
const SELECT_BASE = 'plan_id, phase, kcal, protein_g, carbs_g, fat_g, fiber_min, fiber_max'
const EXTRA_COLS = ['steps_goal', 'target_weight_kg', 'target_body_fat_pct', 'target_muscle_mass_kg', 'rate_min_kg_wk', 'rate_max_kg_wk'] as const

/**
 * The payload is TUPLES, not Maps.
 *
 * JSON has no Map: one dehydrates to `{}` in the persisted query cache and
 * rehydrates without `.get()`. Returning Maps here meant this query was silently
 * excluded from persistence by QueryProvider's guard — correct, but it paid a
 * refetch on every cold open for no reason. Callers build the index themselves.
 */
export interface PlanPhaseData {
  overrides: Array<[string, PlanPhaseOverride]>
  /** key `${planId}|${phase}|${muscle}` → weekly target sets. */
  volume: Array<[string, number]>
}

const EMPTY: PlanPhaseData = { overrides: [], volume: [] }

export function usePlanPhaseGoals() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['plan_phase_goals'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PlanPhaseData> => {
      const load = async () => {
        let res = await supabase.from('plan_phase_goals').select(SELECT_FULL)
        // Pre-migration DB: fall back to the original column set rather than
        // losing the macro overrides that DO exist.
        if (res.error) res = await supabase.from('plan_phase_goals').select(SELECT_BASE)
        return res
      }
      const [goalsRes, volRes] = await Promise.all([
        load(),
        supabase.from('plan_phase_volume').select('plan_id, phase, muscle, target_sets'),
      ])
      if (goalsRes.error && volRes.error) return EMPTY

      const overrides: Array<[string, PlanPhaseOverride]> = goalsRes.error ? []
        : ((goalsRes.data ?? []) as unknown as Row[])
          .map((r) => [planPhaseKey(r.plan_id, r.phase as NutritionMode), rowToOverride(r)] as [string, PlanPhaseOverride])

      const volume: Array<[string, number]> = volRes.error ? []
        : ((volRes.data ?? []) as unknown as VolumeRow[])
          .map((r) => [`${r.plan_id}|${r.phase}|${r.muscle}`, r.target_sets] as [string, number])

      return { overrides, volume }
    },
  })

  const overrideMap = new Map(Array.isArray(query.data?.overrides) ? query.data.overrides : [])
  const volumeMap = new Map(Array.isArray(query.data?.volume) ? query.data.volume : [])

  const save = useMutation({
    mutationFn: async ({ planId, phase, patch }: { planId: string; phase: NutritionMode; patch: PlanPhaseOverride }) => {
      const row: Record<string, unknown> = {
        plan_id: planId, phase,
        kcal: patch.calorieGoal ?? null, protein_g: patch.proteinGoalG ?? null,
        carbs_g: patch.carbsGoalG ?? null, fat_g: patch.fatGoalG ?? null,
        fiber_min: patch.fiberMin ?? null, fiber_max: patch.fiberMax ?? null,
        steps_goal: patch.stepsGoal ?? null, target_weight_kg: patch.targetWeightKg ?? null,
        target_body_fat_pct: patch.targetBodyFatPct ?? null,
        target_muscle_mass_kg: patch.targetMuscleMassKg ?? null,
        rate_min_kg_wk: patch.rateMinKgWk ?? null, rate_max_kg_wk: patch.rateMaxKgWk ?? null,
      }
      const up = (r: Record<string, unknown>) =>
        supabase.from('plan_phase_goals').upsert(r as unknown as never, { onConflict: 'user_id,plan_id,phase' })
      const { error } = await up(row)
      if (error && /schema cache|PGRST204|column/i.test(error.message)) {
        for (const k of EXTRA_COLS) delete row[k]
        await up(row)
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plan_phase_goals'] }) },
  })

  const saveVolume = useMutation({
    mutationFn: async ({ planId, phase, muscle, targetSets }: {
      planId: string; phase: NutritionMode; muscle: LandmarkMuscle; targetSets: number
    }) => {
      // Self-healing: a missing plan_phase_volume table just means the defaults
      // keep applying — the paste-SQL adds it.
      await supabase.from('plan_phase_volume').upsert(
        { plan_id: planId, phase, muscle, target_sets: targetSets } as unknown as never,
        { onConflict: 'user_id,plan_id,phase,muscle' },
      ).then(() => {}, () => {})
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plan_phase_goals'] }) },
  })

  /** Resolved goals for a plan+phase: user override merged over the default. */
  const resolve = (planId: string, phase: NutritionMode): NutritionPreset => {
    const base = phaseGoalsFor(planId, phase)
    const o = overrideMap.get(planPhaseKey(planId, phase))
    if (!o) return base
    const merged = { ...base }
    // Only NON-NULL fields override — a cleared input falls back to the plan's
    // default rather than writing a zero goal.
    if (o.calorieGoal != null) merged.calorieGoal = o.calorieGoal
    if (o.proteinGoalG != null) merged.proteinGoalG = o.proteinGoalG
    if (o.carbsGoalG != null) merged.carbsGoalG = o.carbsGoalG
    if (o.fatGoalG != null) merged.fatGoalG = o.fatGoalG
    if (o.fiberMin != null) merged.fiberMin = o.fiberMin
    if (o.fiberMax != null) merged.fiberMax = o.fiberMax
    if (o.stepsGoal != null) merged.stepsGoal = o.stepsGoal
    if (o.targetWeightKg != null) merged.targetWeightKg = o.targetWeightKg
    if (o.targetBodyFatPct != null) merged.targetBodyFatPct = o.targetBodyFatPct
    if (o.targetMuscleMassKg != null) merged.targetMuscleMassKg = o.targetMuscleMassKg
    if (o.rateMinKgWk != null) merged.rateMinKgWk = o.rateMinKgWk
    if (o.rateMaxKgWk != null) merged.rateMaxKgWk = o.rateMaxKgWk
    return merged
  }

  /** Weekly set targets per muscle for a plan+phase, user overrides applied. */
  const resolveVolume = (planId: string, phase: NutritionMode): Record<LandmarkMuscle, number> => {
    const base = programTargets(phase as ProgramPhase)
    const out = { ...base }
    for (const m of LANDMARK_MUSCLES) {
      const v = volumeMap.get(`${planId}|${phase}|${m}`)
      if (v != null) out[m] = v
    }
    return out
  }

  return {
    overrides: overrideMap,
    resolve,
    resolveVolume,
    saveOverride: save.mutateAsync,
    saveVolumeTarget: saveVolume.mutateAsync,
  }
}
