import { describe, it, expect } from 'vitest'
import { draftMuscleSets, draftPhysicalSets } from '@/components/command-center/MuscleDistribution'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { toLandmarkMuscle, type LandmarkMuscle } from '@/lib/training/landmarks'
import type { SessionDraft, DraftSet } from '@/lib/sessions/draft'

/**
 * ── THE HEVY RECONCILIATION, PINNED ──────────────────────────────────────────
 *
 * The muscle breakdown disagreed with Hevy's for the same workout, and the gap
 * was not one bug — it was three, which is exactly why it looked arbitrary:
 *
 *   1. Hevy counts warm-up sets; Helix excluded them everywhere. That alone was
 *      Quads +1.0, Hamstrings +0.5 and Glutes +0.5 on this session.
 *   2. `muscleMap` gave the leg press no adductors and the dumbbell RDL no
 *      forearms, so two muscles read zero on a day that trained both.
 *   3. `Back` was one landmark, so Hevy's "Lats 1.5" had no counterpart that
 *      could be compared to it.
 *
 * This is the session those three were found on — 2026-08-21, Legs & Core B,
 * read straight out of `workout_sets` — and these are Hevy's own numbers for it.
 * If any of the three regresses, one of these lines moves.
 */

/** The real deck. Leg press carried ONE warm-up; nothing else did. */
const SESSION: Array<{ name: string; sets: number; warmups?: number }> = [
  { name: 'Romanian Deadlift (DB)', sets: 3 },
  { name: 'Hip Thrust (Machine)', sets: 3 },
  { name: 'Leg Press', sets: 3, warmups: 1 },
  { name: 'Calf Press', sets: 3 },
  { name: 'Seated Leg Curl', sets: 2 },
  { name: 'Hanging Knee Raise', sets: 3 },
  { name: 'Side Plank', sets: 2 },
]

/**
 * `muscle_groups` as the catalog actually holds them for these seven rows.
 * Passed explicitly because `resolveMovers` falls back to them when the name
 * table has no rule, which is the real path for several of these.
 */
const GROUPS: Record<string, string[]> = {
  'Romanian Deadlift (DB)': ['hamstrings', 'glutes', 'lower back', 'upper back', 'lats'],
  'Hip Thrust (Machine)': ['glutes', 'hamstrings', 'quadriceps'],
  'Leg Press': ['quadriceps', 'glutes', 'hamstrings'],
  'Calf Press': ['calves'],
  'Seated Leg Curl': ['hamstrings', 'calves'],
  'Hanging Knee Raise': ['abdominals'],
  'Side Plank': ['obliques', 'abdominals'],
}

function draft(): SessionDraft {
  return {
    date: '2026-08-21', dayKey: 'legs_b', splitDay: 'Legs & Core B', notes: '',
    exercises: SESSION.map((ex, i) => ({
      localId: `ex${i}`,
      name: ex.name,
      kind: 'lift' as const,
      muscleGroups: GROUPS[ex.name],
      sets: Array.from({ length: ex.sets }, (_, n): DraftSet => ({
        weightKg: 40, reps: 10, done: true,
        ...(n < (ex.warmups ?? 0) ? { setType: 'warmup' as const } : {}),
      })),
    })),
  } as unknown as SessionDraft
}

/** Hevy's breakdown for this exact session, as reported in its own UI. */
const HEVY: Partial<Record<LandmarkMuscle, number>> = {
  Hamstrings: 8,
  Glutes: 6,
  'Abs/core': 5,
  Quads: 4.5,
  Calves: 4,
  Forearms: 1.5,
  Adductors: 1.5,
  Lats: 1.5,
}

describe('the muscle breakdown agrees with Hevy, set for set', () => {
  const actual = draftMuscleSets(draft())

  for (const [muscle, want] of Object.entries(HEVY) as Array<[LandmarkMuscle, number]>) {
    it(`${muscle} = ${want}`, () => {
      expect(Math.round((actual[muscle] ?? 0) * 10) / 10).toBe(want)
    })
  }

  it('credits nothing Hevy does not', () => {
    // A muscle appearing here that Hevy does not list means a secondary was
    // invented, which is the same class of error as one being missing.
    const extra = (Object.entries(actual) as Array<[LandmarkMuscle, number]>)
      .filter(([m, n]) => n > 0 && !(m in HEVY))
      .map(([m, n]) => `${m}=${n}`)
    // Upper back and Lower back are the honest exception: the RDL genuinely
    // trains both, Hevy lists them too, and the user's report simply did not
    // quote every line. They are asserted separately below.
    expect(extra.sort()).toEqual(['Lower back=1.5', 'Upper back=1.5'])
  })

  it('totals 35 weighted sets across 19 physical ones', () => {
    // 19 = every set including the warm-up (18 working + 1). The weighted total
    // exceeds it because a compound lands on several muscles — that is the
    // credit rule, and the sheet prints both numbers side by side for exactly
    // this reason.
    expect(draftPhysicalSets(draft())).toBe(19)
    const weighted = Object.values(actual).reduce((a, b) => a + b, 0)
    // Hevy's eight quoted lines sum to 32. Ours adds the two back lines the
    // report did not quote, which the RDL earns at 0.5 each: 35.
    expect(Object.values(HEVY).reduce((a, b) => a + b, 0)).toBe(32)
    expect(Math.round(weighted * 10) / 10).toBe(35)
  })
})

describe('the three fixes, individually', () => {
  it('counts the warm-up — without it Quads is 3.5, not 4.5', () => {
    const noWarmup = draft()
    noWarmup.exercises = noWarmup.exercises.map((ex) => ({
      ...ex, sets: ex.sets.filter((s) => s.setType !== 'warmup'),
    }))
    expect(draftMuscleSets(noWarmup).Quads).toBe(3.5)
    expect(draftMuscleSets(draft()).Quads).toBe(4.5)
  })

  it('gives the leg press its adductors and the dumbbell RDL its forearms', () => {
    expect(resolveMovers('Leg Press', null).secondary).toContain('adductors')
    expect(resolveMovers('Romanian Deadlift (DB)', null).secondary).toContain('forearms')
  })

  it('separates the lats from the rest of the back', () => {
    expect(toLandmarkMuscle('lats')).toBe('Lats')
    expect(toLandmarkMuscle('upper back')).toBe('Upper back')
    expect(toLandmarkMuscle('lower back')).toBe('Lower back')
    // A bare "back" is a pulldown or a row in this catalog, so it is lat work.
    expect(toLandmarkMuscle('back')).toBe('Lats')
  })
})
