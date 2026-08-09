import { SPLIT, STEEL } from '@/lib/theme/palette'
import type { Tables } from '@/lib/supabase/types'

export type SplitDay = 'push' | 'pull' | 'legs' | 'upper' | 'lower'

export type Exercise = Tables<'exercises'>

export interface WorkoutSet {
  exerciseId: string
  exerciseName: string
  exerciseNameHe?: string
  setNumber: number
  weightKg: number
  reps: number
  rpe?: number
  setType?: 'normal' | 'warmup' | 'failure' | 'dropset'  // Hevy-style modifier; warmups + drop sets excluded from PR
  exerciseOrder?: number        // deck position of the parent exercise
  // Unilateral (per-side) tracking. A split set persists as TWO rows sharing
  // `pairId`, one side 'L' one 'R'. Absent = a normal bilateral set.
  side?: 'L' | 'R'
  pairId?: string
}

// In-progress workout session (client-side, before saved to DB)
export interface ActiveWorkoutSession {
  splitDay: SplitDay
  startedAt: string             // ISO 8601
  sets: WorkoutSet[]
  notes: string                 // supports Hebrew
}

// Completed session ready to save
export interface SaveWorkoutPayload {
  splitDay: SplitDay
  startedAt: string
  endedAt: string
  sets: WorkoutSet[]
  notes: string
  // ── Command Center extensions (optional on every legacy path) ──
  clientSessionId?: string      // coach session.id — idempotency/dedupe key
  replaceSessionId?: string     // EDIT flow: delete this session then re-insert
  dayKey?: string               // HELIX-5 program-day identity (cb_a … legs_b)
  coachReport?: unknown         // full validated coach JSON, archived as JSONB
  nextSessionFlag?: string
  sessionRpe?: number           // Borg CR10 session effort (1–10, 0.5 steps)
}

// Full 5-entry map — kept for history rendering (all historical split_day values)
// "lower" is legacy; new sessions use "legs" for the Legs day
export const PPL_SPLITS: Record<SplitDay, { label: string; labelHe: string; color: string }> = {
  push: {
    label: 'Push',
    labelHe: 'דחיפה',
    color: SPLIT.push,
  },
  pull: {
    label: 'Pull',
    labelHe: 'משיכה',
    color: SPLIT.pull,
  },
  legs: {
    label: 'Legs',
    labelHe: 'רגליים',
    color: SPLIT.legs,
  },
  upper: {
    label: 'Upper',
    labelHe: 'פלג גוף עליון',
    color: SPLIT.upper,
  },
  lower: {
    label: 'Lower',     // legacy — maps to 'legs' in new sessions
    labelHe: 'פלג גוף תחתון',
    color: SPLIT.lower,
  },
}

/**
 * Canonical split accent for any split_day string.
 *
 * Re-exported from the palette, which is now the only implementation — this
 * module had one, and VolumeChart had a private third. Kept here so existing
 * importers do not move in the same commit that unified the values.
 */
export { splitColor } from '@/lib/theme/palette'

// ─── Nutrition modes / presets ───────────────────────────────────────────────
export type NutritionMode = 'cut' | 'bulk' | 'maintenance'

export interface NutritionPreset {
  mode: NutritionMode
  label: string
  calorieGoal: number
  proteinGoalG: number | null   // null = no macro target (graded on calories only)
  carbsGoalG: number | null
  fatGoalG: number | null
  fiberGoalG: number | null
  /** Daily step goal for the phase (a cut leans on NEAT more than a bulk). */
  stepsGoal: number
  /**
   * A STARTING target bodyweight for the phase (kg). Selecting the phase in
   * Settings seeds `user_goals.target_weight_kg` with this; the user can then
   * fine-tune the exact number. Deliberately a suggestion, not a hard constant.
   */
  targetWeightKg: number
  /** Starting body-composition targets for the phase — the numbers the phase is
   *  steering toward (BIA %, kg). Seeded into user_goals like targetWeightKg;
   *  optional so a preset can omit them. */
  targetBodyFatPct?: number | null
  targetMuscleMassKg?: number | null
  /** Display-only phase goals shown in the Settings plan preview (not persisted —
   *  no user_goals column). Waist target, the weekly bodyweight-rate band, a bulk
   *  body-fat ceiling, and the fiber band the single fiberGoalG sits inside. */
  // NO targetWaistCm. Helix does not track tape measurements — see the note in
  // lib/body/composition.ts. A goal you cannot measure is not a goal.
  rateMinKgWk?: number | null   // signed: cut negative, bulk positive
  rateMaxKgWk?: number | null
  bodyFatCeilingPct?: number | null
  fiberMin?: number | null
  fiberMax?: number | null
}

// The DEFAULT (Helix) nutrition targets per phase. A plan can override any of
// these via PLAN_PHASES (PPL runs a leaner cut). Cut = 1950 kcal / 170P·195C·55F;
// Lean Bulk = 2600 / 160P·330C·70F (fat is a hard cap).
export const NUTRITION_PRESETS: Record<NutritionMode, NutritionPreset> = {
  cut: {
    mode: 'cut',
    label: 'Cut',
    calorieGoal: 1950,
    proteinGoalG: 170,
    carbsGoalG: 195,
    fatGoalG: 55,
    fiberGoalG: 30,       // 28–35 g band
    fiberMin: 28, fiberMax: 35,
    stepsGoal: 10000,
    targetWeightKg: 62,   // cut-exit ballpark; adjust in Settings
    targetBodyFatPct: 13.0,   // cut-exit gate (7-day avg BIA)
    targetMuscleMassKg: 33.0,
    rateMinKgWk: -0.50, rateMaxKgWk: -0.40,
  },
  bulk: {
    mode: 'bulk',
    label: 'Lean Bulk',
    calorieGoal: 2600,
    proteinGoalG: 160,
    carbsGoalG: 330,
    fatGoalG: 70,         // HARD CAP
    fiberGoalG: 35,       // 33–38 g
    fiberMin: 33, fiberMax: 38,
    stepsGoal: 8000,
    targetWeightKg: 70,
    targetBodyFatPct: 15.0,
    bodyFatCeilingPct: 16.0,  // 15–16% BIA ceiling
    targetMuscleMassKg: 37.0,
    rateMinKgWk: 0.20, rateMaxKgWk: 0.25,
  },
  maintenance: {
    mode: 'maintenance',
    label: 'Maintenance',
    calorieGoal: 2375,    // 2,350–2,400 band
    proteinGoalG: 160,    // ≥ 160 g
    carbsGoalG: 270,
    fatGoalG: 75,
    fiberGoalG: 30,
    fiberMin: 28, fiberMax: 35,
    stepsGoal: 9000,
    targetWeightKg: 64,
    targetBodyFatPct: 13.5,
    targetMuscleMassKg: 35.0,
  },
}

/**
 * Per-PLAN phase overrides layered on top of NUTRITION_PRESETS. Helix-4 and
 * Helix-5 share the defaults; PPL Legacy ran a leaner cut (1935 kcal, higher
 * protein). Keyed by the plan's program id.
 */
export const PLAN_PHASES: Record<string, Partial<Record<NutritionMode, Partial<NutritionPreset>>>> = {
  ppl: {
    cut: {
      label: 'PPL Cut',
      calorieGoal: 1935,
      proteinGoalG: 180,
      carbsGoalG: 180,
      fatGoalG: 55,
    },
  },
}

/** The resolved phase goals for a plan — the plan override merged over the Helix
 *  default. Every macro/target consumer (Settings preview, applyPhase) reads this
 *  so PPL's cut shows its own numbers, not Helix's. */
export function phaseGoalsFor(planId: string, mode: NutritionMode): NutritionPreset {
  const base = NUTRITION_PRESETS[mode]
  const override = PLAN_PHASES[planId]?.[mode]
  return override ? { ...base, ...override } : base
}
