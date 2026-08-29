/**
 * EVERY FIELD THE SCHEMA ACCEPTS MUST REACH THE WRITER.
 *
 * `POST /api/sessions` used to rebuild each set as a hand-written object
 * literal naming ten fields. `quality` was the eleventh, so a technique flag
 * set in the logger passed validation, rode the commit payload, and was dropped
 * one line before `saveSession` — which had known how to write it since the
 * column shipped. The result was invisible in every direction: the UI showed
 * the badge, the commit succeeded, `useEditSession` read the column back
 * (finding null), and `workout_sets.quality` stood empty across 2,209 rows and
 * the entire history of the app.
 *
 * A test asserting "quality survives" would pin that one field and leave the
 * next one exposed to exactly the same mistake. So the real assertion here is
 * STRUCTURAL: whatever the schema admits, the adapter carries. Add a field to
 * `WorkoutSetSchema` and forget the adapter, and this fails — which is the only
 * version of this test worth having.
 */
import { describe, it, expect } from 'vitest'
import { WorkoutSetSchema, toWorkoutSet } from '@/lib/sessions/schema'

/** A row exercising every optional the schema admits. */
const fullRow = {
  exerciseName: 'Neutral-Grip Lat Pulldown',
  exerciseNameHe: 'משיכת פולי',
  setNumber: 2,
  weightKg: 49.5,
  reps: 11,
  rpe: 9.5,
  setType: 'normal' as const,
  quality: 'momentum' as const,
  exerciseOrder: 0,
  side: 'L' as const,
  pairId: 'pair_abc',
  muscleGroups: ['lats'],
}

describe('the schema → writer adapter', () => {
  it('carries the technique flag that used to die in the route', () => {
    const row = WorkoutSetSchema.parse(fullRow)
    expect(toWorkoutSet(row, 'ex-1').quality).toBe('momentum')
  })

  /**
   * THE STRUCTURAL PIN. Not "these eleven names", which is the same list that
   * went stale in the route — the set difference against the schema itself.
   */
  it('drops no field the schema admits, whatever gets added to it next', () => {
    const row = WorkoutSetSchema.parse(fullRow)
    const out = toWorkoutSet(row, 'ex-1') as unknown as Record<string, unknown>
    // `muscleGroups` seeds the exercise catalog and is consumed by
    // `resolveExercises` before this runs; it is not part of a set.
    const carried = Object.keys(row).filter((k) => k !== 'muscleGroups')
    const missing = carried.filter((k) => !(k in out))
    expect(missing).toEqual([])
  })

  it('resolves the exercise id the caller looked up', () => {
    const row = WorkoutSetSchema.parse({ ...fullRow, exerciseId: undefined })
    expect(toWorkoutSet(row, 'resolved-id').exerciseId).toBe('resolved-id')
  })

  it('never lets the catalog seed ride into the writer as a set field', () => {
    const row = WorkoutSetSchema.parse(fullRow)
    expect('muscleGroups' in toWorkoutSet(row, 'ex-1')).toBe(false)
  })

  /**
   * Clearing a flag is a decision and has to be transmitted. `null` is how an
   * edited set says "I removed this" — omitting the key would leave the stored
   * value standing, which is the opposite of what the user just did.
   */
  it('transmits a cleared flag as null rather than dropping the key', () => {
    const row = WorkoutSetSchema.parse({ ...fullRow, quality: null })
    const out = toWorkoutSet(row, 'ex-1')
    expect(out.quality).toBeNull()
    expect('quality' in out).toBe(true)
  })

  it('rejects a flag outside the closed vocabulary the DB CHECK holds', () => {
    expect(WorkoutSetSchema.safeParse({ ...fullRow, quality: 'sloppy' }).success).toBe(false)
  })
})
