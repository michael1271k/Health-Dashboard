/**
 * Training programs + eras.
 * The PPL era ends and the recomposition era begins 2026-07-19 (Sunday).
 * Active program: HELIX-5 (5-day: Sun/Mon/Tue/Thu/Fri · Wed/Sat = Zone-2 rest).
 * The Helix Cut 5.1 nutrition block (1935 kcal) opens 2026-07-15.
 * Sessions are classified purely by date via `eraForDate` (no DB column needed).
 */
import { getScheduleOverride, REST_OVERRIDE } from '@/lib/schedule/overrides'

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

export const ERA_META: Record<Era, { label: string; short: string; color: string }> = {
  ppl:  { label: 'PPL Legacy', short: 'PPL',     color: '#79808C' },
  axis: { label: 'HELIX Era',  short: 'HELIX-5', color: '#8E9AAC' },
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
  sets: number
  wk1Kg: number | null   // starting load (seeds progressive-overload memory); DB loads = TOTAL kg
  reps: string           // rep window (double progression)
  muscles: string[]
  compound?: boolean
  bulkOnly?: boolean     // dropped from templates while cutting
  note?: string
}
export interface ProgramDay {
  key: string
  label: string
  sub?: string           // split sub-type shown under the name (e.g. "Quad Focus")
  color: string
  weekday: number        // 0=Sun … 6=Sat
  cutSetDelta?: number   // total sets removed in cut mode (v5.1 plan tables)
  exercises: ProgramExercise[]
}
export interface Program {
  id: string
  label: string
  era: Era
  active?: boolean
  drawer?: boolean
  days: ProgramDay[]
}

const C = { cbA: '#8E9AAC', legsA: '#3D7AB8', arms: '#3E9E7A', cbB: '#D4AF37', legsB: '#3E9E7A' }

// ── HELIX-5 (ACTIVE) — Sun/Mon/Tue/Thu/Fri ─────────────────────────────────
export const APEX51: Program = {
  id: 'apex51', label: 'HELIX-5', era: 'axis', active: true,   // id kept for localStorage compat
  days: [
    { key: 'cb_a', label: 'Upper A', sub: 'Chest + Back', color: C.cbA, weekday: 0, cutSetDelta: -3, exercises: [
      { name: 'Incline DB Press', sets: 3, wk1Kg: 32, reps: '8–12', muscles: ['chest', 'shoulders'], compound: true },
      { name: 'Lat Pulldown', sets: 3, wk1Kg: 45, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'Chest Press Machine', sets: 3, wk1Kg: 34, reps: '10–12', muscles: ['chest', 'triceps'], compound: true },
      { name: 'Seated Cable Row (V-grip)', sets: 3, wk1Kg: 38.5, reps: '10–12', muscles: ['back'], compound: true },
      { name: 'Pec Deck', sets: 2, wk1Kg: 47.5, reps: '12–15', muscles: ['chest'] },
      { name: 'Straight-Arm Pulldown', sets: 2, wk1Kg: 15, reps: '12–15', muscles: ['back'] },
      { name: 'Face Pull', sets: 3, wk1Kg: 13.75, reps: '12–15', muscles: ['shoulders', 'back'] },
    ] },
    { key: 'legs_a', label: 'Legs & Core A', sub: 'Quad Focus', color: C.legsA, weekday: 1, cutSetDelta: -4, exercises: [
      { name: 'Leg Press', sets: 4, wk1Kg: 70, reps: '8–12', muscles: ['quads', 'glutes'], compound: true, note: '1 warm-up @40kg' },
      { name: 'Hack/Smith Squat', sets: 3, wk1Kg: null, reps: '10–12', muscles: ['quads', 'glutes'], compound: true },
      { name: 'Leg Extension', sets: 3, wk1Kg: 37.5, reps: '12–15', muscles: ['quads'] },
      { name: 'Seated Leg Curl', sets: 3, wk1Kg: 40, reps: '10–15', muscles: ['hamstrings'] },
      { name: 'Calf Press', sets: 4, wk1Kg: 65, reps: '10–15', muscles: ['calves'] },
      { name: 'Crunch Machine', sets: 3, wk1Kg: 52.5, reps: '10–12', muscles: ['core'] },
      { name: 'Reverse Crunch', sets: 3, wk1Kg: null, reps: '12–15', muscles: ['core'] },
    ] },
    { key: 'arms', label: 'Delts & Arms', color: C.arms, weekday: 2, cutSetDelta: -4, exercises: [
      { name: 'DB Shoulder Press', sets: 3, wk1Kg: 28, reps: '8–10', muscles: ['shoulders', 'triceps'], compound: true },
      { name: 'Cable Lateral Raise', sets: 5, wk1Kg: 5, reps: '12–20', muscles: ['shoulders'], note: 'per side' },
      { name: 'Seated Incline DB Curl', sets: 3, wk1Kg: 14, reps: '8–12', muscles: ['biceps'] },
      { name: 'Cable Overhead Extension', sets: 3, wk1Kg: 9, reps: '10–15', muscles: ['triceps'] },
      { name: 'DB Hammer Curl', sets: 3, wk1Kg: 16, reps: '10–12', muscles: ['biceps', 'forearms'] },
      { name: 'Rope Triceps Pushdown', sets: 2, wk1Kg: 13.5, reps: '12–15', muscles: ['triceps'] },
      { name: 'Reverse EZ-Bar Curl', sets: 2, wk1Kg: 15, reps: '12–15', muscles: ['forearms', 'biceps'] },
      { name: 'Seated DB Wrist Curl', sets: 2, wk1Kg: 16, reps: '15–20', muscles: ['forearms'], bulkOnly: true },
    ] },
    // Names match the canonical (alias-resolved) catalog rows the sessions commit
    // under, so useExerciseMemory pre-loads the last logged numbers per exercise.
    { key: 'cb_b', label: 'Upper B', sub: 'Chest + Back', color: C.cbB, weekday: 4, cutSetDelta: -3, exercises: [
      { name: 'Chest Press (Machine)', sets: 3, wk1Kg: 35, reps: '10–12', muscles: ['chest', 'triceps'], compound: true },
      { name: 'Neutral-Grip Lat Pulldown', sets: 3, wk1Kg: 45, reps: '10–12', muscles: ['back'], compound: true },
      { name: 'Seated Cable Row - Bar Wide Grip', sets: 3, wk1Kg: 35, reps: '10–12', muscles: ['back'], compound: true },
      { name: 'Single Arm Cable Crossover', sets: 2, wk1Kg: 7.5, reps: '12–15', muscles: ['chest'], note: 'per arm' },
      { name: 'Single Arm Lateral Raise (Cable)', sets: 3, wk1Kg: 3.75, reps: '15–20', muscles: ['shoulders'], note: 'per side' },
      { name: 'Single Arm Triceps Pushdown (Cable)', sets: 2, wk1Kg: 5, reps: '12–15', muscles: ['triceps'], note: 'per arm' },
      { name: 'Preacher Curl (Machine)', sets: 3, wk1Kg: 15, reps: '8–12', muscles: ['biceps'] },
    ] },
    // Cold-start loads/reps mirror the user's real Legs B (memory overrides once
    // logged under these canonical names); bodyweight moves seed at 0 kg.
    { key: 'legs_b', label: 'Legs & Core B', sub: 'Posterior Focus', color: C.legsB, weekday: 5, cutSetDelta: -3, exercises: [
      { name: 'Romanian Deadlift (Dumbbell)', sets: 4, wk1Kg: 30, reps: '12–15', muscles: ['hamstrings', 'glutes', 'back'], compound: true },
      { name: 'Hip Thrust (Machine)', sets: 3, wk1Kg: 25, reps: '14–16', muscles: ['glutes'], compound: true },
      { name: 'Leg Press Horizontal', sets: 3, wk1Kg: 70, reps: '12–15', muscles: ['quads', 'glutes'], compound: true },
      { name: 'Seated Leg Curl', sets: 3, wk1Kg: 45, reps: '15–20', muscles: ['hamstrings'] },
      { name: 'Calf Press', sets: 4, wk1Kg: 67.5, reps: '14–18', muscles: ['calves'] },
      { name: 'Hanging Knee Raise', sets: 3, wk1Kg: null, reps: '16–20', muscles: ['core'] },
      { name: 'Side Plank', sets: 2, wk1Kg: null, reps: '55s', muscles: ['core'], note: 'per side' },
      { name: 'Hip Adduction', sets: 2, wk1Kg: 50, reps: '12–15', muscles: ['glutes'], bulkOnly: true },
    ] },
  ],
}

// ── AXIS-4 backup routines (drawer) ──────────────────────────────────────────
export const AXIS4_BUILDER: Program = {
  id: 'axis4_builder', label: 'AXIS-4 Builder (Bulk)', era: 'axis', drawer: true,
  days: [
    { key: 'upper_a', label: 'Upper A', color: C.cbA, weekday: 1, exercises: [
      { name: 'Incline DB Press', sets: 3, wk1Kg: 32, reps: '6–10', muscles: ['chest', 'shoulders'], compound: true },
      { name: 'Lat Pulldown', sets: 3, wk1Kg: 45, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'DB Shoulder Press', sets: 3, wk1Kg: 28, reps: '8–12', muscles: ['shoulders'], compound: true },
      { name: 'Seated Cable Row (V-grip)', sets: 3, wk1Kg: 38.5, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'DB Hammer Curl', sets: 3, wk1Kg: 16, reps: '10–12', muscles: ['biceps'] },
      { name: 'Rope Triceps Pushdown', sets: 3, wk1Kg: 13.5, reps: '10–12', muscles: ['triceps'] },
    ] },
    { key: 'lower_a', label: 'Lower A', color: C.legsA, weekday: 2, exercises: [
      { name: 'Leg Press', sets: 4, wk1Kg: 70, reps: '6–10', muscles: ['quads', 'glutes'], compound: true },
      { name: 'DB RDL', sets: 3, wk1Kg: 26, reps: '8–12', muscles: ['hamstrings', 'glutes'], compound: true },
      { name: 'Leg Extension', sets: 3, wk1Kg: 37.5, reps: '12–15', muscles: ['quads'] },
      { name: 'Seated Leg Curl', sets: 3, wk1Kg: 40, reps: '12–15', muscles: ['hamstrings'] },
      { name: 'Calf Press', sets: 4, wk1Kg: 65, reps: '12–15', muscles: ['calves'] },
    ] },
    { key: 'upper_b', label: 'Upper B', color: C.cbB, weekday: 4, exercises: [
      { name: 'Machine Chest Press', sets: 3, wk1Kg: 34, reps: '8–12', muscles: ['chest'], compound: true },
      { name: 'Neutral-Grip Lat Pulldown', sets: 3, wk1Kg: 45, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'Cable Lateral Raise', sets: 4, wk1Kg: 5, reps: '12–15', muscles: ['shoulders'] },
      { name: 'Pec Deck', sets: 2, wk1Kg: 47.5, reps: '12–15', muscles: ['chest'] },
      { name: 'Seated Incline DB Curl', sets: 3, wk1Kg: 14, reps: '12–15', muscles: ['biceps'] },
      { name: 'Cable Overhead Extension', sets: 3, wk1Kg: 9, reps: '12–15', muscles: ['triceps'] },
    ] },
    { key: 'lower_b', label: 'Lower B', color: C.legsB, weekday: 5, exercises: [
      { name: 'Machine Hip Thrust', sets: 3, wk1Kg: 23.5, reps: '8–12', muscles: ['glutes'], compound: true },
      { name: 'Hack/Smith Squat', sets: 3, wk1Kg: null, reps: '8–12', muscles: ['quads', 'glutes'], compound: true },
      { name: 'Hip Adduction', sets: 2, wk1Kg: 50, reps: '12–15', muscles: ['glutes'] },
      { name: 'Crunch Machine', sets: 3, wk1Kg: 52.5, reps: '12–15', muscles: ['core'] },
    ] },
  ],
}
export const AXIS4_DEFENDER: Program = {
  ...AXIS4_BUILDER, id: 'axis4_defender', label: 'AXIS-4 Defender (Cut)',
  days: AXIS4_BUILDER.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, reps: e.compound ? '8–12' : '15–20' })) })),
}

export const PROGRAMS: Record<string, Program> = {
  [APEX51.id]: APEX51, [AXIS4_BUILDER.id]: AXIS4_BUILDER, [AXIS4_DEFENDER.id]: AXIS4_DEFENDER,
}
export const DEFAULT_PROGRAM_ID = APEX51.id

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
 * What the program actually PRESCRIBES for a day, after cut adjustments:
 * `bulkOnly` lifts are dropped while cutting and `cutSetDelta` trims the total
 * set count. The scorer grades a session's coverage against this, so it has to
 * reflect the plan the athlete is really running, not the bulk template.
 */
export function prescribedFor(dayKey: string, program: 'cut' | 'bulk'): { exercises: number; sets: number } | null {
  const d = programDayByKey(dayKey)
  if (!d) return null
  const list = program === 'cut' ? d.exercises.filter((e) => !e.bulkOnly) : d.exercises
  const sets = list.reduce((n, e) => n + e.sets, 0) + (program === 'cut' ? (d.cutSetDelta ?? 0) : 0)
  return { exercises: list.length, sets: Math.max(1, sets) }
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
}
export function daySplitEnum(dayKey: string): 'push' | 'pull' | 'legs' | 'upper' | 'lower' {
  return (DAY_SPLIT[dayKey] ?? 'upper') as 'push' | 'pull' | 'legs' | 'upper' | 'lower'
}

const ACTIVE_KEY = 'helix_active_program'
export function getActiveProgramId(): string {
  if (typeof window === 'undefined') return DEFAULT_PROGRAM_ID
  const stored = window.localStorage.getItem(ACTIVE_KEY) ?? window.localStorage.getItem('apex_active_program')
  return stored && PROGRAMS[stored] ? stored : DEFAULT_PROGRAM_ID
}
export function setActiveProgramId(id: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_KEY, id)
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
