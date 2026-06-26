import { z } from 'zod'

export const WorkoutSetSchema = z.object({
  exerciseId: z.string().uuid(),
  exerciseName: z.string().min(1),
  exerciseNameHe: z.string().optional(),
  setNumber: z.number().int().positive(),
  weightKg: z.number().positive(),
  reps: z.number().int().positive(),
  rpe: z.number().min(1).max(10).optional(),
})

export const SaveWorkoutSchema = z.object({
  splitDay: z.enum(['push', 'pull', 'legs', 'upper', 'lower']),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  sets: z.array(WorkoutSetSchema).min(1),
  notes: z.string().max(2000).default(''),
})

export type SaveWorkoutInput = z.infer<typeof SaveWorkoutSchema>
