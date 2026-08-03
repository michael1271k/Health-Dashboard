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
 * INDIVIDUAL SESSIONS AFTER THE CUTOFF CAN ALSO BE ASSERTED, via
 * `ASSERTED_DATES`. The cutoff governs a contiguous era; a single corrected
 * session is a different thing and must not require dragging the era forward
 * over the days in between. Adding a date there suppresses detection for that
 * session ALONE — every other post-cutoff session still derives normally.
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

/** Last session date governed by the seed ERA. After this, detection is live. */
export const SEED_CUTOFF = '2026-07-31'

/**
 * Post-cutoff sessions whose record set is asserted rather than derived.
 *
 * 2026-08-02 (Upper A) — detection awarded 8 axes across 5 exercises; the real
 * count is 3. Two independent causes, both of which outlive this session:
 *
 *   1. A corrupt baseline. `Incline DB Press` held 63.75 kg × 12 on 2026-07-26,
 *      between 35 kg on 07-19 and 40 kg on 08-02 — a mis-entry, and while it
 *      stood nothing under 63.75 kg could win the weight or e1RM axis, which is
 *      exactly why the two records the athlete DID earn (40 kg × 10 · weight +
 *      1RM) went unflagged. FIXED 2026-08-03: the row is now 35 kg × 12, its
 *      true load (`scripts/correct-logged-sets.mjs`).
 *   2. Raw axis counting (the 2026-08-02 subsumption reversal, deliberate) means
 *      one improved set can carry `reps` + `e1rm` + a session `volume` axis with
 *      it. Seated Cable Row 42.5 × 13 alone produced three.
 *
 * Cause 1 is gone: against the repaired baseline, derived detection now finds
 * BOTH Incline DB Press records on its own, exactly the two axes seeded below.
 * Cause 2 has shrunk but not vanished. The 2026-08-03 axis rules — `reps` only
 * on unweighted work, `volume` a single-set record rather than a session total
 * — cut derived detection on this session from 10 axes to 5 against the asserted
 * 3, so the assertion stays. It is now a small correction rather than a rewrite,
 * and a future session should not need one.
 */
export const ASSERTED_DATES: readonly string[] = ['2026-08-02']

const ASSERTED = new Set(ASSERTED_DATES)

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
 * 23 records across 12 sessions. Every entry was checked against the live
 * `workout_sets` rows: each exists at the stated set number, load and reps.
 *
 * `volume` was a session-level axis when this list was curated, so its entries
 * name the set that COMPLETED the exercise's best session total. Since
 * 2026-08-03 the axis is per-set (best single-set tonnage), which changes the
 * ledger VALUE a replay writes for these rows — the set, and therefore the
 * trophy, is unchanged. The list is asserted, so the axes themselves stand
 * whatever the derivation rules say. `reps` on a timed hold is seconds and
 * displays as "Duration".
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
  // ── Aug 2 · Upper A — asserted, not derived (see ASSERTED_DATES) ──
  { date: '2026-08-02', exercise: 'Incline DB Press', setNumber: 2, weightKg: 40, reps: 10, axes: ['weight', 'e1rm'] },
  { date: '2026-08-02', exercise: 'Chest Press (Machine)', setNumber: 2, weightKg: 40, reps: 8, axes: ['weight'] },
]

/** Index built once — `${date}|${canonical name}|${setNumber}`. */
const INDEX = new Map<string, SeededPr>(
  SEEDED_PRS.map((p) => [`${p.date}|${canonicalExerciseName(p.exercise).toLowerCase()}|${p.setNumber}`, p]),
)

const near = (a: number, b: number) => Math.abs(a - b) < 0.001

/**
 * Is this session's record set asserted rather than derived?
 *
 * True for the whole seeded era (≤ SEED_CUTOFF) and for any individually
 * corrected session listed in `ASSERTED_DATES`.
 */
export function isAssertedSession(date: string | null | undefined): boolean {
  if (date == null) return false
  return date <= SEED_CUTOFF || ASSERTED.has(date)
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
