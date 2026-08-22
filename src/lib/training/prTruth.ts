import { epley1RM } from '@/lib/utils/epley'
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
 * ── THE HOLE IS MOSTLY CLOSED NOW (2026-08-22) ───────────────────────────────
 * The table above described the database as it stood when this file was written.
 * It no longer holds: `scripts/backfill-notion-sets.mjs` rebuilt 1,586 sets
 * across 65 of those 75 sessions by parsing the itemised `## Exercises` block
 * out of each session's own `report_md`, so volume, muscle tonnage and
 * progression trails now see history from 2026-03-10. Ten sessions could not be
 * reconciled against their stored `total_volume_kg` and remain set-less.
 *
 * ── AND THIS FILE STILL STANDS ───────────────────────────────────────────────
 * Nothing here was recalculated. PR history was deliberately left FROZEN: the
 * backfill sets no `is_pr` flag and never touches `personal_records`, because
 * re-deriving records over four months of newly arrived history would rewrite
 * the asserted book rather than confirm it.
 *
 * `buildBaselines` takes `max(logged, asserted)`, so the arrival of real history
 * can only raise the logged side toward the assertion — never above it, and
 * never in a way that manufactures a record. Where the two now agree, the floor
 * is simply redundant; where they still differ, it is doing exactly the job it
 * was written for. Removing it would re-expose the ten missing sessions.
 *
 * ── THE BOOK IS NOT THE FLOOR — READ THIS BEFORE CHANGING ANYTHING ───────────
 * The book is dated 2026-08-10, so it ALREADY CONTAINS everything achieved in
 * the four weeks Helix can see. Using it directly as a baseline leaks future
 * knowledge into past detection, and the first dry run proved it: 13 flags were
 * withdrawn and only ONE was the Calf Press false positive. The other twelve
 * were real records erased by a bar that exists only because they happened —
 * Side Plank's 60 s, Hip Thrust 27.5 × 14, Reverse Crunch × 18, all suppressed
 * by an "all-time best" that those very sets had set.
 *
 * So only the EXCESS floors. `PR_LOGGED` records what Helix's own complete set
 * history produces, and `prFloorFor` asserts a value only where the book beats
 * it. Where the two agree, the record was set inside the window Helix watched
 * and the chronological replay will find it unaided.
 *
 * ── THE 1RM ESTIMATOR DIVERGES, AND IT MATTERS ───────────────────────────────
 * Hevy's 1RM is not Epley. The gap is small — Calf Press asserts 100.75 against
 * `epley1RM(67.5, 15)` = 101.3, Hip Thrust 40.44 against 40.3 — but an e1RM
 * record advances in increments that small too, so a naive floor suppressed six
 * genuine ones on noise alone. `prFloorFor` therefore builds the e1RM floor two
 * ways and takes the larger:
 *
 *   (a) `epley1RM` on the asserted best SET, using Helix's own arithmetic, so
 *       the number is directly comparable to the ones detection produces; and
 *   (b) Hevy's figure, but ONLY where the asserted max weight also floors —
 *       i.e. where the set behind it is one Helix demonstrably never saw.
 *
 * (a) alone under-floors Leg Press (its 109.59 came from an 80 kg set, not the
 * 70 × 14 volume best). (b) alone is where all the noise came from. Together
 * they floor every real pre-July record and suppress nothing that happened here.
 *
 * ── UNILATERAL WORK AGREES, ONCE YOU COLLAPSE THE PAIRS ──────────────────────
 * Hevy counts one side of a unilateral exercise, and a naive `sum(weight × reps)`
 * over Helix's rows counts both — which reads as a 301.25 vs 272.5 disagreement
 * on Single Arm Lateral Raise. It is not one. `volumeCredits` collapses an L/R
 * pair to the single physical set it is, and under that rule Helix's own history
 * gives 272.5 and 175 — exactly what the book asserts. The two agree; only the
 * naive sum disagreed with both.
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
  /**
   * Best tonnage across one session for this exercise, AS HEVY COUNTS IT —
   * warm-ups INCLUDED. REFERENCE ONLY; it must never floor the `sessionVolume`
   * axis, which is working-sets-only.
   *
   * Proven on Leg Press, the one exercise with warm-up rows logged: the
   * asserted 3,655 is exactly 2026-08-03's `900 (warm-up) + 942.5 + 870 + 942.5`.
   * The working total that day was 2,755. Flooring the axis at 3,655 would put
   * it 33% out of reach — and 2026-08-03 is a session Helix holds complete sets
   * for, so the figure is not pre-July history at all, just a different unit.
   * The same convention applies to all 27 figures; Leg Press is only where it
   * is provable.
   */
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

/** The best `buildBaselines` produces from Helix's own sets, per axis. */
export interface LoggedBest {
  weight?: number
  e1rm?: number
  /** Per-set tonnage, under the `volumeCredits` unilateral collapse. */
  volume?: number
  sessionVolume?: number
  /** Best reps at zero load. */
  reps?: number
  /** Best hold in seconds. */
  seconds?: number
}

/**
 * What Helix's OWN complete set history produces — every axis, run through the
 * real `buildBaselines` over all 361 logged sets, not approximated in SQL.
 *
 * This is the subtrahend. An asserted record that merely equals its entry was
 * set inside the window Helix can see, so flooring it would erase the session
 * that set it (see the header). Only the excess is a pre-July record.
 *
 * It does not go stale in a harmful direction. As new sessions land the real
 * logged bests rise past this snapshot, but a floor can only ever suppress a
 * candidate BELOW the asserted all-time best — which is, by definition, not an
 * all-time record. The snapshot's whole job is to resolve the one-time overlap
 * between the book's date and Helix's window.
 *
 * To refresh: run `buildBaselines` over every row of `workout_sets` with no
 * floor, keyed by `exercises.name`, and print each map.
 */
export const PR_LOGGED: Readonly<Record<string, LoggedBest>> = {
  'Cable Overhead Extension':            { weight: 11.25, e1rm: 16.9,  volume: 168.75, sessionVolume: 446.25 },
  'Calf Press':                          { weight: 70,    e1rm: 101.3, volume: 1012.5, sessionVolume: 3037.5 },
  'Chest Press (Machine)':               { weight: 40,    e1rm: 53.3,  volume: 450,    sessionVolume: 1350 },
  'Crunch Machine':                      { weight: 57.5,  e1rm: 80.5,  volume: 690,    sessionVolume: 2040 },
  'DB Hammer Curl':                      { weight: 20,    e1rm: 28,    volume: 240,    sessionVolume: 658 },
  'DB Shoulder Press':                   { weight: 30,    e1rm: 42,    volume: 360,    sessionVolume: 990 },
  'Face Pull':                           { weight: 16.25, e1rm: 24.4,  volume: 243.75, sessionVolume: 708.75 },
  'Hack Squat':                          { weight: 60,    e1rm: 77,    volume: 660,    sessionVolume: 1320 },
  'Hanging Knee Raise':                  { weight: 0, volume: 0, sessionVolume: 0, reps: 16 },
  'Hip Thrust (Machine)':                { weight: 27.5,  e1rm: 40.3,  volume: 385,    sessionVolume: 1117.5 },
  'Incline DB Press':                    { weight: 40,    e1rm: 53.3,  volume: 420,    sessionVolume: 1260 },
  'Lat Pulldown':                        { weight: 47,    e1rm: 65.8,  volume: 564,    sessionVolume: 1598 },
  'Leg Extension':                       { weight: 37.5,  e1rm: 53.8,  volume: 525,    sessionVolume: 1462.5 },
  'Leg Press':                           { weight: 72.5,  e1rm: 103.9, volume: 942.5,  sessionVolume: 2755 },
  'Neutral-Grip Lat Pulldown':           { weight: 47,    e1rm: 64.2,  volume: 540,    sessionVolume: 1080 },
  'Pec Deck':                            { weight: 52.5,  e1rm: 75,    volume: 750,    sessionVolume: 1300 },
  'Preacher Curl (Machine)':             { weight: 17.5,  e1rm: 24.5,  volume: 210,    sessionVolume: 600 },
  'Reverse Crunch':                      { weight: 0, volume: 0, sessionVolume: 0, reps: 18 },
  'Reverse EZ-Bar Curl':                 { weight: 15,    e1rm: 21.5,  volume: 195,    sessionVolume: 390 },
  'Romanian Deadlift (DB)':              { weight: 40,    e1rm: 53.3,  volume: 420,    sessionVolume: 1260 },
  'Rope Triceps Pushdown':               { weight: 15,    e1rm: 19.3,  volume: 165,    sessionVolume: 330 },
  'Seated Cable Row (V-Grip)':           { weight: 50,    e1rm: 60.9,  volume: 552.5,  sessionVolume: 1062.5 },
  'Seated Cable Row (Wide Grip)':        { weight: 42.5,  e1rm: 58.1,  volume: 467.5,  sessionVolume: 887.5 },
  'Seated Incline DB Curl':              { weight: 16,    e1rm: 22.4,  volume: 192,    sessionVolume: 512 },
  'Seated Leg Curl':                     { weight: 45,    e1rm: 67.5,  volume: 675,    sessionVolume: 1935 },
  'Side Plank':                          { seconds: 60 },
  'Single Arm Cable Crossover':          { weight: 8.75,  e1rm: 12.3,  volume: 112.5,  sessionVolume: 217.5 },
  'Single Arm Lateral Raise (Cable)':    { weight: 5,     e1rm: 7.8,   volume: 85,     sessionVolume: 272.5 },
  'Single Arm Triceps Pushdown (Cable)': { weight: 6.25,  e1rm: 9.4,   volume: 93.75,  sessionVolume: 175 },
  'Straight-Arm Pulldown':               { weight: 16.25, e1rm: 24.4,  volume: 243.75, sessionVolume: 618.75 },
}

/**
 * A bar to raise on one axis. Only axes the logged history cannot already reach
 * appear; everything else is left to detection, which will find it.
 */
export interface PrFloor {
  weight?: number
  e1rm?: number
  /** Per-set tonnage. */
  volume?: number
  sessionVolume?: number
  /** Reps at zero load. */
  reps?: number
  /** Hold duration in seconds. */
  seconds?: number
}

/** `asserted` only when it genuinely exceeds what Helix has already logged. */
const excess = (asserted: number | undefined, logged: number | undefined): number | undefined =>
  asserted != null && asserted > (logged ?? 0) ? asserted : undefined

/**
 * The effective floor for one exercise — the part of the asserted book that
 * Helix's own history cannot account for. `undefined` when there is nothing to
 * raise, which is the common case for exercises whose records were all set
 * after 2026-07-16.
 *
 * This is what `buildBaselines` consumes. `PR_TRUTH` itself must never be fed
 * to it directly; see the header for what happens when it is.
 */
export function prFloorFor(name: string | null | undefined): PrFloor | undefined {
  if (!name) return undefined
  const t = PR_TRUTH[name]
  if (!t) return undefined
  const logged = PR_LOGGED[name] ?? {}

  const weight = excess(t.weight, logged.weight)

  // Epley on the asserted best set, in Helix's own arithmetic — always safe to
  // compare against numbers detection produces. Plus Hevy's own figure, but
  // only where the max-weight set is one Helix never saw, since that is the set
  // the estimate came from and the only case where trusting it cannot misfire.
  const e1rmFromSet = t.setVolume ? epley1RM(t.setVolume.kg, t.setVolume.reps) : null
  const e1rmCandidate = Math.max(e1rmFromSet ?? 0, weight != null ? (t.e1rm ?? 0) : 0)

  const floor: PrFloor = {
    weight,
    e1rm: excess(e1rmCandidate || undefined, logged.e1rm),
    volume: excess(t.setVolume ? t.setVolume.kg * t.setVolume.reps : undefined, logged.volume),
    // NO sessionVolume floor. The book counts warm-ups into a session total and
    // the axis does not, so the two are different measurements of the same day
    // and `excess` between them is meaningless — see TruthRecord.sessionVolume.
    reps: excess(t.reps, logged.reps),
    seconds: excess(t.seconds, logged.seconds),
  }
  return Object.values(floor).some((v) => v != null) ? floor : undefined
}

/** Asserted record for one exercise, verbatim. For the ledger, NOT for baselines. */
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
    // `sessionVolume` is not a PrAxis — the axis was withdrawn (see prEngine).
    // The figure survives on TruthRecord as reference and has no ledger row.
    case 'reps':          return rec.seconds ?? rec.reps
  }
}
