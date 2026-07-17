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
  exerciseOrder?: number        // deck position of the parent exercise
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
  dayKey?: string               // HELIX-5 program-day identity (cb_a … legs_b)
  coachReport?: unknown         // full validated coach JSON, archived as JSONB
  nextSessionFlag?: string
}

// Full 5-entry map — kept for history rendering (all historical split_day values)
// "lower" is legacy; new sessions use "legs" for the Legs day
export const PPL_SPLITS: Record<SplitDay, { label: string; labelHe: string; color: string }> = {
  push: {
    label: 'Push',
    labelHe: 'דחיפה',
    color: '#38E1FF',   // primary blue
  },
  pull: {
    label: 'Pull',
    labelHe: 'משיכה',
    color: '#43F59B',   // energy violet
  },
  legs: {
    label: 'Legs',
    labelHe: 'רגליים',
    color: '#4FC3FF',   // info blue
  },
  upper: {
    label: 'Upper',
    labelHe: 'פלג גוף עליון',
    color: '#19E3B1',   // success teal
  },
  lower: {
    label: 'Lower',     // legacy — maps to 'legs' in new sessions
    labelHe: 'פלג גוף תחתון',
    color: '#E8C57A',   // warm
  },
}

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
}

// Active nutrition targets. Helix Cut 5.1 opens 2026-07-15 — 1955 kcal split
// 170P / 195C / 55F (macros sum to exactly 1955 kcal).
export const NUTRITION_PRESETS: Record<NutritionMode, NutritionPreset> = {
  cut: {
    mode: 'cut',
    label: 'Cut',
    calorieGoal: 1955,
    proteinGoalG: 170,
    carbsGoalG: 195,
    fatGoalG: 55,
    fiberGoalG: 30,       // 28–35 g band
  },
  bulk: {
    mode: 'bulk',
    label: 'Lean Bulk',
    calorieGoal: 2550,    // start; titrate to 2,600–2,650
    proteinGoalG: 158,    // 155–160 g
    carbsGoalG: 337,      // 330–345 g
    fatGoalG: 70,         // HARD CAP
    fiberGoalG: 35,       // 33–38 g
  },
  maintenance: {
    mode: 'maintenance',
    label: 'Maintenance',
    calorieGoal: 2375,    // 2,350–2,400 band
    proteinGoalG: 160,    // ≥ 160 g
    carbsGoalG: 270,
    fatGoalG: 75,
    fiberGoalG: 30,
  },
}
