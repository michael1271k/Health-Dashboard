import { describe, it, expect } from 'vitest'
import { draftMuscleSets, draftPhysicalSets } from '@/components/command-center/MuscleDistribution'
import type { LandmarkMuscle } from '@/lib/training/landmarks'
import type { SessionDraft, DraftSet } from '@/lib/sessions/draft'

/**
 * ── THE WHOLE WEEK, AGAINST HEVY, LINE FOR LINE ──────────────────────────────
 *
 * `hevy-parity.test.ts` pins two SESSIONS. This pins a WEEK — all five training
 * days of 2026-08-17 → 08-23, read straight out of `workout_sets`, against the
 * Muscle Focus numbers Hevy reported for the same five workouts.
 *
 * It exists because the single-session tests could not have caught what this
 * one was written to fix. Every remaining divergence lived in the deltoids, and
 * a deltoid credit of 0.5 x 2 sets is invisible in one session (it reads as a
 * defensible judgement call about anatomy) and unmistakable across five (the
 * same credit, the same size, on three different days, always in the same
 * direction). Three dictionary lines were wrong:
 *
 *   · flies (pec deck, crossover) credited `front_delts`
 *   · rows credited `rear_delts`
 *   · shoulder press credited `side_delts`
 *
 * See `muscleMap.ts` for the argument on each. All three are now removed, and
 * these five sessions agree with Hevy on EVERY line, to the decimal.
 *
 * ── HOW TO READ THE SHOULDER ASSERTIONS ──────────────────────────────────────
 * Hevy has ONE `Shoulders` bucket. Helix splits the deltoid into three
 * landmarks on purpose (see `toLandmarkMuscle`), so the comparable quantity is
 * their SUM — asserted here as `Shoulders`, alongside the per-head split, which
 * is the thing Helix knows and Hevy does not.
 *
 * ── AND THE TWO PLACES HEVY'S TAXONOMY SIMPLY DIFFERS ────────────────────────
 *   · `Traps` is its own Hevy bucket; Helix folds traps into `Upper back`,
 *     where a row's own primary already dominates them under the max-per-set
 *     dedupe. Hevy's Upper Back line is the one to compare, and it agrees.
 *   · `Cardio` is a Hevy muscle. In Helix cardio lives in `cardio_logs` and is
 *     not lifting volume at all, so Hevy's `Cardio 1` on four of these days has
 *     no counterpart here by design.
 */

type Ex = {
  name: string
  /** Physical rows in `workout_sets`, warm-ups and both sides included. */
  sets: number
  warmups?: number
  /** How many L/R PAIRS lead the list — 2 pairs = the first 4 rows. */
  pairs?: number
}

interface Day {
  date: string
  dayKey: string
  label: string
  /** Physical rows, which is what Hevy's own set count shows. */
  physical: number
  /** Hevy's Muscle Focus, `Shoulders` being its single deltoid bucket. */
  hevy: Partial<Record<LandmarkMuscle | 'Shoulders', number>>
  ex: Ex[]
}

const WEEK: Day[] = [
  {
    date: '2026-08-17', dayKey: 'legs_a', label: 'Legs & Core A', physical: 21,
    hevy: { Quads: 9, 'Abs/core': 6, Hamstrings: 6, Calves: 4.5, Glutes: 3 },
    ex: [
      { name: 'Leg Press', sets: 4, warmups: 1 },
      { name: 'Hack Squat', sets: 2 },
      { name: 'Leg Extension', sets: 3 },
      { name: 'Seated Leg Curl', sets: 3 },
      { name: 'Calf Press', sets: 3 },
      { name: 'Crunch Machine', sets: 3 },
      { name: 'Reverse Crunch', sets: 3 },
    ],
  },
  {
    date: '2026-08-18', dayKey: 'arms', label: 'Delts & Arms', physical: 20,
    hevy: { Biceps: 8, Shoulders: 7, Triceps: 6.5, Forearms: 2.5 },
    ex: [
      { name: 'DB Shoulder Press', sets: 3 },
      { name: 'Single Arm Lateral Raise (Cable)', sets: 6, pairs: 2 },
      { name: 'DB Hammer Curl', sets: 3 },
      { name: 'Seated Incline DB Curl', sets: 3 },
      { name: 'Reverse EZ-Bar Curl', sets: 2 },
      { name: 'Cable Overhead Extension', sets: 3 },
      { name: 'Rope Triceps Pushdown', sets: 2 },
    ],
  },
  {
    date: '2026-08-20', dayKey: 'cb_b', label: 'Upper B', physical: 18,
    hevy: { Biceps: 5, Chest: 5, Shoulders: 4.5, Triceps: 4.5, Lats: 3, 'Upper back': 3, Forearms: 2 },
    ex: [
      { name: 'Chest Press (Machine)', sets: 3 },
      { name: 'Neutral-Grip Lat Pulldown', sets: 2 },
      { name: 'Seated Cable Row (Wide Grip)', sets: 2 },
      { name: 'Single Arm Cable Crossover', sets: 2 },
      { name: 'Preacher Curl (Machine)', sets: 3 },
      { name: 'Single Arm Lateral Raise (Cable)', sets: 4, pairs: 1 },
      { name: 'Single Arm Triceps Pushdown (Cable)', sets: 6, pairs: 3 },
    ],
  },
  {
    date: '2026-08-21', dayKey: 'legs_b', label: 'Legs & Core B', physical: 19,
    hevy: {
      Hamstrings: 8, Glutes: 6, 'Abs/core': 5, Quads: 4.5, Calves: 4,
      Forearms: 1.5, Adductors: 1.5, Lats: 1.5, 'Lower back': 1.5, 'Upper back': 1.5,
    },
    ex: [
      { name: 'Romanian Deadlift (DB)', sets: 3 },
      { name: 'Hip Thrust (Machine)', sets: 3 },
      { name: 'Leg Press', sets: 3, warmups: 1 },
      { name: 'Calf Press', sets: 3 },
      { name: 'Seated Leg Curl', sets: 2 },
      { name: 'Hanging Knee Raise', sets: 3 },
      { name: 'Side Plank', sets: 2 },
    ],
  },
  {
    date: '2026-08-23', dayKey: 'cb_a', label: 'Upper A', physical: 18,
    hevy: { Chest: 7, Lats: 7, Shoulders: 5.5, Biceps: 4, Triceps: 4, 'Upper back': 3.5, Forearms: 2.5 },
    ex: [
      { name: 'Incline DB Press', sets: 3 },
      { name: 'Chest Press (Machine)', sets: 2 },
      { name: 'Pec Deck', sets: 2 },
      { name: 'Lat Pulldown', sets: 3 },
      { name: 'Seated Cable Row (V-Grip)', sets: 2 },
      { name: 'Straight-Arm Pulldown', sets: 3 },
      { name: 'Face Pull', sets: 3 },
    ],
  },
]

/**
 * No `muscleGroups` is passed on any exercise, deliberately. The DB column is a
 * cache seeded from `muscleMap` and has drifted; if a name here ever stops
 * resolving in the dictionary, `resolveMovers` must NOT be able to paper over
 * it with the stored tags — the line should go to zero and the test should say
 * so.
 */
function build(d: Day): SessionDraft {
  return {
    date: d.date, dayKey: d.dayKey, splitDay: d.label, notes: '',
    exercises: d.ex.map((ex, i) => {
      const paired = (ex.pairs ?? 0) * 2
      return {
        localId: `ex${i}`,
        name: ex.name,
        kind: 'lift' as const,
        sets: Array.from({ length: ex.sets }, (_, n): DraftSet => ({
          weightKg: 40, reps: 10, done: true,
          ...(n < paired
            ? { side: (n % 2 === 0 ? 'L' : 'R') as 'L' | 'R', pairId: `p${i}_${Math.floor(n / 2)}` }
            : {}),
          ...(n < (ex.warmups ?? 0) ? { setType: 'warmup' as const } : {}),
        } as DraftSet)),
      }
    }),
  } as unknown as SessionDraft
}

const round1 = (n: number) => Math.round(n * 10) / 10

describe.each(WEEK)('$label · $date against Hevy', (day) => {
  const actual = draftMuscleSets(build(day))
  const shoulders = round1(
    (actual['Front delts'] ?? 0) + (actual['Side delts'] ?? 0) + (actual['Rear delts'] ?? 0),
  )

  for (const [muscle, want] of Object.entries(day.hevy) as Array<[LandmarkMuscle | 'Shoulders', number]>) {
    it(`${muscle} = ${want}`, () => {
      const got = muscle === 'Shoulders' ? shoulders : round1(actual[muscle as LandmarkMuscle] ?? 0)
      expect(got).toBe(want)
    })
  }

  it(`counts ${day.physical} physical sets, warm-ups and both sides included`, () => {
    expect(draftPhysicalSets(build(day))).toBe(day.physical)
  })

  /**
   * The other half of parity, and the half a per-line check cannot do: a line
   * Hevy never reported must be ZERO, not merely unasserted. Every gap this
   * file was written to close was a muscle Helix credited and Hevy did not.
   */
  it('credits no muscle Hevy left off the sheet', () => {
    const deltHeads = new Set(['Front delts', 'Side delts', 'Rear delts'])
    const extra = (Object.entries(actual) as Array<[LandmarkMuscle, number]>)
      .filter(([m, n]) => n > 0 && !(m in day.hevy) && !deltHeads.has(m))
      .map(([m, n]) => `${m}=${round1(n)}`)
      .sort()
    expect(extra).toEqual([])
  })
})

/**
 * ── THE THREE REMOVED CREDITS, EACH ON ITS OWN ───────────────────────────────
 * The week-level tests above say the totals are right. These say WHY, so that a
 * future edit that re-adds one of them fails with the reason attached rather
 * than with an arithmetic mismatch someone has to re-derive.
 */
describe('the three deltoid credits that were wrong', () => {
  const setsOf = (name: string, n: number) => build({
    date: '2026-01-01', dayKey: 'x', label: 'x', physical: n, hevy: {},
    ex: [{ name, sets: n }],
  })

  it('a fly is chest and nothing else — no front delt', () => {
    for (const name of ['Pec Deck', 'Single Arm Cable Crossover', 'Cable Fly']) {
      const a = draftMuscleSets(setsOf(name, 2))
      expect(a.Chest).toBe(2)
      expect(a['Front delts'] ?? 0).toBe(0)
    }
  })

  it('a row is back work — no rear delt, on either grip', () => {
    for (const name of ['Seated Cable Row (Wide Grip)', 'Seated Cable Row (V-Grip)']) {
      const a = draftMuscleSets(setsOf(name, 2))
      expect(a['Upper back']).toBe(2)
      expect(a['Rear delts'] ?? 0).toBe(0)
    }
  })

  it('a shoulder press is front delts + triceps — no side delt', () => {
    const a = draftMuscleSets(setsOf('DB Shoulder Press', 3))
    expect(a['Front delts']).toBe(3)
    expect(a.Triceps).toBe(1.5)
    expect(a['Side delts'] ?? 0).toBe(0)
  })

  /**
   * The counterweight. Removing three credits must not turn into removing the
   * deltoid: a face pull is still rear-delt PRIMARY, a lateral raise is still
   * side-delt primary, and a press still lands on the front delt. That is where
   * shoulder volume is supposed to come from.
   */
  it('leaves the movements that DO train each head intact', () => {
    expect(draftMuscleSets(setsOf('Face Pull', 3))['Rear delts']).toBe(3)
    expect(draftMuscleSets(setsOf('Single Arm Lateral Raise (Cable)', 3))['Side delts']).toBe(3)
    expect(draftMuscleSets(setsOf('Incline DB Press', 3))['Front delts']).toBe(1.5)
  })
})
