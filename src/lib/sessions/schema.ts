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
  // Hevy-style set modifier. 'warmup' + 'dropset' are excluded from PR server-side.
  setType: z.enum(['normal', 'warmup', 'failure', 'dropset']).optional(),
  // Deck position of the parent exercise (all its sets share the value).
  exerciseOrder: z.number().int().nonnegative().optional(),
  // Seeds muscle data when the set's exercise is new to the catalog.
  muscleGroups: z.array(z.string()).optional(),
  // Unilateral: a split set is two rows sharing `pairId`, one per `side`.
  side: z.enum(['L', 'R']).optional(),
  pairId: z.string().max(64).optional(),
  /*
   * `restSec` used to be accepted here — MEASURED rest, from the deck's
   * stopwatch. The stopwatch went on 2026-08-19 and the column it fed has now
   * gone with it; nothing in the app has sent the field since.
   *
   * Dropping it from the schema is safe rather than breaking: zod strips
   * unknown keys by default, so a draft that has been sitting in localStorage
   * since before the change still commits — the stale field is simply ignored
   * instead of being written to a column that no longer exists.
   */
})

/**
 * A cardio block logged INSIDE a lifting session — the treadmill warm-up, or a
 * finisher.
 *
 * It used to be flattened into `notes` at commit ("Cardio — Treadmill: 0.4 km ·
 * 5 min") and there was no way back: the edit deck reads `workout_sets`, which
 * never held it, so re-opening a session showed the block as a line of prose in
 * the notes box. Structured here, it round-trips.
 */
export const WorkoutCardioSchema = z.object({
  name: z.string().min(1).max(120),
  distanceKm: z.number().nonnegative().optional(),
  durationSec: z.number().int().nonnegative().optional(),
  /** Treadmill gradient, percent. Capped well above any real machine. */
  inclinePct: z.number().nonnegative().max(50).optional(),
  note: z.string().max(300).optional(),
  /**
   * Position among ALL deck entries, cardio and strength together.
   *
   * `WorkoutSetSchema.exerciseOrder` counts strength exercises ONLY (cardio
   * consumes no slot, so a 0 kg junk row never reaches workout_sets), which
   * makes the two orders incomparable. This is the one number that says whether
   * a block was a warm-up or a finisher, and the routine template needs it to
   * re-seed the deck in the order it was performed.
   */
  deckOrder: z.number().int().nonnegative().optional(),
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
  /** Cardio blocks in deck order. Written to `cardio_logs`, not `workout_sets`. */
  cardio: z.array(WorkoutCardioSchema).optional(),
  notes: z.string().max(2000).default(''),
  // ── Command Center extensions (all optional — manual logger untouched) ──
  clientSessionId: z.string().min(1).max(64).optional(),  // coach session.id → dedupe key
  replaceSessionId: z.string().uuid().optional(),          // EDIT: replace this session in place
  dayKey: z.enum(['cb_a', 'legs_a', 'arms', 'cb_b', 'legs_b']).optional(),
  coachReport: z.unknown().optional(),                    // validated client-side; archived as JSONB
  nextSessionFlag: z.string().max(300).optional(),
  // Borg CR10 session effort. Half-steps are meaningful on a ratio scale, so
  // this is not an int.
  sessionRpe: z.number().min(1).max(10).optional(),
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
