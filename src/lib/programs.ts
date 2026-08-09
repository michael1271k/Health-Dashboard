/**
 * Training programs + eras.
 * The PPL era ends and the recomposition era begins 2026-07-19 (Sunday).
 * Active program: HELIX-5 (5-day: Sun/Mon/Tue/Thu/Fri · Wed/Sat = Zone-2 rest).
 * The Helix Cut 5.1 nutrition block (1935 kcal) opens 2026-07-15.
 * Sessions are classified purely by date via `eraForDate` (no DB column needed).
 */
import { getScheduleOverride, REST_OVERRIDE } from '@/lib/schedule/overrides'
import { DAY_COLOR, DIM, PLATINUM } from '@/lib/theme/palette'

export type Era = 'ppl' | 'axis'
export const AXIS_ERA_START = '2026-07-19'

/** Helix Cut 5.1 nutrition block — the 1955 kcal target activates on this date. */
export const HELIX_CUT_START = '2026-07-15'
export const HELIX_CUT_KCAL = 1955

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
/** A phase is a variation INSIDE a plan. Its nutrition/target numbers live in
 *  NUTRITION_PRESETS + PLAN_PHASES (types/workout); a plan bends its TRAINING per
 *  phase via each exercise's `sets` (bulk) vs `cutSets` (cut). */
export type ProgramPhase = 'cut' | 'maintenance' | 'bulk'

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
      { name: 'Incline DB Press', sets: 3, cutSets: 3, wk1Kg: 32, reps: '8–12', muscles: ['chest', 'shoulders'], compound: true },
      { name: 'Lat Pulldown', sets: 3, cutSets: 3, wk1Kg: 45, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'Chest Press (Machine)', sets: 3, cutSets: 2, wk1Kg: 34, reps: '10–12', muscles: ['chest', 'triceps'], compound: true },
      { name: 'Seated Cable Row (V-Grip)', sets: 3, cutSets: 2, wk1Kg: 38.5, reps: '10–12', muscles: ['back'], compound: true, note: 'V-grip' },
      { name: 'Pec Deck', sets: 2, cutSets: 2, wk1Kg: 47.5, reps: '12–15', muscles: ['chest'] },
      { name: 'Straight-Arm Pulldown', sets: 2, cutSets: 2, wk1Kg: 15, reps: '12–15', muscles: ['back'] },
      { name: 'Face Pull', sets: 3, cutSets: 2, wk1Kg: 13.75, reps: '12–15', muscles: ['shoulders', 'back'] },
    ] },
    { key: 'legs_a', label: 'Legs & Core A', sub: 'Quad Focus', color: C.legs_a, weekday: 1, exercises: [
      { name: 'Leg Press', sets: 4, cutSets: 3, wk1Kg: 70, reps: '8–12', muscles: ['quads', 'glutes'], compound: true, note: '1 warm-up @40kg' },
      { name: 'Hack Squat', sets: 3, cutSets: 2, wk1Kg: null, reps: '10–12', muscles: ['quads', 'glutes'], compound: true },
      { name: 'Leg Extension', sets: 3, cutSets: 3, wk1Kg: 37.5, reps: '12–15', muscles: ['quads'] },
      { name: 'Seated Leg Curl', sets: 3, cutSets: 3, wk1Kg: 40, reps: '10–15', muscles: ['hamstrings'] },
      { name: 'Calf Press', sets: 4, cutSets: 3, wk1Kg: 65, reps: '10–15', muscles: ['calves'] },
      { name: 'Crunch Machine', sets: 3, cutSets: 3, wk1Kg: 52.5, reps: '10–12', muscles: ['core'] },
      { name: 'Reverse Crunch', sets: 3, cutSets: 2, wk1Kg: null, reps: '12–15', muscles: ['core'] },
    ] },
    { key: 'arms', label: 'Delts & Arms', color: C.arms, weekday: 2, exercises: [
      { name: 'DB Shoulder Press', sets: 3, cutSets: 3, wk1Kg: 28, reps: '8–10', muscles: ['shoulders', 'triceps'], compound: true },
      { name: 'Single Arm Lateral Raise (Cable)', sets: 5, cutSets: 4, wk1Kg: 5, reps: '12–20', muscles: ['shoulders'], note: 'per side' },
      { name: 'Seated Incline DB Curl', sets: 3, cutSets: 3, wk1Kg: 14, reps: '8–12', muscles: ['biceps'] },
      { name: 'Cable Overhead Extension', sets: 3, cutSets: 2, wk1Kg: 9, reps: '10–15', muscles: ['triceps'] },
      { name: 'DB Hammer Curl', sets: 3, cutSets: 2, wk1Kg: 16, reps: '10–12', muscles: ['biceps', 'forearms'] },
      { name: 'Rope Triceps Pushdown', sets: 2, cutSets: 2, wk1Kg: 13.5, reps: '12–15', muscles: ['triceps'] },
      { name: 'Reverse EZ-Bar Curl', sets: 2, cutSets: 2, wk1Kg: 15, reps: '12–15', muscles: ['forearms', 'biceps'] },
      { name: 'Seated DB Wrist Curl', sets: 2, cutSets: 0, wk1Kg: 16, reps: '15–20', muscles: ['forearms'] },
    ] },
    // Names match the canonical (alias-resolved) catalog rows the sessions commit
    // under, so useExerciseMemory pre-loads the last logged numbers per exercise.
    { key: 'cb_b', label: 'Upper B', sub: 'Chest + Back', color: C.cb_b, weekday: 4, exercises: [
      { name: 'Chest Press (Machine)', sets: 3, cutSets: 3, wk1Kg: 35, reps: '10–12', muscles: ['chest', 'triceps'], compound: true },
      { name: 'Neutral-Grip Lat Pulldown', sets: 3, cutSets: 2, wk1Kg: 45, reps: '10–12', muscles: ['back'], compound: true },
      { name: 'Single Arm Cable Crossover', sets: 2, cutSets: 2, wk1Kg: 7.5, reps: '12–15', muscles: ['chest'], note: 'per arm' },
      { name: 'Seated Cable Row (Wide Grip)', sets: 3, cutSets: 2, wk1Kg: 35, reps: '10–12', muscles: ['back'], compound: true, note: 'wide bar' },
      { name: 'Single Arm Lateral Raise (Cable)', sets: 4, cutSets: 3, wk1Kg: 3.75, reps: '15–20', muscles: ['shoulders'], note: 'per side' },
      { name: 'Preacher Curl (Machine)', sets: 3, cutSets: 3, wk1Kg: 15, reps: '8–12', muscles: ['biceps'] },
      { name: 'Single Arm Triceps Pushdown (Cable)', sets: 2, cutSets: 2, wk1Kg: 5, reps: '12–15', muscles: ['triceps'], note: 'per arm' },
    ] },
    // Cold-start loads/reps mirror the user's real Legs B (memory overrides once
    // logged under these canonical names); bodyweight moves seed at 0 kg.
    { key: 'legs_b', label: 'Legs & Core B', sub: 'Posterior Focus', color: C.legs_b, weekday: 5, exercises: [
      { name: 'Romanian Deadlift (Dumbbell)', sets: 4, cutSets: 3, wk1Kg: 30, reps: '8–12', muscles: ['hamstrings', 'glutes', 'back'], compound: true },
      { name: 'Hip Thrust (Machine)', sets: 3, cutSets: 3, wk1Kg: 25, reps: '8–15', muscles: ['glutes'], compound: true },
      { name: 'Leg Press', sets: 2, cutSets: 2, wk1Kg: 70, reps: '12–15', muscles: ['quads', 'glutes'], compound: true, note: 'horizontal sled' },
      { name: 'Hip Adduction', sets: 2, cutSets: 0, wk1Kg: 50, reps: '12–15', muscles: ['glutes'] },
      { name: 'Seated Leg Curl', sets: 2, cutSets: 2, wk1Kg: 45, reps: '10–15', muscles: ['hamstrings'] },
      { name: 'Calf Press', sets: 4, cutSets: 3, wk1Kg: 67.5, reps: '10–15', muscles: ['calves'] },
      { name: 'Hanging Knee Raise', sets: 3, cutSets: 3, wk1Kg: null, reps: '10–15', muscles: ['core'] },
      { name: 'Side Plank', sets: 2, cutSets: 2, wk1Kg: null, reps: '55s', muscles: ['core'], note: 'per side' },
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
      { name: 'Incline DB Press', sets: 3, cutSets: 3, wk1Kg: 32, reps: '8–12', muscles: ['chest', 'shoulders'], compound: true },
      { name: 'Lat Pulldown', sets: 3, cutSets: 3, wk1Kg: 45, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'Chest Press (Machine)', sets: 2, cutSets: 0, wk1Kg: 34, reps: '10–12', muscles: ['chest', 'triceps'], compound: true },
      { name: 'Seated Cable Row (V-Grip)', sets: 3, cutSets: 2, wk1Kg: 38.5, reps: '10–12', muscles: ['back'], compound: true, note: 'V-grip' },
      { name: 'Seated Incline DB Curl', sets: 3, cutSets: 3, wk1Kg: 14, reps: '8–12', muscles: ['biceps'] },
      { name: 'Rope Triceps Pushdown', sets: 3, cutSets: 2, wk1Kg: 13.5, reps: '12–15', muscles: ['triceps'] },
      { name: 'Face Pull', sets: 2, cutSets: 2, wk1Kg: 13.75, reps: '12–15', muscles: ['shoulders', 'back'] },
    ] },
    { key: 'lower_a', label: 'Lower A', color: C.legs_a, weekday: 2, exercises: [
      { name: 'Leg Press', sets: 3, cutSets: 3, wk1Kg: 70, reps: '8–12', muscles: ['quads', 'glutes'], compound: true },
      { name: 'Hack Squat', sets: 2, cutSets: 0, wk1Kg: null, reps: '10–12', muscles: ['quads', 'glutes'], compound: true },
      { name: 'Leg Extension', sets: 2, cutSets: 3, wk1Kg: 37.5, reps: '12–15', muscles: ['quads'] },
      { name: 'Seated Leg Curl', sets: 3, cutSets: 3, wk1Kg: 40, reps: '10–15', muscles: ['hamstrings'] },
      { name: 'Calf Press', sets: 4, cutSets: 3, wk1Kg: 65, reps: '10–15', muscles: ['calves'] },
      { name: 'Crunch Machine', sets: 3, cutSets: 3, wk1Kg: 52.5, reps: '10–12', muscles: ['core'] },
      { name: 'Reverse Crunch', sets: 2, cutSets: 2, wk1Kg: null, reps: '12–15', muscles: ['core'] },
    ] },
    { key: 'upper_b', label: 'Upper B', color: C.cb_b, weekday: 4, exercises: [
      { name: 'DB Shoulder Press', sets: 3, cutSets: 3, wk1Kg: 28, reps: '8–10', muscles: ['shoulders', 'triceps'], compound: true },
      { name: 'Single Arm Lateral Raise (Cable)', sets: 4, cutSets: 4, wk1Kg: 5, reps: '12–20', muscles: ['shoulders'], note: 'per side' },
      { name: 'Pec Deck', sets: 2, cutSets: 1, wk1Kg: 47.5, reps: '12–15', muscles: ['chest'], note: 'cut: rotates with Chest Press (Machine)' },
      { name: 'Seated Cable Row (Wide Grip)', sets: 3, cutSets: 2, wk1Kg: 35, reps: '10–12', muscles: ['back'], compound: true, note: 'wide bar' },
      { name: 'DB Hammer Curl', sets: 3, cutSets: 2, wk1Kg: 16, reps: '10–12', muscles: ['biceps', 'forearms'] },
      { name: 'Single Arm Triceps Pushdown (Cable)', sets: 2, cutSets: 2, wk1Kg: 5, reps: '12–15', muscles: ['triceps'], note: 'per arm' },
      { name: 'Reverse EZ-Bar Curl', sets: 2, cutSets: 2, wk1Kg: 15, reps: '12–15', muscles: ['forearms', 'biceps'] },
      { name: 'Seated DB Wrist Curl', sets: 2, cutSets: 0, wk1Kg: 16, reps: '15–20', muscles: ['forearms'] },
    ] },
    { key: 'lower_b', label: 'Lower B', color: C.legs_b, weekday: 5, exercises: [
      { name: 'DB RDL', sets: 3, cutSets: 3, wk1Kg: 26, reps: '8–12', muscles: ['hamstrings', 'glutes', 'back'], compound: true },
      { name: 'Machine Hip Thrust', sets: 3, cutSets: 3, wk1Kg: 23.5, reps: '8–15', muscles: ['glutes'], compound: true },
      { name: 'Leg Press', sets: 2, cutSets: 2, wk1Kg: 70, reps: '12–15', muscles: ['quads', 'glutes'], compound: true, note: 'horizontal sled' },
      { name: 'Hip Adduction', sets: 2, cutSets: 0, wk1Kg: 50, reps: '12–15', muscles: ['glutes'] },
      { name: 'Calf Press', sets: 3, cutSets: 3, wk1Kg: 65, reps: '10–15', muscles: ['calves'] },
      { name: 'Hanging Knee Raise', sets: 3, cutSets: 3, wk1Kg: null, reps: '10–15', muscles: ['core'] },
      { name: 'Side Plank', sets: 2, cutSets: 2, wk1Kg: null, reps: '55s', muscles: ['core'], note: 'per side' },
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
 * becomes its `cutSets` and the cut-dropped lifts (`cutSets: 0`) fall out; bulk /
 * maintenance keep the base `sets`. Pure — the rep windows are authored per
 * exercise and never rewritten. */
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

/** Weekday → day for a program (or 'rest'). */
export function programDayFor(programId: string, weekday: number): ProgramDay | 'rest' {
  const p = PROGRAMS[programId] ?? APEX51
  return p.days.find((d) => d.weekday === weekday) ?? 'rest'
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
 */
export function prescribedFor(dayKey: string, phase: 'cut' | 'bulk'): { exercises: number; sets: number } | null {
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
  // A per-date swap wins over the weekday default (client cascade; empty on server).
  const override = getScheduleOverride(dateISO)
  if (override != null) return override !== REST_OVERRIDE
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay()
  if (eraForDate(dateISO) === 'ppl') return weekday !== 5 && weekday !== 6 // legacy PPL: trained Sun–Thu
  return programDayFor(DEFAULT_PROGRAM_ID, weekday) !== 'rest'
}

/** Inverse of {@link isTrainingDay} — Wed/Sat Zone-2 rest in HELIX-5, Fri/Sat in PPL. */
export function isRestDayFor(dateISO: string): boolean {
  return !isTrainingDay(dateISO)
}

// Legacy PPL weekday schedule (labels for pre-HELIX dates).
const PPL_WEEKDAY: Record<number, string | null> = {
  0: 'Upper', 1: 'Legs', 2: 'Push', 3: 'Pull', 4: 'Legs', 5: null, 6: null,
}

export interface ScheduleDay { label: string; sub?: string; dayKey?: string }

/**
 * The ONE era-aware "what's today's training day" helper — used by the
 * dashboard Train strip, the quick-log default, and the Insight Coach so
 * the whole app agrees. PPL-legacy dates show the PPL day; HELIX-era dates
 * show the active program's day. 'rest' on scheduled rest days.
 */
export function scheduleDayFor(dateISO: string, programId = getActiveProgramId()): ScheduleDay | 'rest' {
  // A per-date swap wins over the weekday default so the whole app cascades.
  const override = getScheduleOverride(dateISO)
  if (override != null) {
    if (override === REST_OVERRIDE) return 'rest'
    const od = (PROGRAMS[programId] ?? APEX51).days.find((d) => d.key === override)
    if (od) return { label: od.label, sub: od.sub, dayKey: od.key }
  }
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay()
  if (eraForDate(dateISO) === 'ppl') {
    const label = PPL_WEEKDAY[weekday]
    return label ? { label } : 'rest'
  }
  const d = programDayFor(programId, weekday)
  return d === 'rest' ? 'rest' : { label: d.label, sub: d.sub, dayKey: d.key }
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
  return v === 'bulk' || v === 'maintenance' ? v : 'cut'
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
