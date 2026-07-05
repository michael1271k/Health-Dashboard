/**
 * Training programs + eras. The PPL era ends and the 6-month AXIS recomposition
 * begins on 2026-07-19 (Sunday). Data before that = "PPL Legacy"; on/after = "AXIS".
 * Sessions are classified purely by date via `eraForDate` (no DB column needed).
 */
export type Era = 'ppl' | 'axis'
export const AXIS_ERA_START = '2026-07-19'

export function eraForDate(dateISO: string): Era {
  return dateISO >= AXIS_ERA_START ? 'axis' : 'ppl'
}

export const ERA_META: Record<Era, { label: string; short: string; color: string }> = {
  ppl:  { label: 'PPL Legacy', short: 'PPL',    color: '#8B97B2' },
  axis: { label: 'AXIS Era',   short: 'AXIS-5', color: '#38E1FF' },
}

export interface ProgramExercise {
  name: string
  wk1Kg: number | null   // Week-1 starting load (seeds progressive-overload memory)
  reps: string           // rep range (double progression)
  muscles: string[]      // canonical muscle tags (feed muscle analytics)
  compound?: boolean
  note?: string
}
export interface ProgramDay {
  key: string
  label: string
  color: string
  weekday: number        // 0=Sun … 6=Sat
  exercises: ProgramExercise[]
}
export interface Program {
  id: string
  label: string
  era: Era
  active?: boolean
  drawer?: boolean       // backup / alternate routine
  days: ProgramDay[]
}

const C = { torso: '#38E1FF', quads: '#4FC3FF', armory: '#43F59B', pump: '#E8C57A', posterior: '#19E3B1' }

// ── AXIS-5 Aesthetic Hybrid (ACTIVE) — compounds 8–12, isolations 12–15 ──────
export const AXIS5: Program = {
  id: 'axis5_hybrid', label: 'AXIS-5 Aesthetic Hybrid', era: 'axis', active: true,
  days: [
    { key: 'torso', label: 'Torso Clash', color: C.torso, weekday: 1, exercises: [
      { name: 'Incline DB Press', wk1Kg: 32, reps: '8–12', muscles: ['chest', 'shoulders'], compound: true },
      { name: 'Lat Pulldown', wk1Kg: 45, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'Chest Press Machine', wk1Kg: 34, reps: '8–12', muscles: ['chest', 'triceps'], compound: true },
      { name: 'Seated Cable Row (V-grip)', wk1Kg: 38.5, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'Pec Deck', wk1Kg: 47.5, reps: '12–15', muscles: ['chest'] },
      { name: 'Straight-Arm Pulldown', wk1Kg: 15, reps: '12–15', muscles: ['back'] },
      { name: 'Face Pull', wk1Kg: 13.75, reps: '12–15', muscles: ['shoulders', 'back'] },
    ] },
    { key: 'quads', label: 'Quad Forge', color: C.quads, weekday: 2, exercises: [
      { name: 'Leg Press', wk1Kg: 70, reps: '8–12', muscles: ['quads', 'glutes'], compound: true, note: 'Warm-up 40kg' },
      { name: 'Leg Extension', wk1Kg: 37.5, reps: '12–15', muscles: ['quads'] },
      { name: 'DB Bulgarian Split Squat', wk1Kg: 16, reps: '8–12', muscles: ['quads', 'glutes'], compound: true },
      { name: 'Seated Leg Curl', wk1Kg: 40, reps: '12–15', muscles: ['hamstrings'] },
      { name: 'Calf Press', wk1Kg: 65, reps: '12–15', muscles: ['calves'] },
      { name: 'Crunch Machine', wk1Kg: 52.5, reps: '12–15', muscles: ['core'] },
      { name: 'Reverse Crunch', wk1Kg: null, reps: '12–15', muscles: ['core'] },
      { name: 'Pallof Press', wk1Kg: null, reps: '12–15', muscles: ['core'] },
    ] },
    { key: 'armory', label: 'The Armory', color: C.armory, weekday: 3, exercises: [
      { name: 'DB Shoulder Press', wk1Kg: 28, reps: '8–12', muscles: ['shoulders', 'triceps'], compound: true },
      { name: 'Cable Lateral Raise', wk1Kg: 5, reps: '12–15', muscles: ['shoulders'], note: 'per side' },
      { name: 'Seated Incline DB Curl', wk1Kg: 14, reps: '12–15', muscles: ['biceps'] },
      { name: 'Cross-Body Cable Extension', wk1Kg: 6, reps: '12–15', muscles: ['triceps'], note: '5–7.5kg/arm' },
      { name: 'DB Hammer Curl', wk1Kg: 16, reps: '12–15', muscles: ['biceps', 'forearms'] },
      { name: 'Cable Overhead Extension', wk1Kg: 9, reps: '12–15', muscles: ['triceps'] },
      { name: 'Reverse EZ-Bar Curl', wk1Kg: 15, reps: '12–15', muscles: ['forearms', 'biceps'] },
      { name: 'Seated DB Wrist Curl', wk1Kg: 16, reps: '12–15', muscles: ['forearms'] },
    ] },
    { key: 'pump', label: 'Pump Protocol', color: C.pump, weekday: 5, exercises: [
      { name: 'Machine Chest Press', wk1Kg: 34, reps: '8–12', muscles: ['chest', 'triceps'], compound: true },
      { name: 'Wide-Grip Cable Row', wk1Kg: 34, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'Single-Arm Cable Fly', wk1Kg: 6, reps: '12–15', muscles: ['chest'], note: '5–7.5kg' },
      { name: 'Neutral-Grip Lat Pulldown', wk1Kg: 45, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'Cable Lateral Raise', wk1Kg: 4.5, reps: '12–15', muscles: ['shoulders'], note: '4–5kg/side' },
      { name: 'Machine Preacher Curl', wk1Kg: 15, reps: '12–15', muscles: ['biceps'] },
      { name: 'Rope Triceps Pushdown', wk1Kg: 13.5, reps: '12–15', muscles: ['triceps'] },
      { name: 'Behind-Back Wrist Curl', wk1Kg: null, reps: '12–15', muscles: ['forearms'] },
    ] },
    { key: 'posterior', label: 'Posterior Engine', color: C.posterior, weekday: 6, exercises: [
      { name: 'DB RDL', wk1Kg: 26, reps: '8–12', muscles: ['hamstrings', 'glutes', 'back'], compound: true },
      { name: 'Machine Hip Thrust', wk1Kg: 23.5, reps: '8–12', muscles: ['glutes'], compound: true, note: 'Reset load' },
      { name: 'Leg Press', wk1Kg: 65, reps: '8–12', muscles: ['quads', 'glutes'], compound: true, note: 'Work set' },
      { name: 'Hip Adduction', wk1Kg: 50, reps: '12–15', muscles: ['glutes'] },
      { name: 'Calf Raise', wk1Kg: null, reps: '12–15', muscles: ['calves'] },
      { name: 'Machine Lateral Raise', wk1Kg: null, reps: '12–15', muscles: ['shoulders'] },
      { name: 'Cable Crunch', wk1Kg: null, reps: '12–15', muscles: ['core'] },
      { name: 'Hanging Knee Raise', wk1Kg: null, reps: '12–15', muscles: ['core'] },
      { name: 'Side Plank', wk1Kg: null, reps: '12–15', muscles: ['core'] },
    ] },
  ],
}

// ── AXIS-4 backup routines (drawer) — 4-day Upper/Lower templates from the same pool ──
export const AXIS4_BUILDER: Program = {
  id: 'axis4_builder', label: 'AXIS-4 Builder (Bulk)', era: 'axis', drawer: true,
  days: [
    { key: 'upper_a', label: 'Upper A', color: C.torso, weekday: 1, exercises: [
      { name: 'Incline DB Press', wk1Kg: 32, reps: '6–10', muscles: ['chest', 'shoulders'], compound: true },
      { name: 'Lat Pulldown', wk1Kg: 45, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'DB Shoulder Press', wk1Kg: 28, reps: '8–12', muscles: ['shoulders'], compound: true },
      { name: 'Seated Cable Row (V-grip)', wk1Kg: 38.5, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'DB Hammer Curl', wk1Kg: 16, reps: '10–12', muscles: ['biceps'] },
      { name: 'Rope Triceps Pushdown', wk1Kg: 13.5, reps: '10–12', muscles: ['triceps'] },
    ] },
    { key: 'lower_a', label: 'Lower A', color: C.quads, weekday: 2, exercises: [
      { name: 'Leg Press', wk1Kg: 70, reps: '6–10', muscles: ['quads', 'glutes'], compound: true },
      { name: 'DB RDL', wk1Kg: 26, reps: '8–12', muscles: ['hamstrings', 'glutes'], compound: true },
      { name: 'Leg Extension', wk1Kg: 37.5, reps: '12–15', muscles: ['quads'] },
      { name: 'Seated Leg Curl', wk1Kg: 40, reps: '12–15', muscles: ['hamstrings'] },
      { name: 'Calf Press', wk1Kg: 65, reps: '12–15', muscles: ['calves'] },
    ] },
    { key: 'upper_b', label: 'Upper B', color: C.pump, weekday: 4, exercises: [
      { name: 'Machine Chest Press', wk1Kg: 34, reps: '8–12', muscles: ['chest'], compound: true },
      { name: 'Neutral-Grip Lat Pulldown', wk1Kg: 45, reps: '8–12', muscles: ['back'], compound: true },
      { name: 'Cable Lateral Raise', wk1Kg: 5, reps: '12–15', muscles: ['shoulders'] },
      { name: 'Pec Deck', wk1Kg: 47.5, reps: '12–15', muscles: ['chest'] },
      { name: 'Seated Incline DB Curl', wk1Kg: 14, reps: '12–15', muscles: ['biceps'] },
      { name: 'Cable Overhead Extension', wk1Kg: 9, reps: '12–15', muscles: ['triceps'] },
    ] },
    { key: 'lower_b', label: 'Lower B', color: C.posterior, weekday: 5, exercises: [
      { name: 'Machine Hip Thrust', wk1Kg: 23.5, reps: '8–12', muscles: ['glutes'], compound: true },
      { name: 'DB Bulgarian Split Squat', wk1Kg: 16, reps: '8–12', muscles: ['quads', 'glutes'], compound: true },
      { name: 'Hip Adduction', wk1Kg: 50, reps: '12–15', muscles: ['glutes'] },
      { name: 'Crunch Machine', wk1Kg: 52.5, reps: '12–15', muscles: ['core'] },
    ] },
  ],
}
export const AXIS4_DEFENDER: Program = {
  ...AXIS4_BUILDER, id: 'axis4_defender', label: 'AXIS-4 Defender (Cut)',
  // Same movements, cut-phase rep ranges — higher reps, more density.
  days: AXIS4_BUILDER.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, reps: e.compound ? '8–12' : '15–20' })) })),
}

export const PROGRAMS: Record<string, Program> = {
  [AXIS5.id]: AXIS5, [AXIS4_BUILDER.id]: AXIS4_BUILDER, [AXIS4_DEFENDER.id]: AXIS4_DEFENDER,
}
export const DEFAULT_PROGRAM_ID = AXIS5.id

/** Weekday → day for a program (or 'rest'). */
export function programDayFor(programId: string, weekday: number): ProgramDay | 'rest' {
  const p = PROGRAMS[programId] ?? AXIS5
  return p.days.find((d) => d.weekday === weekday) ?? 'rest'
}

// Map a program-day key onto the existing split_day enum (for saving sessions).
const DAY_SPLIT: Record<string, string> = {
  torso: 'upper', quads: 'legs', armory: 'upper', pump: 'upper', posterior: 'legs',
  upper_a: 'upper', lower_a: 'legs', upper_b: 'upper', lower_b: 'legs',
}
export function daySplitEnum(dayKey: string): 'push' | 'pull' | 'legs' | 'upper' | 'lower' {
  return (DAY_SPLIT[dayKey] ?? 'upper') as 'push' | 'pull' | 'legs' | 'upper' | 'lower'
}

const ACTIVE_KEY = 'apex_active_program'
export function getActiveProgramId(): string {
  if (typeof window === 'undefined') return DEFAULT_PROGRAM_ID
  return window.localStorage.getItem(ACTIVE_KEY) || DEFAULT_PROGRAM_ID
}
export function setActiveProgramId(id: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_KEY, id)
}
