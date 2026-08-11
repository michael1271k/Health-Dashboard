import type { PrAxis } from './prEngine'

/**
 * THE ASSERTED RECORD BOOK — the all-time floor every axis must clear.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `workout_sets` is not a complete history. 75 of the 94 sessions in the
 * database — every one from March through June 2026 — are Notion-era shells
 * carrying an aggregate `total_volume_kg` and ZERO sets:
 *
 *     2026-03   16 sessions     0 sets
 *     2026-04   19 sessions     0 sets
 *     2026-05   20 sessions     0 sets
 *     2026-06   20 sessions     0 sets
 *     2026-07   12 sessions   226 sets
 *     2026-08    7 sessions   135 sets
 *
 * So `buildBaselines` sees roughly four weeks of lifting and calls it "all
 * time". Every load that was heavier before July looks like a new best the
 * moment it comes back around. On 2026-08-10 a Calf Press at 70 kg was flagged
 * a Weight PR — correctly, on the evidence available, because Helix has never
 * seen this athlete above 67.5 kg. The real all-time best is 72.5 kg, set in a
 * session Helix has no sets for.
 *
 * At least ten more were queued behind it: Leg Press (80 vs 72.5 logged), Leg
 * Extension (42.5 vs 37.5), Seated Leg Curl (50 vs 45), Pec Deck (55 vs 52.5),
 * Lat Pulldown (49.5 vs 47), Straight-Arm Pulldown (17.5 vs 16.25), Cable
 * Overhead Extension (12.5 vs 11.25), DB Shoulder Press (31 vs 30).
 *
 * Deleting the offending ledger row fixes nothing — the baseline is still 67.5,
 * so the next 70 kg calf press flags again. The fix is to give the engine the
 * floor it is missing. `buildBaselines` takes `max(logged, asserted)`, so a
 * record now requires beating the ALL-TIME best rather than merely the best
 * Helix happens to have witnessed.
 *
 * ── WHAT THIS FILE IS NOT ────────────────────────────────────────────────────
 * It does not close the hole. Session volume, muscle tonnage, progression
 * trails and any future ACWR still see a history that begins 2026-07-16. Only
 * a real import of the missing sessions fixes those, through the Hevy parser
 * that already exists. This file floors the RECORDS and nothing else.
 *
 * ── THE ESTIMATOR DIVERGES, DELIBERATELY UNRESOLVED ──────────────────────────
 * These figures come from Hevy, whose 1RM estimate is not Epley. Calf Press is
 * asserted at 100.75 while `epley1RM(67.5, 15)` — Helix's own arithmetic on the
 * asserted best set — is 101.25. Face Pull asserts 24.25 against Epley's 24.38.
 * The gap runs under ~1 kg throughout and is not worth reconciling: taking the
 * max of the two errs toward "this was not a record", which is the honest
 * direction for a floor.
 *
 * ── UNILATERAL SESSION VOLUME ────────────────────────────────────────────────
 * Hevy counts one side of a unilateral exercise; Helix sums both. So Single Arm
 * Lateral Raise asserts 272.5 where Helix has genuinely logged 301.25, and
 * Single Arm Triceps Pushdown asserts 175 against 262.5. `max(logged, asserted)`
 * keeps Helix's larger figure and no spurious flag fires. Do not "correct" the
 * asserted numbers upward — they are what Hevy reports, and the max resolves it.
 *
 * ── ADDING TO THIS FILE ──────────────────────────────────────────────────────
 * Keys are CANONICAL exercise names (post-`canonicalExerciseName`) and must
 * match a row in the `exercises` table that has logged sets. The table holds 29
 * zero-set duplicates that will silently swallow a floor — `Calf Press
 * (Machine)`, `Straight Arm Pulldown (Rope)` and a bare `Seated Cable Row` all
 * exist and are all wrong. `pr-truth.test.ts` fails the suite on a key that
 * does not resolve, because a typo here is invisible until the next heavy
 * session flags a PR that is not one.
 */

/** Everything asserted about one exercise. Every field is optional. */
export interface TruthRecord {
  /** Heaviest single working set, kg. Floors the `weight` axis. */
  weight?: number
  /** Best estimated 1RM, kg, as Hevy reports it. Floors the `e1rm` axis. */
  e1rm?: number
  /** Heaviest single set as `kg × reps`. Floors the `volume` axis at their product. */
  setVolume?: { kg: number; reps: number }
  /** Best tonnage across one session for this exercise. Floors `sessionVolume`. */
  sessionVolume?: number
  /**
   * Best reps in one set — UNLOADED movements only, where reps are the record.
   * Floors the `reps` axis at load 0 (`repsAxisEligible` is `weightKg === 0`).
   */
  reps?: number
  /** Best hold, seconds. Timed movements only; floors the `reps`/Duration axis. */
  seconds?: number
  /**
   * Most reps across one session. REFERENCE ONLY — there is no session-reps
   * axis, and at zero load `sessionVolume` is always 0, so this cannot floor
   * anything. Recorded so the number is not lost.
   */
  sessionReps?: number
}

/** The date this book was asserted. Written to `personal_records.achieved_on`. */
export const PR_TRUTH_AS_OF = '2026-08-10'

/**
 * All-time bests as of {@link PR_TRUTH_AS_OF}, keyed by canonical exercise name.
 * `setVolume` is stored as the set that made it so the ledger can show the lift,
 * not just the product.
 */
export const PR_TRUTH: Readonly<Record<string, TruthRecord>> = {
  // ── Push ──────────────────────────────────────────────────────────────────
  'Incline DB Press':                    { weight: 40,    e1rm: 53.33,  setVolume: { kg: 36,    reps: 12 }, sessionVolume: 1260 },
  'Chest Press (Machine)':               { weight: 40,    e1rm: 53.33,  setVolume: { kg: 37.5,  reps: 12 }, sessionVolume: 1417.5 },
  'Pec Deck':                            { weight: 55,    e1rm: 75.34,  setVolume: { kg: 50,    reps: 15 }, sessionVolume: 2150 },
  'Single Arm Cable Crossover':          { weight: 8.75,  e1rm: 12.32,  setVolume: { kg: 7.5,   reps: 15 }, sessionVolume: 217.5 },
  'DB Shoulder Press':                   { weight: 31,    e1rm: 42.25,  setVolume: { kg: 30,    reps: 12 }, sessionVolume: 990 },
  'Single Arm Lateral Raise (Cable)':    { weight: 5,     e1rm: 7.81,   setVolume: { kg: 5,     reps: 17 }, sessionVolume: 272.5 },
  'Cable Overhead Extension':            { weight: 12.5,  e1rm: 16.79,  setVolume: { kg: 11.25, reps: 15 }, sessionVolume: 446.25 },
  'Rope Triceps Pushdown':               { weight: 15,    e1rm: 22.39,  setVolume: { kg: 15,    reps: 15 }, sessionVolume: 795 },
  'Single Arm Triceps Pushdown (Cable)': { weight: 6.25,  e1rm: 9.33,   setVolume: { kg: 6.25,  reps: 15 }, sessionVolume: 175 },

  // ── Pull ──────────────────────────────────────────────────────────────────
  'Lat Pulldown':                        { weight: 49.5,  e1rm: 67.81,  setVolume: { kg: 45,    reps: 13 }, sessionVolume: 1764 },
  'Neutral-Grip Lat Pulldown':           { weight: 47,    e1rm: 64.38,  setVolume: { kg: 45,    reps: 12 }, sessionVolume: 1080 },
  'Seated Cable Row (V-Grip)':           { weight: 50,    e1rm: 62.5,   setVolume: { kg: 42.5,  reps: 14 }, sessionVolume: 1572.5 },
  'Seated Cable Row (Wide Grip)':        { weight: 42.5,  e1rm: 58.22,  setVolume: { kg: 42.5,  reps: 11 }, sessionVolume: 887.5 },
  'Straight-Arm Pulldown':               { weight: 17.5,  e1rm: 24.65,  setVolume: { kg: 16.25, reps: 15 }, sessionVolume: 682.5 },
  'Face Pull':                           { weight: 16.25, e1rm: 24.25,  setVolume: { kg: 16.25, reps: 15 }, sessionVolume: 840 },
  'Seated Incline DB Curl':              { weight: 16,    e1rm: 22.54,  setVolume: { kg: 16,    reps: 12 }, sessionVolume: 512 },
  'DB Hammer Curl':                      { weight: 20,    e1rm: 28.17,  setVolume: { kg: 20,    reps: 12 }, sessionVolume: 720 },
  'Reverse EZ-Bar Curl':                 { weight: 15,    e1rm: 21.43,  setVolume: { kg: 15,    reps: 13 }, sessionVolume: 390 },
  'Preacher Curl (Machine)':             { weight: 17.5,  e1rm: 24.65,  setVolume: { kg: 17.5,  reps: 12 }, sessionVolume: 600 },

  // ── Legs ──────────────────────────────────────────────────────────────────
  'Leg Press':                           { weight: 80,    e1rm: 109.59, setVolume: { kg: 70,    reps: 14 }, sessionVolume: 3655 },
  'Hack Squat':                          { weight: 60,    e1rm: 77.46,  setVolume: { kg: 55,    reps: 12 }, sessionVolume: 1320 },
  'Leg Extension':                       { weight: 42.5,  e1rm: 59.86,  setVolume: { kg: 37.5,  reps: 16 }, sessionVolume: 1800 },
  'Seated Leg Curl':                     { weight: 50,    e1rm: 73.53,  setVolume: { kg: 47.5,  reps: 15 }, sessionVolume: 2137.5 },
  'Romanian Deadlift (DB)':              { weight: 40,    e1rm: 53.33,  setVolume: { kg: 35,    reps: 12 }, sessionVolume: 1260 },
  'Hip Thrust (Machine)':                { weight: 27.5,  e1rm: 40.44,  setVolume: { kg: 27.5,  reps: 14 }, sessionVolume: 1117.5 },
  'Calf Press':                          { weight: 72.5,  e1rm: 100.75, setVolume: { kg: 67.5,  reps: 15 }, sessionVolume: 3240 },

  // ── Core ──────────────────────────────────────────────────────────────────
  'Crunch Machine':                      { weight: 57.5,  e1rm: 80.99,  setVolume: { kg: 57.5,  reps: 12 }, sessionVolume: 2070 },
  // Unloaded: reps ARE the record, and no loaded axis can ever fire at 0 kg.
  'Reverse Crunch':                      { reps: 18, sessionReps: 51 },
  'Hanging Knee Raise':                  { reps: 16, sessionReps: 45 },
  // Timed: the hold's duration rides in `reps`. "1 min" as logged.
  'Side Plank':                          { seconds: 60 },
}

/** Asserted floor for one exercise, or undefined if it is not in the book. */
export function truthFloor(name: string | null | undefined): TruthRecord | undefined {
  if (!name) return undefined
  return PR_TRUTH[name]
}

/**
 * The asserted value on one axis, or undefined where the book says nothing.
 *
 * `volume` resolves the stored set to its product; `reps` covers both the
 * unloaded rep record and a timed hold's duration, which share the axis.
 * `sessionVolume` is 0 for unloaded work by definition and is skipped there.
 */
export function truthAxisValue(rec: TruthRecord | undefined, axis: PrAxis): number | undefined {
  if (!rec) return undefined
  switch (axis) {
    case 'weight':        return rec.weight
    case 'e1rm':          return rec.e1rm
    case 'volume':        return rec.setVolume ? rec.setVolume.kg * rec.setVolume.reps : undefined
    case 'sessionVolume': return rec.sessionVolume
    case 'reps':          return rec.seconds ?? rec.reps
  }
}
