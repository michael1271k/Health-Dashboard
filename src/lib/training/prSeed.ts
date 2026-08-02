/**
 * The record book — ASSERTED, not derived.
 *
 * WHY THIS REPLACES DETECTION FOR THE JULY ERA
 * The engine can only call something a record by comparing it to an earlier set
 * it can see, and it could see neither the Hevy history nor the intent behind a
 * session. Two independent faults compounded that: duplicate catalog rows split
 * baselines, and several axes are arithmetic restatements of each other. The
 * ledger ended up holding 48 rows describing 21 achievements.
 *
 * Rather than tune the rules until the output happens to match, the July era is
 * declared: this list IS the record book for every session on or before
 * SEED_CUTOFF, and detection is suppressed there entirely. It cannot add to the
 * list and it cannot contradict it.
 *
 * From the day after SEED_CUTOFF the list is inert and detection runs normally
 * — against baselines still built from the FULL `workout_sets` history, not
 * from this list. That distinction matters: only 13 exercises appear here, so
 * making the seed the sole baseline would leave the other ~20 with no bar at
 * all and turn the first August session into a PR for nearly every set.
 *
 * The match is deliberately strict — date, exercise, set number, load AND reps
 * must all agree. Editing one of these sets makes it stop matching, which shows
 * up as a missing trophy rather than as a record silently attributed to a
 * number that was never lifted.
 *
 * Consumed by `detectSessionPrs` and, through it, by `scripts/backfill-prs.mjs`
 * and `scripts/nuke-and-seed-prs.mjs` — so a replay reproduces the list instead
 * of wiping it, and the backfill's prune pass can never delete a seeded row.
 */
import type { PrAxis } from './prEngine'
import { canonicalExerciseName } from '@/lib/exercises/aliases'

/** Last session date governed by the seed. After this, detection is live. */
export const SEED_CUTOFF = '2026-07-31'

export interface SeededPr {
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
}

/**
 * 21 records across 11 sessions. Every entry was checked against the live
 * `workout_sets` rows: each exists at the stated set number, load and reps.
 *
 * `volume` is a session-level axis — its ledger VALUE is the exercise's total
 * for that day, not the flagged set's own tonnage. `reps` on a timed hold is
 * seconds and displays as "Duration".
 */
export const SEEDED_PRS: readonly SeededPr[] = [
  // ── Jul 16 · Upper B ──
  { date: '2026-07-16', exercise: 'Preacher Curl (Machine)', setNumber: 2, weightKg: 17.5, reps: 12, axes: ['volume', 'e1rm'] },
  // ── Jul 17 · Legs & Core B ──
  { date: '2026-07-17', exercise: 'Hip Thrust (Machine)', setNumber: 1, weightKg: 25, reps: 14, axes: ['volume'] },
  // ── Jul 19 · Upper A ──
  { date: '2026-07-19', exercise: 'Face Pull', setNumber: 1, weightKg: 16.25, reps: 15, axes: ['volume', 'e1rm'] },
  // ── Jul 20 · Legs & Core A ──
  { date: '2026-07-20', exercise: 'Calf Press', setNumber: 1, weightKg: 67.5, reps: 15, axes: ['volume', 'e1rm'] },
  // ── Jul 21 · Delts & Arms ──
  { date: '2026-07-21', exercise: 'DB Shoulder Press', setNumber: 2, weightKg: 30, reps: 11, axes: ['volume', 'e1rm'] },
  // Logged under the since-merged `Cable Lateral Raise` row; canonicalised here.
  { date: '2026-07-21', exercise: 'Single Arm Lateral Raise (Cable)', setNumber: 3, weightKg: 5, reps: 10, axes: ['weight', 'e1rm'] },
  { date: '2026-07-21', exercise: 'Cable Overhead Extension', setNumber: 1, weightKg: 10, reps: 15, axes: ['volume'] },
  { date: '2026-07-21', exercise: 'Cable Overhead Extension', setNumber: 2, weightKg: 11.25, reps: 13, axes: ['e1rm'] },
  { date: '2026-07-21', exercise: 'DB Hammer Curl', setNumber: 1, weightKg: 20, reps: 12, axes: ['weight', 'volume', 'e1rm'] },
  // ── Jul 23 · Upper B ──
  { date: '2026-07-23', exercise: 'Neutral-Grip Lat Pulldown', setNumber: 2, weightKg: 47, reps: 9, axes: ['weight'] },
  { date: '2026-07-23', exercise: 'Single Arm Cable Crossover', setNumber: 2, weightKg: 8.75, reps: 12, axes: ['weight', 'e1rm'] },
  { date: '2026-07-23', exercise: 'Single Arm Lateral Raise (Cable)', setNumber: 2, weightKg: 5, reps: 13, axes: ['volume', 'e1rm'] },
  // ── Jul 24 · Legs & Core B ──
  { date: '2026-07-24', exercise: 'Romanian Deadlift (DB)', setNumber: 1, weightKg: 35, reps: 12, axes: ['weight', 'volume', 'e1rm'] },
  { date: '2026-07-24', exercise: 'Hip Thrust (Machine)', setNumber: 2, weightKg: 27.5, reps: 12, axes: ['e1rm'] },
  { date: '2026-07-24', exercise: 'Side Plank', setNumber: 1, weightKg: 0, reps: 57, axes: ['reps'] },
  // ── Jul 27 · Legs & Core A ──
  { date: '2026-07-27', exercise: 'Hack Squat', setNumber: 2, weightKg: 55, reps: 11, axes: ['volume', 'e1rm'] },
  // ── Jul 28 · Delts & Arms ──
  { date: '2026-07-28', exercise: 'Single Arm Lateral Raise (Cable)', setNumber: 1, weightKg: 5, reps: 15, axes: ['volume', 'e1rm'] },
  { date: '2026-07-28', exercise: 'Cable Overhead Extension', setNumber: 1, weightKg: 11.25, reps: 15, axes: ['volume', 'e1rm'] },
  // ── Jul 30 · Upper B ──
  { date: '2026-07-30', exercise: 'Seated Cable Row', setNumber: 2, weightKg: 42.5, reps: 10, axes: ['weight', 'volume', 'e1rm'] },
  // ── Jul 31 · Legs & Core B ──
  { date: '2026-07-31', exercise: 'Hip Thrust (Machine)', setNumber: 2, weightKg: 27.5, reps: 13, axes: ['volume', 'e1rm'] },
  { date: '2026-07-31', exercise: 'Side Plank', setNumber: 1, weightKg: 0, reps: 58, axes: ['reps'] },
]

/** Index built once — `${date}|${canonical name}|${setNumber}`. */
const INDEX = new Map<string, SeededPr>(
  SEEDED_PRS.map((p) => [`${p.date}|${canonicalExerciseName(p.exercise).toLowerCase()}|${p.setNumber}`, p]),
)

const near = (a: number, b: number) => Math.abs(a - b) < 0.001

/** Is this session date governed by the asserted record book? */
export function isSeededEra(date: string | null | undefined): boolean {
  return date != null && date <= SEED_CUTOFF
}

/**
 * The asserted axes for one logged set, or `[]`.
 *
 * `weightKg`/`reps` are verified rather than trusted, so an edited set drops out
 * of the seed instead of carrying a record it no longer earned.
 */
export function seededAxesFor(
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
