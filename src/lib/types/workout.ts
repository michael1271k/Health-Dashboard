import type { Tables } from '@/lib/supabase/types'

export type SplitDay = 'push' | 'pull' | 'legs'

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

// PPL split configuration
export const PPL_SPLITS: Record<SplitDay, { label: string; labelHe: string; color: string }> = {
  push: {
    label: 'Push',
    labelHe: 'דחיפה',
    color: '#00E5A0',   // primary
  },
  pull: {
    label: 'Pull',
    labelHe: 'משיכה',
    color: '#7C5CFF',   // energy
  },
  legs: {
    label: 'Legs',
    labelHe: 'רגליים',
    color: '#38BDF8',   // info
  },
}
