import { describe, it, expect } from 'vitest'
import { draftMuscleSets, draftPhysicalSets } from '@/components/command-center/MuscleDistribution'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import {
  toLandmarkMuscle, weeklyVolumeByMuscle, LANDMARK_MUSCLES, type LandmarkMuscle,
} from '@/lib/training/landmarks'
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
    // trains both, Hevy's own definition lists both, and the report simply did
    // not quote every line.
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

  it('credits the adductors to the HIP THRUST, not the leg press', () => {
    // This session is why the leg press was tagged `adductors` in the first
    // place: three leg-press sets produce Hevy's Adductors 1.5 exactly, so the
    // attribution looked confirmed. It was a coincidence of set counts — the
    // hip thrust also has three sets here. Across the whole week the leg-press
    // rule pays 3.5 against Hevy's 1.5, and the hip-thrust rule pays 1.5.
    expect(resolveMovers('Leg Press', null).secondary).not.toContain('adductors')
    expect(resolveMovers('Hip Thrust (Machine)', null).secondary).toContain('adductors')
    expect(draftMuscleSets(draft()).Adductors).toBe(1.5)
  })

  it('keeps the dumbbell RDL its forearms, on Hevy’s own arithmetic', () => {
    // Hevy's displayed "other muscles" for the DB RDL does not list forearms.
    // Its NUMBERS do: this session has exactly one grip-loaded movement and
    // Hevy reported Forearms 1.5 for it, which is 0.5 × 3 RDL sets and cannot
    // be anything else. Where a vendor's label and its arithmetic disagree,
    // the arithmetic is the thing being compared.
    expect(resolveMovers('Romanian Deadlift (DB)', null).secondary).toContain('forearms')
    expect(draftMuscleSets(draft()).Forearms).toBe(1.5)
  })

  it('separates the lats from the rest of the back', () => {
    expect(toLandmarkMuscle('lats')).toBe('Lats')
    expect(toLandmarkMuscle('upper back')).toBe('Upper back')
    expect(toLandmarkMuscle('lower back')).toBe('Lower back')
    // A bare "back" is a pulldown or a row in this catalog, so it is lat work.
    expect(toLandmarkMuscle('back')).toBe('Lats')
  })
})

/**
 * ── UPPER A, 2026-08-23, AND THE ONE LINE THAT IS NOT HEVY'S ─────────────────
 *
 * Read straight out of `workout_sets`: seven movements, eighteen sets, no
 * warm-ups. Twelve of Hevy's own lines are reproduced exactly; the thirteenth is
 * the deltoid, and the arithmetic below is why it is a MODELLING difference
 * rather than a dictionary bug.
 *
 * Hevy has ONE `Shoulders` bucket. Helix has three heads, because a face pull
 * and an overhead press are not interchangeable volume and folding them
 * together is what used to inflate the side delt. Compared head-for-head the two
 * cannot be compared at all, so the test compares the SUM:
 *
 *   Hevy  Shoulders 5.5 = Face Pull 3 (primary) + Incline DB Press 1.5 + Chest
 *                         Press (Machine) 1.0  — and nothing for the pec deck.
 *   Helix         6.5 = Front delts 3.5 (Incline 1.5 + Chest Press 1.0 +
 *                         Pec Deck 1.0) + Rear delts 3.0 (Face Pull).
 *
 * The gap is EXACTLY 1.0, and it is exactly the pec deck's front-delt secondary
 * — 0.5 × 2 sets. That credit is deliberate and already argued in `muscleMap`:
 * a pec deck is horizontal adduction with the elbow fixed, and the anterior
 * deltoid is a horizontal adductor. Hevy declines to tag it; the weekly test
 * below has recorded the same divergence (pec deck + cable crossover + wide-grip
 * row + shoulder-press side-delt assistance = 4.5) since the twelve-of-twelve
 * pass. It is left alone here rather than reversed, and pinned so that if
 * anybody ever DOES reverse it, it is a decision and not a drift.
 */
const UPPER_A_0823: Array<{ name: string; groups: string[]; sets: number }> = [
  { name: 'Chest Press (Machine)', groups: ['chest', 'triceps', 'front_delts'], sets: 2 },
  { name: 'Face Pull', groups: ['rear_delts', 'upper back', 'traps'], sets: 3 },
  { name: 'Incline DB Press', groups: ['chest', 'triceps', 'front_delts'], sets: 3 },
  { name: 'Lat Pulldown', groups: ['lats', 'upper back', 'biceps', 'forearms'], sets: 3 },
  { name: 'Pec Deck', groups: ['chest', 'front_delts'], sets: 2 },
  { name: 'Seated Cable Row (V-Grip)', groups: ['upper back', 'lats', 'biceps', 'forearms'], sets: 2 },
  { name: 'Straight-Arm Pulldown', groups: ['lats', 'triceps'], sets: 3 },
]

function upperADraft(): SessionDraft {
  return {
    date: '2026-08-23', dayKey: 'cb_a', splitDay: 'upper', notes: '',
    exercises: UPPER_A_0823.map((ex, i) => ({
      localId: `ua${i}`,
      name: ex.name,
      kind: 'lift' as const,
      muscleGroups: ex.groups,
      sets: Array.from({ length: ex.sets }, (): DraftSet => ({ weightKg: 40, reps: 10, done: true })),
    })),
  } as unknown as SessionDraft
}

describe('Upper A · 2026-08-23 against Hevy', () => {
  const actual = draftMuscleSets(upperADraft())
  const at = (m: LandmarkMuscle) => Math.round((actual[m] ?? 0) * 10) / 10

  /** Hevy's lines for this session. `Shoulders` is handled separately below. */
  const HEVY_0823: Partial<Record<LandmarkMuscle, number>> = {
    Chest: 7,
    Lats: 7,
    Biceps: 4,
    Triceps: 4,
    'Upper back': 3.5,
    Forearms: 2.5,
  }

  for (const [muscle, want] of Object.entries(HEVY_0823) as Array<[LandmarkMuscle, number]>) {
    it(`${muscle} matches Hevy at ${want}`, () => {
      expect(at(muscle)).toBe(want)
    })
  }

  it('counts eighteen physical sets', () => {
    expect(draftPhysicalSets(upperADraft())).toBe(18)
  })

  it('splits the shoulder into the two heads this session actually trained', () => {
    // Hevy cannot say this: its single bucket cannot tell you that three of
    // those 5.5 sets were REAR delt work and none of it was side delt.
    expect(at('Front delts')).toBe(2.5)
    expect(at('Rear delts')).toBe(3)
    expect(at('Side delts')).toBe(0)
  })

  /**
   * ── THIS TEST USED TO PIN THE OPPOSITE ─────────────────────────────────────
   * It asserted `delts - 5.5 === 1` and called the gap deliberate: the pec
   * deck's front-delt secondary, argued for on the anatomy and declined by
   * Hevy. Reconciling the whole week (see `hevy-week-parity.test.ts`) showed
   * the same 0.5-per-set credit appearing on three different days, on three
   * different movements, always in the same direction. It was not a judgement
   * call Hevy happened to disagree with; it was a rule that was wrong. The
   * credit is gone, and this line is now zero.
   */
  it('matches Hevy’s Shoulders exactly — the pec deck pays no front delt', () => {
    const delts = at('Front delts') + at('Rear delts') + at('Side delts')
    expect(delts).toBe(5.5)
    expect(delts - 5.5).toBe(0)
    expect(resolveMovers('Pec Deck', null).secondary).not.toContain('front_delts')
  })

  it('credits NEITHER row grip a rear delt', () => {
    // The two grips still resolve to two different entries and must stay apart
    // — the wide grip pays the traps and the V-grip does not, which is a real
    // difference and the reason the catalogue split them. What changed is that
    // neither pays the SHOULDER any more: Hevy classes a row as back work on
    // either grip, and the wide grip's rear-delt credit was 1.0 of the 2.0 by
    // which Upper B over-reported Shoulders.
    expect(resolveMovers('Seated Cable Row (V-Grip)', null).secondary).not.toContain('rear_delts')
    expect(resolveMovers('Seated Cable Row (Wide Grip)', null).secondary).not.toContain('rear_delts')
    expect(resolveMovers('Seated Cable Row (Wide Grip)', null).secondary).toContain('traps')
    expect(resolveMovers('Seated Cable Row (V-Grip)', null).secondary).not.toContain('traps')
  })

  it('gives the straight-arm pulldown no upper back', () => {
    // The other line that has to hold for Upper back to land on 3.5: the row's
    // 2.0 primary plus the lat pulldown's 1.5 secondary, and nothing else.
    expect(resolveMovers('Straight-Arm Pulldown', null).secondary).not.toContain('upper back')
    expect(at('Upper back')).toBe(3.5)
  })
})

/**
 * ── THE WHOLE WEEK, PINNED ───────────────────────────────────────────────────
 *
 * The session fixture above proves the DRAFT path. This one proves the path the
 * Week-to-Date box actually renders: `weeklyVolumeByMuscle`, fed the way
 * `useWeeklyVolume` feeds it.
 *
 * The rows are the real week of 2026-08-16 → 2026-08-22 (five sessions, cut
 * phase), read straight out of `workout_sets`: `sets` is the DISTINCT set count
 * after unilateral L/R rows are collapsed on `pair_id`, and `warmups` is the
 * count `useWeeklyVolume` used to discard. Two Leg Press warm-ups, nothing else.
 *
 * Thirteen of the fourteen numbers the app printed before this change are
 * reproduced by this fixture exactly, which is what makes it a regression net
 * rather than a wish: the aggregator was never wrong, the dictionary and the
 * filters were.
 */
const WEEK: Array<{ name: string; groups: string[]; sets: number; warmups?: number }> = [
  // 08-16 · Upper A
  { name: 'Chest Press (Machine)', groups: ['chest', 'triceps', 'front_delts'], sets: 2 },
  { name: 'Face Pull', groups: ['rear_delts', 'upper back', 'traps'], sets: 3 },
  { name: 'Incline DB Press', groups: ['chest', 'triceps', 'front_delts'], sets: 3 },
  { name: 'Lat Pulldown', groups: ['lats', 'upper back', 'biceps', 'forearms'], sets: 3 },
  { name: 'Pec Deck', groups: ['chest', 'front_delts'], sets: 2 },
  { name: 'Seated Cable Row (V-Grip)', groups: ['upper back', 'lats', 'biceps', 'forearms'], sets: 2 },
  { name: 'Straight-Arm Pulldown', groups: ['lats', 'triceps', 'upper back'], sets: 3 },
  // 08-17 · Legs & Core A
  { name: 'Calf Press', groups: ['calves'], sets: 3 },
  { name: 'Crunch Machine', groups: ['abdominals'], sets: 3 },
  { name: 'Hack Squat', groups: ['quadriceps', 'glutes', 'hamstrings'], sets: 2 },
  { name: 'Leg Extension', groups: ['quadriceps'], sets: 3 },
  { name: 'Leg Press', groups: ['quadriceps', 'glutes', 'hamstrings'], sets: 3, warmups: 1 },
  { name: 'Reverse Crunch', groups: ['abdominals'], sets: 3 },
  { name: 'Seated Leg Curl', groups: ['hamstrings', 'calves'], sets: 3 },
  // 08-18 · Delts & Arms
  { name: 'Cable Overhead Extension', groups: ['triceps'], sets: 3 },
  { name: 'DB Hammer Curl', groups: ['biceps', 'forearms'], sets: 3 },
  { name: 'DB Shoulder Press', groups: ['front_delts', 'side_delts', 'triceps'], sets: 3 },
  { name: 'Reverse EZ-Bar Curl', groups: ['forearms', 'biceps'], sets: 2 },
  { name: 'Rope Triceps Pushdown', groups: ['triceps'], sets: 2 },
  { name: 'Seated Incline DB Curl', groups: ['biceps'], sets: 3 },
  { name: 'Single Arm Lateral Raise (Cable)', groups: ['side_delts'], sets: 4 },
  // 08-20 · Upper B
  { name: 'Chest Press (Machine)', groups: ['chest', 'triceps', 'front_delts'], sets: 3 },
  { name: 'Neutral-Grip Lat Pulldown', groups: ['lats', 'upper back', 'biceps', 'forearms'], sets: 2 },
  { name: 'Preacher Curl (Machine)', groups: ['biceps'], sets: 3 },
  { name: 'Seated Cable Row (Wide Grip)', groups: ['upper back', 'lats', 'traps', 'rear_delts', 'biceps', 'forearms'], sets: 2 },
  { name: 'Single Arm Cable Crossover', groups: ['chest', 'front_delts'], sets: 2 },
  { name: 'Single Arm Lateral Raise (Cable)', groups: ['side_delts'], sets: 3 },
  { name: 'Single Arm Triceps Pushdown (Cable)', groups: ['triceps'], sets: 3 },
  // 08-21 · Legs & Core B
  { name: 'Calf Press', groups: ['calves'], sets: 3 },
  { name: 'Hanging Knee Raise', groups: ['abdominals'], sets: 3 },
  { name: 'Hip Thrust (Machine)', groups: ['glutes', 'hamstrings', 'quadriceps'], sets: 3 },
  { name: 'Leg Press', groups: ['quadriceps', 'glutes', 'hamstrings'], sets: 2, warmups: 1 },
  { name: 'Romanian Deadlift (DB)', groups: ['hamstrings', 'glutes', 'lower back', 'upper back', 'lats'], sets: 3 },
  { name: 'Seated Leg Curl', groups: ['hamstrings', 'calves'], sets: 2 },
  { name: 'Side Plank', groups: ['obliques', 'abdominals'], sets: 2 },
]

/** The rows exactly as `useWeeklyVolume` shapes them for the accumulator. */
function weekRows(): Array<{ primary: readonly string[]; secondary: readonly string[]; dedupeKey: string }> {
  const rows: Array<{ primary: readonly string[]; secondary: readonly string[]; dedupeKey: string }> = []
  WEEK.forEach((ex, i) => {
    // Warm-ups are sets. Hevy counts them, the draft sheet above counts them,
    // and since this change the weekly accumulator counts them too.
    const total = ex.sets + (ex.warmups ?? 0)
    for (let n = 0; n < total; n++) {
      rows.push({ ...resolveMovers(ex.name, ex.groups), dedupeKey: `${i}-${n}` })
    }
  })
  return rows
}

describe('the WEEK-to-date breakdown, 2026-08-16 → 2026-08-22', () => {
  const byMuscle = Object.fromEntries(
    weeklyVolumeByMuscle(weekRows(), 'cut').map((m) => [m.muscle, m.sets]),
  ) as Record<LandmarkMuscle, number>

  /**
   * Post-fix expectations. Against the pre-fix app these move on exactly three
   * lines and no others: the two Leg Press warm-ups lift Quads/Hamstrings/
   * Glutes/Adductors, `Front delts` stops being discarded, and the Face Pull and
   * the RDL stop paying the upper back.
   */
  const EXPECTED: Record<LandmarkMuscle, number> = {
    Chest: 12,
    Lats: 11.5,
    'Upper back': 8,
    'Lower back': 1.5,
    // The three deltoid lines moved when the fly / row / press secondaries were
    // removed — see `hevy-week-parity.test.ts`. They now sum to 17, which is
    // Hevy's single `Shoulders` bucket for this week to the decimal.
    'Front delts': 7,
    'Side delts': 7,
    'Rear delts': 3,
    Biceps: 17,
    Triceps: 15,
    Forearms: 8.5,
    Quads: 13.5,
    Hamstrings: 14,
    Glutes: 9,
    Adductors: 1.5,
    Calves: 8.5,
    'Abs/core': 11,
  }

  for (const [muscle, want] of Object.entries(EXPECTED) as Array<[LandmarkMuscle, number]>) {
    it(`${muscle} = ${want}`, () => {
      expect(byMuscle[muscle]).toBe(want)
    })
  }

  it('every landmark is asserted', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...LANDMARK_MUSCLES].sort())
  })
})

/**
 * ── WHERE HELIX AND HEVY STILL DISAGREE, ON PURPOSE ──────────────────────────
 *
 * Hevy's own total for this week is 154, and that number IS the sum of its
 * per-muscle lines — the seventeen it prints sum to 139, and the line the report
 * omitted is Triceps at 15. Same unit, same 1.0/0.5 convention, so the two
 * breakdowns are directly comparable and every remaining gap is a real
 * modelling choice rather than an accident.
 */
describe('the lines that must equal Hevy exactly', () => {
  const byMuscle = Object.fromEntries(
    weeklyVolumeByMuscle(weekRows(), 'cut').map((m) => [m.muscle, m.sets]),
  ) as Record<LandmarkMuscle, number>

  const HEVY_EXACT: Partial<Record<LandmarkMuscle, number>> = {
    Chest: 12, Lats: 11.5, 'Upper back': 8, 'Lower back': 1.5,
    Triceps: 15, Calves: 8.5, 'Abs/core': 11,
    Quads: 13.5, Hamstrings: 14, Glutes: 9,
    // Closed by the final dictionary pass: the reverse curl flipped to
    // biceps-primary, and the adductors moved from the leg press to the hip
    // thrust. Eleven of the twelve comparable lines are now exact.
    Forearms: 8.5, Adductors: 1.5,
    // The last line to close: the face pull pays the biceps, which is 0.5 × 3.
    Biceps: 17,
  }

  for (const [muscle, want] of Object.entries(HEVY_EXACT) as Array<[LandmarkMuscle, number]>) {
    it(`${muscle} matches Hevy at ${want}`, () => {
      expect(byMuscle[muscle]).toBe(want)
    })
  }

  /**
   * ── THE LAST LINE TO CLOSE, AND THE ONE THAT WAS ARGUED FOR ────────────────
   * This test used to assert the OPPOSITE: `delts === 21.5`, exceeding Hevy's
   * 17 by four credits described here as "all four are real work; Hevy simply
   * does not tag them". Three of those four were the same mistake wearing three
   * hats — a 0.5 secondary paid to a deltoid head by a movement whose load is
   * chosen for something else (fly → front, row → rear, press → side). The
   * fourth, the crossover, is the fly rule again.
   *
   * The decomposition quoted below was always right, which is what makes it
   * worth keeping: Shoulder Press 3 + Lateral Raise 7 + Face Pull 3 + Chest
   * Press 2.5 + Incline DB 1.5 = 17. That is now what Helix reports, unaided.
   */
  it('matches Hevy’s single Shoulders bucket exactly', () => {
    const delts = byMuscle['Front delts'] + byMuscle['Side delts'] + byMuscle['Rear delts']
    expect(delts).toBe(17)
    expect(delts - 17).toBe(0)
    // The split Hevy cannot report, preserved: 7 front, 7 side, 3 rear.
    expect(byMuscle['Front delts']).toBe(7)
    expect(byMuscle['Side delts']).toBe(7)
    expect(byMuscle['Rear delts']).toBe(3)
  })

  it('leaves NOTHING short — thirteen of thirteen, shoulders included', () => {
    // The face pull was the answer, and it was found by arithmetic before it
    // was confirmed by a definition: the gap was exactly 1.5 = 0.5 × 3 sets,
    // and the face pull was the only three-set movement in the week with elbow
    // flexion under load. Every comparable line now equals Hevy's.
    expect(byMuscle.Biceps).toBe(17)
    const short = (Object.entries(HEVY_EXACT) as Array<[LandmarkMuscle, number]>)
      .filter(([m, want]) => byMuscle[m] !== want)
    expect(short).toEqual([])
    // And the thirteenth: the deltoid, which was the one line still diverging
    // when this file said twelve of twelve.
    expect(byMuscle['Front delts'] + byMuscle['Side delts'] + byMuscle['Rear delts']).toBe(17)
  })
})
