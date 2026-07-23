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
  // Hevy-style set modifier. 'warmup' is excluded from volume/PR server-side.
  setType: z.enum(['normal', 'warmup', 'failure']).optional(),
  // Deck position of the parent exercise (all its sets share the value).
  exerciseOrder: z.number().int().nonnegative().optional(),
  // Seeds muscle data when the set's exercise is new to the catalog.
  muscleGroups: z.array(z.string()).optional(),
  // Unilateral: a split set is two rows sharing `pairId`, one per `side`.
  side: z.enum(['L', 'R']).optional(),
  pairId: z.string().max(64).optional(),
})

export const SaveWorkoutSchema = z.object({
  splitDay: z.enum(['push', 'pull', 'legs', 'upper', 'lower']),
  // `{ offset: true }` is load-bearing: an EDIT rebuilds its draft from the DB's
  // started_at, which PostgREST returns as `…+00:00` (numeric offset, not `Z`).
  // Bare .datetime() rejects offsets → every edit 422'd → the client masked it
  // as a false "duplicate" and silently dropped the edit. Accept both forms.
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
  sets: z.array(WorkoutSetSchema).min(1),
  notes: z.string().max(2000).default(''),
  // ── Command Center extensions (all optional — manual logger untouched) ──
  clientSessionId: z.string().min(1).max(64).optional(),  // coach session.id → dedupe key
  replaceSessionId: z.string().uuid().optional(),          // EDIT: replace this session in place
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

/**
 * Committed set count. A unilateral L/R split is ONE set logged as two sub-sets
 * sharing a `pairId`, so each pairId counts once; every non-paired row counts
 * once. (Volume still sums both sides elsewhere — only the COUNT de-duplicates.)
 */
export function countCommittedSets(sets: Array<{ pairId?: string }>): number {
  const paired = new Set<string>()
  let solo = 0
  for (const s of sets) {
    if (s.pairId) paired.add(s.pairId)
    else solo++
  }
  return solo + paired.size
}
