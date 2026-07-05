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
}

// Full 5-entry map — kept for history rendering (all historical split_day values)
// "lower" is legacy; new sessions use "legs" for Legs/Lower
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
    label: 'Legs/Lower',
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

// Logger-only 4-entry list — English only, no Hebrew, canonical Legs/Lower → 'legs'
// Used by SplitPicker to render the 4 active training splits in one row.
export const LOGGER_SPLITS: Array<{ day: SplitDay; label: string; color: string }> = [
  { day: 'upper', label: 'Upper',      color: '#19E3B1' },
  { day: 'legs',  label: 'Legs/Lower', color: '#4FC3FF' },
  { day: 'push',  label: 'Push',       color: '#38E1FF' },
  { day: 'pull',  label: 'Pull',       color: '#43F59B' },
]

// Fixed-weekday cycle (Sun–Sat):
//   Sun=Upper, Mon=Legs/Lower, Tue=Push, Wed=Pull, Thu=Legs/Lower, Fri=Rest, Sat=Rest
// Single source of truth for the logger's default suggestion and scoring's rest-day detection.
export const WEEKDAY_SPLIT: Record<number, SplitDay | 'rest'> = {
  0: 'upper',  // Sunday
  1: 'legs',   // Monday
  2: 'push',   // Tuesday
  3: 'pull',   // Wednesday
  4: 'legs',   // Thursday
  5: 'rest',   // Friday
  6: 'rest',   // Saturday
}

export function getTodaysSplit(): SplitDay | 'rest' {
  return WEEKDAY_SPLIT[new Date().getDay()] ?? 'rest'
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

// AXIS blueprint anchors (Phase 12). Cut is the active phase.
export const CUT_PRESET = {
  calorieGoal: 1950,
  proteinGoalG: 170,
  carbsGoalG: 195,
  fatGoalG: 55,
  goalPreset: 'cut',
} as const

export const NUTRITION_PRESETS: Record<NutritionMode, NutritionPreset> = {
  cut: {
    mode: 'cut',
    label: 'Cut',
    calorieGoal: 1950,
    proteinGoalG: 170,
    carbsGoalG: 195,
    fatGoalG: 55,
    fiberGoalG: 30,
  },
  bulk: {
    mode: 'bulk',
    label: 'Lean Bulk',
    calorieGoal: 2600,
    proteinGoalG: 158,
    carbsGoalG: 337,
    fatGoalG: 70,
    fiberGoalG: 35,
  },
  maintenance: {
    mode: 'maintenance',
    label: 'Maintenance',
    calorieGoal: 2400,
    proteinGoalG: 165,
    carbsGoalG: 270,
    fatGoalG: 75,
    fiberGoalG: 30,
  },
}
