/**
 * Training programs + eras.
 * The PPL era ends and the recomposition era begins 2026-07-19 (Sunday).
 * Active program: HELIX-5 (5-day: Sun/Mon/Tue/Thu/Fri · Wed/Sat = Zone-2 rest).
 * The Helix Cut 5.1 nutrition block (1935 kcal) opens 2026-07-15.
 * Sessions are classified purely by date via `eraForDate` (no DB column needed).
 */
import { getScheduleOverride, REST_OVERRIDE } from '@/lib/schedule/overrides'
import { getProgramLayout } from '@/lib/schedule/layoutStore'
import { effectiveWeekday, type DayLayout } from '@/lib/schedule/layout'
import { DAY_COLOR, DIM, PLATINUM } from '@/lib/theme/palette'

export type Era = 'ppl' | 'axis'
export const AXIS_ERA_START = '2026-07-19'

/** Helix Cut 5.1 nutrition block — the target activates on this date. The kcal
 *  figure itself lives in `user_goals.calorie_goal`; the constant that also
 *  hardcoded it here had no readers and was a second source of truth waiting
 *  to disagree with the first. */
export const HELIX_CUT_START = '2026-07-15'

/**
 * The era boundary is HELIX_CUT_START (2026-07-15): the Helix Cut block
 * opens there, absorbing the former Week-0 transition days (15–17 Jul) without
 * a special case. Training vs rest is still decided purely by the weekday
 * program (Wed = rest), so Jul 15 correctly reads as a rest day; the Week-1
 * schedule anchor (AXIS_ERA_START) is unchanged.
 */
export function eraForDate(dateISO: string): Era {
  return dateISO >= HELIX_CUT_START ? 'axis' : 'ppl'
}

/**
 * The two eras were #79808C and #8E9AAC — fifteen units apart on the same grey,
 * which is to say indistinguishable, which is to say the colour was carrying no
 * information. The past era now recedes and the current one reads as current.
 */
export const ERA_META: Record<Era, { label: string; short: string; color: string }> = {
  ppl:  { label: 'Push/Pull/Legs', short: 'PPL', color: DIM },
  axis: { label: 'HELIX Era',  short: 'HELIX-5', color: PLATINUM },
}

/** RE-ENTRY weeks (2026-07-19 + 07-26): ~90% loads, RPE cap 7–8 — excluded from
 *  PR flagging and regression alerts. */
export function isReentryWeek(dateISO: string): boolean {
  return dateISO >= '2026-07-19' && dateISO <= '2026-08-01'
}

/** v5.1 double-progression rules (shown in the logger). */
export const PROGRESSION_RULES = {
  windows: 'Compounds 8→12 · isolations 12→15 · lateral raises 12→20 · hip thrust + loaded core 8→15',
  rule: 'Increase load only when ALL work sets hit the ceiling at RPE ≤ 8.5 in two consecutive sessions — smallest increment, reps reset to floor.',
  cutAlert: 'On a cut, flag only a lift down >10% for 2 consecutive weeks (recovery flag).',
} as const

export interface ProgramExercise {
  name: string
  /** BULK (base) working-set count. */
  sets: number
  /** CUT working-set count. Absent → same as `sets`; `0` → dropped entirely on a
   *  cut (the old `bulkOnly`). May exceed `sets` when a lift is prioritised on a
   *  cut. `activeProgram(id,'cut')` resolves `sets` to this and drops the zeros. */
  cutSets?: number
  wk1Kg: number | null   // starting load (seeds progressive-overload memory); DB loads = TOTAL kg
  reps: string           // rep window (double progression) — also drives the overload ceiling
  /**
   * TARGET rest between working sets, in seconds. Helix 5.1's own numbers —
   * bigger compounds get more, isolation and core get less.
   *
   * ── PRESCRIBED, NOT MEASURED ────────────────────────────────────────────────
   * This is the FIRST rest figure the program has ever carried. Helix used to
   * answer "how long should I rest" by measuring the gap between two set ticks
   * and printing it, which is a different question with a different answer: a
   * stopwatch tells you what you did, and this tells you what the plan asks for.
   * The stopwatch is gone (see the tombstone in `ExerciseCard`), so the only
   * rest number on screen is now one the plan can be held to.
   *
   * Absent = the movement has no prescribed rest (free choices, legacy PPL).
   * The user's own edits live in `training/restTargets.ts` and outrank this.
   */
  restSec?: number
  muscles: string[]
  compound?: boolean
  note?: string
}
export interface ProgramDay {
  key: string
  label: string
  sub?: string           // split sub-type shown under the name (e.g. "Quad Focus")
  color: string
  weekday: number        // 0=Sun … 6=Sat
  exercises: ProgramExercise[]
}
/**
 * A phase is a variation INSIDE a plan. Its nutrition/target numbers live in
 * NUTRITION_PRESETS + PLAN_PHASES (types/workout); a plan bends its TRAINING per
 * phase via each exercise's `sets` (bulk) vs `cutSets` (cut).
 *
 * ── TWO VALUES, AND `maintenance` WAS NEVER A THIRD ──────────────────────────
 * It resolved to the bulk deck: `forPhase` returns the program untouched for
 * anything that is not a cut, so selecting it changed no exercise, no set count
 * and no rep window. The only thing it moved was the calorie target — which is
 * the LEVER's axis (`LEVERS['maintenance-week']`), applied on top of whichever
 * direction the block is running. Deleted here so the picker cannot offer a
 * training decision that does not train anything.
 */
export type ProgramPhase = 'cut' | 'bulk'

export interface Program {
  id: string
  label: string
  era: Era
  active?: boolean
  drawer?: boolean
  /** One-line description shown in the Settings plan preview. */
  blurb?: string
  /** Historical plan (e.g. PPL) — still selectable, shown apart from live plans. */
  legacy?: boolean
  days: ProgramDay[]
}

/** The working-set count for a phase (cut uses `cutSets`, else `sets`). A lift
 *  with `cutSets: 0` is dropped entirely on a cut (the old `bulkOnly`). */
export const setsForPhase = (e: ProgramExercise, phase: ProgramPhase): number =>
  phase === 'cut' ? (e.cutSets ?? e.sets) : e.sets

// Day colours live in the palette (DAY_COLOR) so the session report, the
// dashboard and the plan template can never disagree about what "Upper B" looks
// like. This alias just keeps the day definitions below readable.
const C = DAY_COLOR

// ── HELIX-5 (ACTIVE) — Sun/Mon/Tue/Thu/Fri ─────────────────────────────────
export const APEX51: Program = {
  id: 'apex51', label: 'Helix-5', era: 'axis', active: true,   // id kept for localStorage compat
  blurb: '5-day antagonist hybrid — Sun/Mon/Tue/Thu/Fri, Wed & Sat Zone-2 rest.',
  days: [
    { key: 'cb_a', label: 'Upper A', sub: 'Chest + Back', color: C.cb_a, weekday: 0, exercises: [
      { name: 'Incline DB Press', sets: 3, cutSets: 3, wk1Kg: 32, reps: '8–12', restSec: 120, muscles: ['chest', 'shoulders'], compound: true },
      { name: 'Lat Pulldown', sets: 3, cutSets: 3, wk1Kg: 45, reps: '8–12', restSec: 135, muscles: ['back'], compound: true },
      { name: 'Chest Press (Machine)', sets: 3, cutSets: 2, wk1Kg: 34, reps: '10–12', restSec: 135, muscles: ['chest', 'triceps'], compound: true },
      { name: 'Seated Cable Row (V-Grip)', sets: 3, cutSets: 2, wk1Kg: 38.5, reps: '10–12', restSec: 120, muscles: ['back'], compound: true, note: 'V-grip' },
      { name: 'Pec Deck', sets: 2, cutSets: 2, wk1Kg: 47.5, reps: '12–15', restSec: 120, muscles: ['chest'] },
      { name: 'Straight-Arm Pulldown', sets: 2, cutSets: 2, wk1Kg: 15, reps: '12–15', restSec: 105, muscles: ['back'] },
      { name: 'Face Pull', sets: 3, cutSets: 2, wk1Kg: 13.75, reps: '12–15', restSec: 105, muscles: ['shoulders', 'back'] },
    ] },
    { key: 'legs_a', label: 'Legs & Core A', sub: 'Quad Focus', color: C.legs_a, weekday: 1, exercises: [
      { name: 'Leg Press', sets: 4, cutSets: 3, wk1Kg: 70, reps: '8–12', restSec: 135, muscles: ['quads', 'glutes'], compound: true, note: '1 warm-up @40kg' },
      { name: 'Hack Squat', sets: 3, cutSets: 2, wk1Kg: null, reps: '10–12', restSec: 135, muscles: ['quads', 'glutes'], compound: true },
      { name: 'Leg Extension', sets: 3, cutSets: 3, wk1Kg: 37.5, reps: '12–15', restSec: 120, muscles: ['quads'] },
      { name: 'Seated Leg Curl', sets: 3, cutSets: 3, wk1Kg: 40, reps: '10–15', restSec: 105, muscles: ['hamstrings'] },
      { name: 'Calf Press', sets: 4, cutSets: 3, wk1Kg: 65, reps: '10–15', restSec: 90, muscles: ['calves'] },
      { name: 'Crunch Machine', sets: 3, cutSets: 3, wk1Kg: 52.5, reps: '10–12', restSec: 90, muscles: ['core'] },
      { name: 'Reverse Crunch', sets: 3, cutSets: 2, wk1Kg: null, reps: '12–15', restSec: 75, muscles: ['core'] },
    ] },
    { key: 'arms', label: 'Delts & Arms', color: C.arms, weekday: 2, exercises: [
      { name: 'DB Shoulder Press', sets: 3, cutSets: 3, wk1Kg: 28, reps: '8–10', restSec: 105, muscles: ['shoulders', 'triceps'], compound: true },
      { name: 'Single Arm Lateral Raise (Cable)', sets: 5, cutSets: 4, wk1Kg: 5, reps: '12–20', restSec: 105, muscles: ['shoulders'], note: 'per side' },
      { name: 'Seated Incline DB Curl', sets: 3, cutSets: 3, wk1Kg: 14, reps: '8–12', restSec: 105, muscles: ['biceps'] },
      { name: 'Cable Overhead Extension', sets: 3, cutSets: 2, wk1Kg: 9, reps: '10–15', restSec: 90, muscles: ['triceps'] },
      { name: 'DB Hammer Curl', sets: 3, cutSets: 2, wk1Kg: 16, reps: '10–12', restSec: 105, muscles: ['biceps', 'forearms'] },
      { name: 'Rope Triceps Pushdown', sets: 2, cutSets: 2, wk1Kg: 13.5, reps: '12–15', restSec: 90, muscles: ['triceps'] },
      { name: 'Reverse EZ-Bar Curl', sets: 2, cutSets: 2, wk1Kg: 15, reps: '12–15', restSec: 90, muscles: ['forearms', 'biceps'] },
      { name: 'Seated DB Wrist Curl', sets: 2, cutSets: 0, wk1Kg: 16, reps: '15–20', restSec: 90, muscles: ['forearms'] },
    ] },
    // Names match the canonical (alias-resolved) catalog rows the sessions commit
    // under, so useExerciseMemory pre-loads the last logged numbers per exercise.
    { key: 'cb_b', label: 'Upper B', sub: 'Chest + Back', color: C.cb_b, weekday: 4, exercises: [
      { name: 'Chest Press (Machine)', sets: 3, cutSets: 3, wk1Kg: 35, reps: '10–12', restSec: 120, muscles: ['chest', 'triceps'], compound: true },
      { name: 'Neutral-Grip Lat Pulldown', sets: 3, cutSets: 2, wk1Kg: 45, reps: '10–12', restSec: 120, muscles: ['back'], compound: true },
      { name: 'Single Arm Cable Crossover', sets: 2, cutSets: 2, wk1Kg: 7.5, reps: '12–15', restSec: 105, muscles: ['chest'], note: 'per arm' },
      { name: 'Seated Cable Row (Wide Grip)', sets: 3, cutSets: 2, wk1Kg: 35, reps: '10–12', restSec: 120, muscles: ['back'], compound: true, note: 'wide bar' },
      { name: 'Single Arm Lateral Raise (Cable)', sets: 4, cutSets: 3, wk1Kg: 3.75, reps: '15–20', restSec: 90, muscles: ['shoulders'], note: 'per side' },
      { name: 'Preacher Curl (Machine)', sets: 3, cutSets: 3, wk1Kg: 15, reps: '8–12', restSec: 105, muscles: ['biceps'] },
      { name: 'Single Arm Triceps Pushdown (Cable)', sets: 2, cutSets: 2, wk1Kg: 5, reps: '12–15', restSec: 90, muscles: ['triceps'], note: 'per arm' },
    ] },
    // Cold-start loads/reps mirror the user's real Legs B (memory overrides once
    // logged under these canonical names); bodyweight moves seed at 0 kg.
    { key: 'legs_b', label: 'Legs & Core B', sub: 'Posterior Focus', color: C.legs_b, weekday: 5, exercises: [
      { name: 'Romanian Deadlift (Dumbbell)', sets: 4, cutSets: 3, wk1Kg: 30, reps: '8–12', restSec: 120, muscles: ['hamstrings', 'glutes', 'back'], compound: true },
      { name: 'Hip Thrust (Machine)', sets: 3, cutSets: 3, wk1Kg: 25, reps: '8–15', restSec: 135, muscles: ['glutes'], compound: true },
      { name: 'Leg Press', sets: 2, cutSets: 2, wk1Kg: 70, reps: '12–15', restSec: 135, muscles: ['quads', 'glutes'], compound: true, note: 'horizontal sled' },
      { name: 'Hip Adduction', sets: 2, cutSets: 0, wk1Kg: 50, reps: '12–15', restSec: 90, muscles: ['glutes'] },
      { name: 'Seated Leg Curl', sets: 2, cutSets: 2, wk1Kg: 45, reps: '10–15', restSec: 105, muscles: ['hamstrings'] },
      { name: 'Calf Press', sets: 4, cutSets: 3, wk1Kg: 67.5, reps: '10–15', restSec: 105, muscles: ['calves'] },
      { name: 'Hanging Knee Raise', sets: 3, cutSets: 3, wk1Kg: null, reps: '10–15', restSec: 90, muscles: ['core'] },
      { name: 'Side Plank', sets: 2, cutSets: 2, wk1Kg: null, reps: '55s', restSec: 90, muscles: ['core'], note: 'per side' },
    ] },
  ],
}

// ── Helix-4 (drawer) — ONE 4-day plan. The former "Bulk"/"Cut" split is now a
// PHASE: same movements, per-exercise (bulk/cut) set counts. `sets` = bulk;
// `cutSets` = cut (0 = a bulk-only lift dropped while cutting).
export const HELIX4: Program = {
  id: 'axis4', label: 'Helix-4', era: 'axis', drawer: true,
  blurb: '4-day upper/lower backup — Mon/Tue/Thu/Fri. Bulk adds volume; cut trims it.',
  days: [
    { key: 'upper_a', label: 'Upper A', color: C.cb_a, weekday: 1, exercises: [
      { name: 'Incline DB Press', sets: 3, cutSets: 3, wk1Kg: 32, reps: '8–12', restSec: 120, muscles: ['chest', 'shoulders'], compound: true },
      { name: 'Lat Pulldown', sets: 3, cutSets: 3, wk1Kg: 45, reps: '8–12', restSec: 135, muscles: ['back'], compound: true },
      { name: 'Chest Press (Machine)', sets: 2, cutSets: 0, wk1Kg: 34, reps: '10–12', restSec: 120, muscles: ['chest', 'triceps'], compound: true },
      { name: 'Seated Cable Row (V-Grip)', sets: 3, cutSets: 2, wk1Kg: 38.5, reps: '10–12', restSec: 120, muscles: ['back'], compound: true, note: 'V-grip' },
      { name: 'Seated Incline DB Curl', sets: 3, cutSets: 3, wk1Kg: 14, reps: '8–12', restSec: 105, muscles: ['biceps'] },
      { name: 'Rope Triceps Pushdown', sets: 3, cutSets: 2, wk1Kg: 13.5, reps: '12–15', restSec: 90, muscles: ['triceps'] },
      { name: 'Face Pull', sets: 2, cutSets: 2, wk1Kg: 13.75, reps: '12–15', restSec: 105, muscles: ['shoulders', 'back'] },
    ] },
    { key: 'lower_a', label: 'Lower A', color: C.legs_a, weekday: 2, exercises: [
      { name: 'Leg Press', sets: 3, cutSets: 3, wk1Kg: 70, reps: '8–12', restSec: 135, muscles: ['quads', 'glutes'], compound: true },
      { name: 'Hack Squat', sets: 2, cutSets: 0, wk1Kg: null, reps: '10–12', restSec: 135, muscles: ['quads', 'glutes'], compound: true },
      { name: 'Leg Extension', sets: 2, cutSets: 3, wk1Kg: 37.5, reps: '12–15', restSec: 120, muscles: ['quads'] },
      { name: 'Seated Leg Curl', sets: 3, cutSets: 3, wk1Kg: 40, reps: '10–15', restSec: 105, muscles: ['hamstrings'] },
      { name: 'Calf Press', sets: 4, cutSets: 3, wk1Kg: 65, reps: '10–15', restSec: 90, muscles: ['calves'] },
      { name: 'Crunch Machine', sets: 3, cutSets: 3, wk1Kg: 52.5, reps: '10–12', restSec: 90, muscles: ['core'] },
      { name: 'Reverse Crunch', sets: 2, cutSets: 2, wk1Kg: null, reps: '12–15', restSec: 75, muscles: ['core'] },
    ] },
    { key: 'upper_b', label: 'Upper B', color: C.cb_b, weekday: 4, exercises: [
      { name: 'DB Shoulder Press', sets: 3, cutSets: 3, wk1Kg: 28, reps: '8–10', restSec: 105, muscles: ['shoulders', 'triceps'], compound: true },
      { name: 'Single Arm Lateral Raise (Cable)', sets: 4, cutSets: 4, wk1Kg: 5, reps: '12–20', restSec: 105, muscles: ['shoulders'], note: 'per side' },
      { name: 'Pec Deck', sets: 2, cutSets: 1, wk1Kg: 47.5, reps: '12–15', restSec: 120, muscles: ['chest'], note: 'cut: rotates with Chest Press (Machine)' },
      { name: 'Seated Cable Row (Wide Grip)', sets: 3, cutSets: 2, wk1Kg: 35, reps: '10–12', restSec: 120, muscles: ['back'], compound: true, note: 'wide bar' },
      { name: 'DB Hammer Curl', sets: 3, cutSets: 2, wk1Kg: 16, reps: '10–12', restSec: 105, muscles: ['biceps', 'forearms'] },
      { name: 'Single Arm Triceps Pushdown (Cable)', sets: 2, cutSets: 2, wk1Kg: 5, reps: '12–15', restSec: 90, muscles: ['triceps'], note: 'per arm' },
      { name: 'Reverse EZ-Bar Curl', sets: 2, cutSets: 2, wk1Kg: 15, reps: '12–15', restSec: 90, muscles: ['forearms', 'biceps'] },
      { name: 'Seated DB Wrist Curl', sets: 2, cutSets: 0, wk1Kg: 16, reps: '15–20', restSec: 90, muscles: ['forearms'] },
    ] },
    { key: 'lower_b', label: 'Lower B', color: C.legs_b, weekday: 5, exercises: [
      { name: 'DB RDL', sets: 3, cutSets: 3, wk1Kg: 26, reps: '8–12', restSec: 120, muscles: ['hamstrings', 'glutes', 'back'], compound: true },
      { name: 'Machine Hip Thrust', sets: 3, cutSets: 3, wk1Kg: 23.5, reps: '8–15', restSec: 135, muscles: ['glutes'], compound: true },
      { name: 'Leg Press', sets: 2, cutSets: 2, wk1Kg: 70, reps: '12–15', restSec: 135, muscles: ['quads', 'glutes'], compound: true, note: 'horizontal sled' },
      { name: 'Hip Adduction', sets: 2, cutSets: 0, wk1Kg: 50, reps: '12–15', restSec: 90, muscles: ['glutes'] },
      { name: 'Calf Press', sets: 3, cutSets: 3, wk1Kg: 65, reps: '10–15', restSec: 105, muscles: ['calves'] },
      { name: 'Hanging Knee Raise', sets: 3, cutSets: 3, wk1Kg: null, reps: '10–15', restSec: 90, muscles: ['core'] },
      { name: 'Side Plank', sets: 2, cutSets: 2, wk1Kg: null, reps: '55s', restSec: 90, muscles: ['core'], note: 'per side' },
    ] },
  ],
}

// ── PPL Legacy (historical) — the pre-Helix Push/Pull/Legs block. Selectable so
// its era + numbers can be reviewed; seeded from the last logged weights/sets.
// Schedule: Sun Push · Mon Pull · Tue Legs · Wed Rest · Thu Push · Fri Pull · Sat Rest.
const PPL_PUSH: ProgramExercise[] = [
  { name: 'Incline DB Press', sets: 2, wk1Kg: 35, reps: '10–12', muscles: ['chest', 'shoulders'], compound: true },
  { name: 'Chest Press Machine', sets: 2, wk1Kg: 37.5, reps: '10–12', muscles: ['chest', 'triceps'], compound: true },
  { name: 'Butterfly Pec Deck', sets: 2, wk1Kg: 52.5, reps: '10–12', muscles: ['chest'] },
  { name: 'DB Shoulder Press', sets: 3, wk1Kg: 30, reps: '8–12', muscles: ['shoulders', 'triceps'], compound: true, note: 'ramp: 25kg×12 → 30kg×9,8' },
  { name: 'Lateral Raise DB', sets: 4, wk1Kg: 10, reps: '12–20', muscles: ['shoulders'] },
  { name: 'Triceps Rope Pushdown', sets: 3, wk1Kg: 15, reps: '12–15', muscles: ['triceps'] },
  { name: 'Overhead Triceps Extension', sets: 3, wk1Kg: 10, reps: '10–15', muscles: ['triceps'] },
  { name: 'Side Plank', sets: 3, wk1Kg: null, reps: '55s', muscles: ['core'], note: 'per side' },
  { name: 'Russian Twist', sets: 3, wk1Kg: 10, reps: '15–20', muscles: ['core'] },
  { name: 'Lying Leg Raises', sets: 3, wk1Kg: null, reps: '12–15', muscles: ['core'] },
]
const PPL_PULL: ProgramExercise[] = [
  { name: 'Lat Pulldown', sets: 2, wk1Kg: 49.5, reps: '10–12', muscles: ['back'], compound: true },
  { name: 'Seated Cable Row', sets: 2, wk1Kg: 42.5, reps: '10–12', muscles: ['back'], compound: true },
  { name: 'Face Pull', sets: 4, wk1Kg: 16.25, reps: '12–15', muscles: ['shoulders', 'back'] },
  { name: 'Straight Arm Pulldown', sets: 3, wk1Kg: 17.5, reps: '10–15', muscles: ['back'] },
  { name: 'Bicep Curl DB', sets: 3, wk1Kg: 18, reps: '10–12', muscles: ['biceps'] },
  { name: 'Hammer Curl DB', sets: 3, wk1Kg: 18, reps: '10–12', muscles: ['biceps', 'forearms'] },
  { name: 'Preacher Curl', sets: 3, wk1Kg: 16.25, reps: '8–12', muscles: ['biceps'] },
  { name: 'Crunch Machine', sets: 3, wk1Kg: 57.5, reps: '12–15', muscles: ['core'] },
]
const PPL_LEGS: ProgramExercise[] = [
  { name: 'Leg Press', sets: 2, wk1Kg: 80, reps: '8–12', muscles: ['quads', 'glutes'], compound: true, note: '1 warm-up @72.5kg' },
  { name: 'RDL DB', sets: 3, wk1Kg: 30, reps: '10–15', muscles: ['hamstrings', 'glutes', 'back'], compound: true },
  { name: 'Hip Thrust', sets: 3, wk1Kg: 27.5, reps: '10–15', muscles: ['glutes'], compound: true },
  { name: 'Hip Adduction', sets: 3, wk1Kg: 55, reps: '12–15', muscles: ['glutes'] },
  { name: 'Leg Extension', sets: 3, wk1Kg: 42.5, reps: '10–15', muscles: ['quads'] },
  { name: 'Seated Leg Curl', sets: 2, wk1Kg: 45, reps: '10–15', muscles: ['hamstrings'] },
  { name: 'Calf Press', sets: 3, wk1Kg: 72.5, reps: '10–15', muscles: ['calves'] },
  { name: 'Reverse Crunch', sets: 3, wk1Kg: null, reps: '15–20', muscles: ['core'] },
  { name: 'Hollow Rock', sets: 3, wk1Kg: null, reps: '38s', muscles: ['core'], note: 'seconds' },
]
export const PPL_LEGACY: Program = {
  id: 'ppl', label: 'Push/Pull/Legs', era: 'ppl', drawer: true, legacy: true,
  blurb: 'Historical Push/Pull/Legs — Sun/Thu Push · Mon/Fri Pull · Tue Legs · Wed & Sat rest.',
  days: [
    { key: 'ppl_push_sun', label: 'Push', color: C.ppl_push_sun, weekday: 0, exercises: PPL_PUSH },
    { key: 'ppl_pull_mon', label: 'Pull', color: C.ppl_pull_mon, weekday: 1, exercises: PPL_PULL },
    { key: 'ppl_legs_tue', label: 'Legs', color: C.ppl_legs_tue, weekday: 2, exercises: PPL_LEGS },
    { key: 'ppl_push_thu', label: 'Push', color: C.ppl_push_thu, weekday: 4, exercises: PPL_PUSH },
    { key: 'ppl_pull_fri', label: 'Pull', color: C.ppl_pull_fri, weekday: 5, exercises: PPL_PULL },
  ],
}

export const PROGRAMS: Record<string, Program> = {
  [APEX51.id]: APEX51, [HELIX4.id]: HELIX4, [PPL_LEGACY.id]: PPL_LEGACY,
}
export const DEFAULT_PROGRAM_ID = APEX51.id

/**
 * Resolve a plan template to a specific PHASE: on a cut, each exercise's `sets`
 * becomes its `cutSets` and the cut-dropped lifts (`cutSets: 0`) fall out; a
 * bulk keeps the base `sets`. Pure — the rep windows are authored per exercise
 * and never rewritten. */
function forPhase(program: Program, phase: ProgramPhase): Program {
  if (phase !== 'cut') return program
  return {
    ...program,
    days: program.days.map((d) => ({
      ...d,
      exercises: d.exercises
        .map((e) => ({ ...e, sets: setsForPhase(e, 'cut') }))
        .filter((e) => e.sets > 0),
    })),
  }
}

/**
 * The runtime training program for the active PLAN + PHASE — the single source
 * every logger/analytics/coach path should read. It resolves the active plan and
 * the active phase's set counts (cut trims volume, drops bulk-only lifts).
 * Server-safe (falls back to the default plan + bulk phase when there's no
 * window / localStorage).
 */
export function activeProgram(programId: string = getActiveProgramId(), phase: ProgramPhase = activePhase()): Program {
  const p = PROGRAMS[programId] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  return forPhase(p, phase)
}

/**
 * The plan that was in force on a DATE, not the one selected today.
 *
 * The timeline shows years of history: labelling a June week with the plan
 * you're running in August rewrites what actually happened. Era is the boundary
 * that already exists for exactly this (eraForDate), so PPL-era dates resolve to
 * the legacy plan and Helix-era dates to the active one.
 */
export function programForDate(dateISO: string): Program {
  if (eraForDate(dateISO) === 'ppl') return PROGRAMS.ppl ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  return activeProgram()
}

/**
 * Weekday → day for a program (or 'rest').
 *
 * ── THE LAYOUT LAYER ─────────────────────────────────────────────────────────
 * `d.weekday` is the weekday the plan was AUTHORED with; `effectiveWeekday` is
 * where the user has since moved it (`program_day_layout`, a permanent remap).
 * Matching on the authored value would leave a moved day answering at BOTH
 * weekdays — its old slot and its new one — which is a duplicated session rather
 * than a moved one. So there is exactly one place the remap is applied, and this
 * is it: every caller (`scheduleDayFor`, `isTrainingDay`, the week scheduler)
 * inherits it without knowing it exists.
 *
 * The store is empty on the server and on a device that has never remapped
 * anything, in which case `effectiveWeekday` returns `d.weekday` and this is the
 * function it always was.
 */
export function programDayFor(programId: string, weekday: number): ProgramDay | 'rest' {
  const p = PROGRAMS[programId] ?? APEX51
  return programDayIn(p, getProgramLayout(p.id), weekday)
}

/** {@link programDayFor} with the layout supplied rather than read from a store. */
export function programDayIn(program: Program, layout: DayLayout, weekday: number): ProgramDay | 'rest' {
  return program.days.find((d) => effectiveWeekday(d, layout) === weekday) ?? 'rest'
}

/** Exact program day by its stored `day_key` (server-safe; searches all programs). */
export function programDayByKey(dayKey: string): ProgramDay | null {
  for (const p of Object.values(PROGRAMS)) {
    const d = p.days.find((x) => x.key === dayKey)
    if (d) return d
  }
  return null
}

/**
 * What the program actually PRESCRIBES for a day, per phase: cut uses each
 * exercise's `cutSets` (bulk-only lifts drop to 0 and fall out). The scorer
 * grades a session's coverage against this, so it has to reflect the plan the
 * athlete is really running, not the bulk template.
 *
 * MAINTENANCE takes the full prescription, exactly as bulk does — `setsForPhase`
 * has always read it that way and only the signature here said otherwise. That
 * is deliberate: a maintenance week does not rewrite the plan, it is a week you
 * choose to do less of it. What you skip is marked as a ghost, and the scorer
 * subtracts those from this figure — see `computeForDate`.
 */
export function prescribedFor(dayKey: string, phase: ProgramPhase): { exercises: number; sets: number } | null {
  const d = programDayByKey(dayKey)
  if (!d) return null
  const kept = d.exercises.filter((e) => setsForPhase(e, phase) > 0)
  const sets = kept.reduce((n, e) => n + setsForPhase(e, phase), 0)
  return { exercises: kept.length, sets: Math.max(1, sets) }
}

/**
 * Era-aware training-day check (server-safe, date-only). The single source of
 * truth for "is today a lifting day" — drives the Train strip, supplement
 * gating, and the coach. HELIX-5 trains Sun/Mon/Tue/Thu/Fri; Wed/Sat are Zone-2
 * rest (so Jul 15, a Wednesday, reads as rest).
 */
export function isTrainingDay(dateISO: string): boolean {
  // The ACTIVE plan, not the default one. This read `DEFAULT_PROGRAM_ID`, which
  // is a no-op while Helix-5 is active but would have answered against Helix-5's
  // week for a user running Helix-4 — and this function gates the supplement
  // cascade, so it would have added pre-workout stimulants to rest days and
  // stripped them from training days. `scheduleDayFor` next door already reads
  // the active plan; the two disagreeing was the latent half of the bug.
  return isTrainingDayIn(clientScheduleContext(), dateISO)
}

/** Inverse of {@link isTrainingDay} — Wed/Sat Zone-2 rest in HELIX-5, Fri/Sat in PPL. */
export function isRestDayFor(dateISO: string): boolean {
  return !isTrainingDay(dateISO)
}

/**
 * The plan that owns a date, era-aware.
 *
 * ── THE SECOND PPL TRUTH, AND WHY IT IS GONE ─────────────────────────────────
 * There used to be a `PPL_WEEKDAY` map here — `{0:'Upper', 1:'Legs', 2:'Push',
 * 3:'Pull', 4:'Legs', 5:null, 6:null}` — feeding `scheduleDayIn`, while
 * `PPL_LEGACY.days` in this same file said Sun Push · Mon Pull · Tue Legs ·
 * Thu Push · Fri Pull. Two answers to one question, and the app used whichever
 * one the caller happened to reach.
 *
 * The logged sessions settle it. Dominant `split_day` per weekday before
 * 2026-07-15: Sun push ×11 · Mon pull ×8 · Tue legs ×9 · Thu push ×10 ·
 * Fri pull ×9. `PPL_LEGACY.days` matches all five; `PPL_WEEKDAY` matched none,
 * used a label ("Upper") that is not a PPL split at all, and called Friday — 14
 * logged sessions, the second-busiest day of that block — a rest day.
 *
 * So the legacy era resolves through the same `programDayIn` rule as every other
 * era, against `PROGRAMS.ppl`. One code path, one answer, and PPL dates gain the
 * `dayKey` they never had — which is what lets `dayColor` tint them (the
 * `ppl_push_sun` … `ppl_pull_fri` keys already exist in `DAY_COLOR`).
 *
 * The layout is `{}` on purpose: `program_day_layout` records a remap of the
 * plan you are RUNNING. Applying it to a finished block would move history.
 */
function programForContext(ctx: ScheduleContext, dateISO: string): { program: Program; layout: DayLayout } {
  if (eraForDate(dateISO) === 'ppl') return { program: PROGRAMS.ppl ?? APEX51, layout: {} }
  return { program: PROGRAMS[ctx.programId] ?? APEX51, layout: ctx.layout }
}

export interface ScheduleDay { label: string; sub?: string; dayKey?: string }

/**
 * The ONE era-aware "what's today's training day" helper — used by the
 * dashboard Train strip, the quick-log default, and the Insight Coach so
 * the whole app agrees. PPL-legacy dates show the PPL day; HELIX-era dates
 * show the active program's day. 'rest' on scheduled rest days.
 */
export function scheduleDayFor(dateISO: string, programId = getActiveProgramId()): ScheduleDay | 'rest' {
  return scheduleDayIn(clientScheduleContext(programId), dateISO)
}

// ── The pure schedule core ───────────────────────────────────────────────────
//
// ── WHY A CONTEXT OBJECT AND NOT JUST MORE ARGUMENTS ─────────────────────────
// Everything above resolves four things — the plan, the phase, the per-date
// swaps and the permanent weekday layout — and every one of them lives behind
// `localStorage`. On a server all four silently answer with a default, so
// `/api/widget/snapshot` announced the wrong session for any non-default plan
// and ignored `schedule_overrides` entirely, and `/api/compute-score` graded
// rest days against a week the athlete was not training.
//
// The fix is to state the four inputs once, as a value. A browser fills it from
// the caches it already keeps; a route fills it from `user_goals`,
// `schedule_overrides` and `program_day_layout`. There is exactly one rule and
// both callers run it, which is the only arrangement in which they cannot drift.

/** Everything the schedule rule needs, with nothing read from a global. */
export interface ScheduleContext {
  programId: string
  phase: ProgramPhase
  /** `date → day_key | 'rest'` (`schedule_overrides`). */
  overrides: Readonly<Record<string, string>>
  /** `dayKey → weekday` for THIS plan (`program_day_layout`). */
  layout: DayLayout
}

/** The context the BROWSER is running — read from the synchronous caches. */
export function clientScheduleContext(programId: string = getActiveProgramId()): ScheduleContext {
  return {
    programId,
    phase: activePhase(),
    // `getScheduleOverride` is a single-key read over a private cache; there is
    // no bulk accessor and adding one would leak the cache's identity into
    // render (the reason it is a version-counter store at all). The rule only
    // ever asks about one date, so the context carries a one-entry view built
    // lazily by `overrideFor` below.
    overrides: CLIENT_OVERRIDES,
    layout: getProgramLayout(PROGRAMS[programId] ? programId : DEFAULT_PROGRAM_ID),
  }
}

/**
 * A live view onto the client override cache. `scheduleDayIn` only ever reads
 * one key, so a Proxy-free object with a getter trap is unnecessary: a plain
 * object whose lookups delegate is enough, and it keeps `ScheduleContext` a
 * boring record on the server side where it matters.
 */
const CLIENT_OVERRIDES: Readonly<Record<string, string>> = new Proxy({}, {
  get: (_t, key) => (typeof key === 'string' ? getScheduleOverride(key) : undefined),
  has: (_t, key) => typeof key === 'string' && getScheduleOverride(key) != null,
})

/** {@link scheduleDayFor}, as a pure function of an explicit context. */
export function scheduleDayIn(ctx: ScheduleContext, dateISO: string): ScheduleDay | 'rest' {
  const { program, layout } = programForContext(ctx, dateISO)
  // A per-date swap wins over the weekday default so the whole app cascades.
  const override = ctx.overrides[dateISO]
  if (override != null) {
    if (override === REST_OVERRIDE) return 'rest'
    const od = program.days.find((d) => d.key === override)
    // An override naming a day this plan does not have is a stale row from a
    // plan the user has left. Fall through to the weekday default rather than
    // invent a session out of a key nothing can resolve.
    if (od) return { label: od.label, sub: od.sub, dayKey: od.key }
  }
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay()
  const d = programDayIn(program, layout, weekday)
  return d === 'rest' ? 'rest' : { label: d.label, sub: d.sub, dayKey: d.key }
}

/** {@link isTrainingDay}, as a pure function of an explicit context. */
export function isTrainingDayIn(ctx: ScheduleContext, dateISO: string): boolean {
  const override = ctx.overrides[dateISO]
  if (override != null) return override !== REST_OVERRIDE
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay()
  // This read `weekday !== 5 && weekday !== 6` for the PPL era — "trained
  // Sun–Thu", the same claim `PPL_WEEKDAY` made and the logged sessions refute:
  // Friday carried 14 of them. It goes through the plan now, like every other
  // date. See `programForContext`.
  const { program, layout } = programForContext(ctx, dateISO)
  return programDayIn(program, layout, weekday) !== 'rest'
}

/**
 * How many sessions the plan schedules in a week — the denominator on "3/5".
 *
 * Counted off the UNTRIMMED plan on purpose. A cut drops bulk-only lifts and can
 * empty an exercise list, but it never deletes a training day; grading against
 * the trimmed count would shrink the target for the phase in which hitting it
 * matters most.
 */
export function sessionTargetIn(ctx: ScheduleContext): number {
  return (PROGRAMS[ctx.programId] ?? PROGRAMS[DEFAULT_PROGRAM_ID]).days.length
}

// Map a program-day key onto the existing split_day enum (for saving sessions).
const DAY_SPLIT: Record<string, string> = {
  cb_a: 'upper', legs_a: 'legs', arms: 'upper', cb_b: 'upper', legs_b: 'legs',
  upper_a: 'upper', lower_a: 'legs', upper_b: 'upper', lower_b: 'legs',
  ppl_push_sun: 'push', ppl_pull_mon: 'pull', ppl_legs_tue: 'legs', ppl_push_thu: 'push', ppl_pull_fri: 'pull',
}
export function daySplitEnum(dayKey: string): 'push' | 'pull' | 'legs' | 'upper' | 'lower' {
  return (DAY_SPLIT[dayKey] ?? 'upper') as 'push' | 'pull' | 'legs' | 'upper' | 'lower'
}

const ACTIVE_KEY = 'helix_active_plan'
const PHASE_KEY = 'helix_active_phase'
// Legacy plan ids → the consolidated plan (the two Helix-4 variants are one plan
// now; the old key names are migrated on read so a device never dead-ends).
const LEGACY_PLAN_ID: Record<string, string> = { axis4_builder: 'axis4', axis4_defender: 'axis4' }

// ── Plan/phase preference store ──────────────────────────────────────────────
// Same problem the schedule cache had: these are read SYNCHRONOUSLY during
// render out of localStorage, so a change arriving from the DB (another device)
// updated the value and re-rendered nothing. The version counter is what
// useScheduleVersion subscribes to — see src/lib/hooks/useScheduleVersion.ts.
let planVersion = 0
const planListeners = new Set<() => void>()

function bumpPlan(): void {
  planVersion += 1
  for (const l of planListeners) l()
}

export function subscribePlanPrefs(listener: () => void): () => void {
  planListeners.add(listener)
  return () => { planListeners.delete(listener) }
}

export function planPrefsVersion(): number {
  return planVersion
}

if (typeof window !== 'undefined') {
  // Another tab switched plan or phase.
  window.addEventListener('storage', (e) => {
    if (e.key === ACTIVE_KEY || e.key === PHASE_KEY) bumpPlan()
  })
  // hydratePrefsFromDb fires this after pulling the row (cross-DEVICE path).
  window.addEventListener('helix-plan-change', bumpPlan)
}

/** Valid, known plan id or null. Guards against a stale id from an old row. */
export function normalizePlanId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const id = LEGACY_PLAN_ID[raw] ?? raw
  return PROGRAMS[id] ? id : null
}

export function getActiveProgramId(): string {
  if (typeof window === 'undefined') return DEFAULT_PROGRAM_ID
  const raw =
    window.localStorage.getItem(ACTIVE_KEY) ??
    window.localStorage.getItem('helix_active_program') ??   // pre-consolidation key
    window.localStorage.getItem('apex_active_program')        // original key
  return normalizePlanId(raw) ?? DEFAULT_PROGRAM_ID
}
export function setActiveProgramId(id: string): void {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(ACTIVE_KEY) === id) return
  window.localStorage.setItem(ACTIVE_KEY, id)
  bumpPlan()
}

/** The active PHASE — mirrors user_goals.active_phase / goal_preset into
 *  localStorage so `activeProgram()` can read it synchronously. Defaults to cut. */
export function activePhase(): ProgramPhase {
  if (typeof window === 'undefined') return 'cut'
  const v = window.localStorage.getItem(PHASE_KEY)
  // A device that last synced before `maintenance` was deleted still has the
  // string in this key. It resolved to the bulk deck by accident of
  // `forPhase`; it resolves to the cut now, which is the block being run.
  return v === 'bulk' ? 'bulk' : 'cut'
}
export function setActivePhase(phase: ProgramPhase): void {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(PHASE_KEY) === phase) return
  window.localStorage.setItem(PHASE_KEY, phase)
  bumpPlan()
}

/**
 * Human label for a logged session. Prefers the program-day identity
 * (`day_key` → "Delts & Arms"), which is precise across swaps; falls back to the
 * capitalised split_day ("upper") only when no day_key was stored. This is why
 * a Tuesday arms day must NOT render as "Upper" — split_day is 'upper' but the
 * day_key is 'arms'.
 */
export function programDayLabel(dayKey: string | null | undefined, split: string): string {
  const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  const byKey = dayKey ? program.days.find((d) => d.key === dayKey)?.label : undefined
  return byKey ?? (split ? split[0].toUpperCase() + split.slice(1) : 'Session')
}
