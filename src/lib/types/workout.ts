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

// PPL+ split schedule
// Sun=Push, Mon=Pull, Tue=Legs, Wed=Rest, Thu=Upper, Fri=Lower, Sat=Rest
export const PPL_SPLITS: Record<SplitDay, { label: string; labelHe: string; color: string }> = {
  push: {
    label: 'Push',
    labelHe: 'דחיפה',
    color: '#3D7DFF',   // primary blue
  },
  pull: {
    label: 'Pull',
    labelHe: 'משיכה',
    color: '#7C5CFF',   // energy violet
  },
  legs: {
    label: 'Legs',
    labelHe: 'רגליים',
    color: '#38BDF8',   // info blue
  },
  upper: {
    label: 'Upper',
    labelHe: 'פלג גוף עליון',
    color: '#2DD4A7',   // success teal
  },
  lower: {
    label: 'Lower',
    labelHe: 'פלג גוף תחתון',
    color: '#FFB020',   // warm
  },
}

// Cut preset — intentional: 55g fat is strict but deliberate (0.3–0.4 kg/wk loss)
export const CUT_PRESET = {
  calorieGoal: 1935,
  proteinGoalG: 180,
  carbsGoalG: 180,
  fatGoalG: 55,
  goalPreset: 'cut',
} as const
