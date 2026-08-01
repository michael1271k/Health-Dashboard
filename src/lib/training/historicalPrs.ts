/**
 * Records that predate Helix.
 *
 * The engine can only ever detect a record by comparing a set against an
 * EARLIER set it can see. Everything logged in Hevy before the migration is
 * invisible to it, so the first Helix session for a movement looks like a
 * baseline being established rather than a record being broken — and it is
 * correctly not flagged. For four sets that reading is wrong: they were real
 * all-time bests carried over from the old profile.
 *
 * These are ASSERTED, not derived. That is the whole point of keeping them in
 * their own module: `detectSessionPrs` unions them in on top of normal
 * detection, `scripts/backfill-prs.mjs` imports the same list, and so a replay
 * reproduces them instead of wiping them. There is no exception list to
 * remember to re-apply.
 *
 * The match is deliberately strict — date, exercise, set number, load AND reps
 * must all agree. Editing one of these sets makes it stop matching, which
 * surfaces as a missing trophy rather than as a record silently attributed to
 * a number you never lifted.
 */
import type { PrAxis } from './prEngine'
import { canonicalExerciseName } from '@/lib/exercises/aliases'

export interface HistoricalPr {
  /** Session date, ISO `YYYY-MM-DD`. */
  date: string
  /** Exercise name as logged; compared canonicalised. */
  exercise: string
  /** 1-based set number within the exercise. */
  setNumber: number
  weightKg: number
  /** Reps, or SECONDS for a timed hold. */
  reps: number
  axes: PrAxis[]
  why: string
}

export const HISTORICAL_PRS: readonly HistoricalPr[] = [
  {
    date: '2026-07-17', exercise: 'Hip Thrust (Machine)', setNumber: 1,
    weightKg: 25, reps: 14, axes: ['volume'],
    why: 'Hevy-era volume best; first Helix hip thrust so nothing to compare against.',
  },
  {
    date: '2026-07-19', exercise: 'Face Pull', setNumber: 1,
    weightKg: 16.25, reps: 15, axes: ['volume', 'e1rm'],
    why: 'Hevy-era best; first Helix face pull.',
  },
  {
    date: '2026-07-21', exercise: 'Cable Overhead Extension', setNumber: 1,
    weightKg: 10, reps: 15, axes: ['volume'],
    why: 'Hevy-era volume best. Set 2 that day legitimately took weight + e1rm.',
  },
  {
    date: '2026-07-21', exercise: 'DB Hammer Curl', setNumber: 1,
    weightKg: 20, reps: 12, axes: ['weight', 'volume', 'e1rm'],
    why: 'Hevy-era best; first Helix hammer curl.',
  },
]

/** Index built once — `${date}|${canonical name}|${setNumber}`. */
const INDEX = new Map<string, HistoricalPr>(
  HISTORICAL_PRS.map((p) => [`${p.date}|${canonicalExerciseName(p.exercise).toLowerCase()}|${p.setNumber}`, p]),
)

const near = (a: number, b: number) => Math.abs(a - b) < 0.001

/**
 * The asserted axes for one logged set, or `[]`.
 *
 * `weightKg`/`reps` are verified rather than trusted so an edited set drops out
 * of the override instead of carrying a record it no longer earned.
 */
export function historicalAxesFor(
  date: string | null | undefined,
  exercise: string | null | undefined,
  setNumber: number | null | undefined,
  weightKg: number,
  reps: number,
): PrAxis[] {
  if (!date || !exercise || setNumber == null) return []
  const hit = INDEX.get(`${date}|${canonicalExerciseName(exercise).toLowerCase()}|${setNumber}`)
  if (!hit) return []
  if (!near(hit.weightKg, weightKg) || hit.reps !== reps) return []
  return hit.axes
}
