import { z } from 'zod'

export const WorkoutSetSchema = z.object({
  // Optional: the Command Center commits by name; the route resolves UUIDs
  // via resolveExercises (alias-aware) before saving.
  exerciseId: z.string().uuid().optional(),
  exerciseName: z.string().min(1),
  exerciseNameHe: z.string().optional(),
  setNumber: z.number().int().positive(),
  // Nonnegative (not positive): bodyweight movements commit with 0 kg.
  weightKg: z.number().nonnegative(),
  reps: z.number().int().positive(),
  rpe: z.number().min(1).max(10).optional(),
  // Deck position of the parent exercise (all its sets share the value).
  exerciseOrder: z.number().int().nonnegative().optional(),
  // Live-mode check-off — un-done sets are dropped client-side at commit,
  // so this survives only in drafts; stripped before insert regardless.
  done: z.boolean().optional(),
  // Seeds muscle data when the set's exercise is new to the catalog.
  muscleGroups: z.array(z.string()).optional(),
})

export const SaveWorkoutSchema = z.object({
  splitDay: z.enum(['push', 'pull', 'legs', 'upper', 'lower']),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  sets: z.array(WorkoutSetSchema).min(1),
  notes: z.string().max(2000).default(''),
  // ── Command Center extensions (all optional — manual logger untouched) ──
  clientSessionId: z.string().min(1).max(64).optional(),  // coach session.id → dedupe key
  dayKey: z.enum(['cb_a', 'legs_a', 'arms', 'cb_b', 'legs_b']).optional(),
  coachReport: z.unknown().optional(),                    // validated client-side; archived as JSONB
  nextSessionFlag: z.string().max(300).optional(),
  reportMd: z.string().max(2000).optional(),              // coach_insight (no LLM call on JSON ingests)
  metrics: z.object({
    durationMin: z.number().nullable().optional(),
    avgBpm: z.number().nullable().optional(),
    caloriesBurned: z.number().nullable().optional(),
  }).optional(),
})

export type SaveWorkoutInput = z.infer<typeof SaveWorkoutSchema>
