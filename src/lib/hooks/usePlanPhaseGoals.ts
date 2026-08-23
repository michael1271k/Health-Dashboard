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
      /**
       * ── `user_id` IS PART OF THE ROW, AND WAS MISSING ──────────────────────
       * `plan_phase_goals`' primary key is `(user_id, plan_id, phase)`, the
       * column is NOT NULL with no default, and its RLS policy is
       * `auth.uid() = user_id` on both USING and WITH CHECK. This upsert sent
       * `plan_id` and `phase` and nothing else, so EVERY write this hook has
       * ever made was rejected — the table was empty on a live account that had
       * saved custom targets more than once.
       *
       * It failed silently for two compounding reasons, both fixed below:
       *   · the not-null error message contains the word "column", which the
       *     pre-migration retry below matched — so it stripped the newer columns
       *     and tried again, failed identically, and DISCARDED that result;
       *   · the caller in Settings wrapped the whole thing in `.catch(() => {})`.
       *
       * So Settings said "Saved!", `user_goals` really did take the numbers, and
       * `useNutritionGoals` — which resolves plan-phase BEFORE the stored row —
       * kept answering with the plan's authored defaults. The targets were saved
       * to the one place nothing reads.
       */
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in — targets were not saved.')
      const row: Record<string, unknown> = {
        user_id: session.user.id,
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
      if (!error) return
      /**
       * The pre-migration retry, narrowed. It used to match `/column/`, which
       * also matches `null value in column "user_id" … violates not-null
       * constraint` — so a hard constraint failure was treated as "this database
       * predates the extra columns", retried, and thrown away. Only PostgREST's
       * own schema-cache codes qualify now, and whatever the retry returns is
       * RAISED rather than swallowed.
       */
      if (!/schema cache|PGRST204|PGRST205/i.test(error.message)) throw new Error(error.message)
      for (const k of EXTRA_COLS) delete row[k]
      const retry = await up(row)
      if (retry.error) throw new Error(retry.error.message)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plan_phase_goals'] }) },
  })

  const saveVolume = useMutation({
    mutationFn: async ({ planId, phase, muscle, targetSets }: {
      planId: string; phase: NutritionMode; muscle: LandmarkMuscle; targetSets: number
    }) => {
      // Same missing `user_id` as `plan_phase_goals` above, same PK, same RLS —
      // and the same effect: nothing has ever been written here.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in — the set target was not saved.')
      // Self-healing on the TABLE only: a `plan_phase_volume` that was never
      // created just means the program defaults keep applying, and the paste-SQL
      // adds it. A row that is rejected for any other reason is a real failure
      // and now says so.
      const { error } = await supabase.from('plan_phase_volume').upsert(
        { user_id: session.user.id, plan_id: planId, phase, muscle, target_sets: targetSets } as unknown as never,
        { onConflict: 'user_id,plan_id,phase,muscle' },
      )
      if (error && !/schema cache|PGRST204|PGRST205|does not exist/i.test(error.message)) {
        throw new Error(error.message)
      }
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
