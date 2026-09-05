import { describe, it, expect } from 'vitest'
import { PROGRAMS } from '@/lib/programs'
import { buildTemplateDraft, type ExerciseHistoryEntry } from '@/lib/sessions/templateDraft'
import { workingSets, type ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import { routineMemoryMap } from '@/lib/hooks/useLogger'
import { countCommittedSets } from '@/lib/sessions/schema'

const legsB = PROGRAMS.onyx5.days.find((d) => d.key === 'legs_b')!

/**
 * Routine-scoped memory. The bug: the logger keyed "previous" on the exercise
 * ALONE, so Seated Leg Curl on Legs A and Legs B shared one memory — a 3-set day
 * seeded from a 2-set day and the coach paced you against the wrong session.
 */
describe('workingSets — warm-ups seed but never form a baseline', () => {
  const h: ExerciseHistory = {
    date: '2026-07-31',
    sets: [
      { weightKg: 60, reps: 15, setType: 'warmup' },
      { weightKg: 72.5, reps: 13 },
      { weightKg: 72.5, reps: 12, setType: 'failure' },
    ],
  }

  it('drops warm-ups and keeps everything else', () => {
    expect(workingSets(h)).toEqual([
      { weightKg: 72.5, reps: 13 },
      { weightKg: 72.5, reps: 12, setType: 'failure' },
    ])
  })

  it('keeps the top load honest — a warm-up must not set the PREV chip', () => {
    const top = Math.max(...workingSets(h).map((s) => s.weightKg))
    expect(top).toBe(72.5)
    // …whereas the raw payload would have reported the 60 kg warm-up as a set.
    expect(h.sets.some((s) => s.weightKg === 60)).toBe(true)
  })

  it('survives undefined and a malformed payload without throwing', () => {
    expect(workingSets(undefined)).toEqual([])
    expect(workingSets({ date: 'x', sets: undefined as never })).toEqual([])
  })
})

describe('seedFromHistory reproduces ALL tags, not just failure', () => {
  it('round-trips warmup / failure / dropset into the draft', () => {
    const history = new Map<string, ExerciseHistoryEntry>([
      ['Leg Press', {
        date: '2026-07-31',
        sets: [
          { weightKg: 60, reps: 15, setType: 'warmup' },
          { weightKg: 72.5, reps: 13 },
          { weightKg: 72.5, reps: 12, setType: 'failure' },
        ],
      }],
    ])
    const d = buildTemplateDraft(legsB, '2026-08-07', history)
    const press = d.exercises.find((e) => e.name === 'Leg Press')!
    expect(press.sets).toEqual([
      { weightKg: 60, reps: 15, setType: 'warmup', done: false },
      { weightKg: 72.5, reps: 13, done: false },
      { weightKg: 72.5, reps: 12, setType: 'failure', done: false },
    ])
    expect(press.seededFrom).toBe('2026-07-31')
  })

  it('reproduces the SET COUNT exactly — 2 sets last time means 2 sets today', () => {
    const history = new Map<string, ExerciseHistoryEntry>([
      ['Seated Leg Curl', { date: '2026-07-31', sets: [{ weightKg: 45, reps: 15 }, { weightKg: 45, reps: 13 }] }],
    ])
    const d = buildTemplateDraft(legsB, '2026-08-07', history)
    const curl = d.exercises.find((e) => e.name === 'Seated Leg Curl')!
    expect(curl.sets).toHaveLength(2)
  })

  it('every seeded set opens UNCHECKED — a template is a plan, not a log', () => {
    const d = buildTemplateDraft(legsB, '2026-08-07')
    for (const ex of d.exercises) for (const s of ex.sets) expect(s.done).toBe(false)
  })
})

/**
 * THE GHOST SET.
 *
 * A unilateral set is TWO rows in `workout_sets` sharing a pair_id, and the deck
 * folds them back into ONE numbered set. `seedFromHistory` copied weight, reps
 * and tag and dropped side/pairId, so both rows returned as ordinary independent
 * sets and last week's pair silently became two sets this week.
 *
 * The reported case: 2026-08-06 `cb_b` logged Single Arm Triceps Pushdown as 2
 * physical sets — set 1 solo, set 2 split L/R — which is 3 rows. The Aug 13 deck
 * opened with 3 separate sets, and the third was committed.
 */
describe('seedFromHistory rebuilds unilateral PAIRS, never two loose sets', () => {
  const seedCurl = (sets: ExerciseHistoryEntry['sets']) => {
    const history = new Map<string, ExerciseHistoryEntry>([
      ['Seated Leg Curl', { date: '2026-08-06', sets }],
    ])
    return buildTemplateDraft(legsB, '2026-08-13', history)
      .exercises.find((e) => e.name === 'Seated Leg Curl')!
  }

  /** The production definition of "how many sets is this" — pairs count once. */
  const physicalSets = (sets: Array<{ pairId?: string }>) => countCommittedSets(sets)

  it('a solo set plus one L/R pair seeds as TWO sets, not three', () => {
    const curl = seedCurl([
      { weightKg: 6.25, reps: 15 },
      { weightKg: 6.25, reps: 15, side: 'L', pairId: 'pair_aug06' },
      { weightKg: 6.25, reps: 13, side: 'R', pairId: 'pair_aug06', setType: 'failure' },
    ])
    expect(curl.sets).toHaveLength(3)        // still three ROWS…
    expect(physicalSets(curl.sets)).toBe(2)  // …but two SETS
  })

  it('keeps both sides, their own tags, and one shared pairId', () => {
    const curl = seedCurl([
      { weightKg: 6.25, reps: 15, side: 'L', pairId: 'pair_aug06' },
      { weightKg: 6.25, reps: 13, side: 'R', pairId: 'pair_aug06', setType: 'failure' },
    ])
    const [left, right] = curl.sets
    expect(left.side).toBe('L')
    expect(right.side).toBe('R')
    expect(left.pairId).toBe(right.pairId)
    expect(left.pairId).toBeTruthy()
    // The failure tag is PER SIDE and must not migrate to the other arm.
    expect(left.setType).toBeUndefined()
    expect(right.setType).toBe('failure')
  })

  it('regenerates the pairId — this week is not last week', () => {
    const curl = seedCurl([
      { weightKg: 6.25, reps: 15, side: 'L', pairId: 'pair_aug06' },
      { weightKg: 6.25, reps: 15, side: 'R', pairId: 'pair_aug06' },
    ])
    expect(curl.sets[0].pairId).not.toBe('pair_aug06')
  })

  it('reproduces an ASYMMETRIC pair side for side', () => {
    // The sides are independent — there is no `linked` flag to mirror them, so
    // a weaker arm survives the round trip as a weaker arm.
    const curl = seedCurl([
      { weightKg: 6.25, reps: 15, side: 'L', pairId: 'p' },
      { weightKg: 5.0, reps: 13, side: 'R', pairId: 'p' },
    ])
    expect(curl.sets.map((s) => [s.side, s.weightKg, s.reps])).toEqual([
      ['L', 6.25, 15],
      ['R', 5.0, 13],
    ])
  })

  it('leaves a side with no pairId (or a pairId with no side) as an ordinary set', () => {
    const curl = seedCurl([
      { weightKg: 6.25, reps: 15, side: 'L' },
      { weightKg: 6.25, reps: 15, pairId: 'p' },
    ])
    expect(physicalSets(curl.sets)).toBe(2)
    expect(curl.sets.every((s) => s.pairId === undefined)).toBe(true)
  })

  it('still opens every side unchecked', () => {
    const curl = seedCurl([
      { weightKg: 6.25, reps: 15, side: 'L', pairId: 'p' },
      { weightKg: 6.25, reps: 15, side: 'R', pairId: 'p' },
    ])
    expect(curl.sets.every((s) => s.done === false)).toBe(true)
  })
})

describe('routineMemoryMap — the same lift on two days keeps two memories', () => {
  const rows: Array<[string, { weightKg: number; reps: number }]> = [
    ['legs_a|curl-uuid', { weightKg: 40, reps: 12 }],
    ['legs_b|curl-uuid', { weightKg: 45, reps: 15 }],
  ]

  it('keys on `${dayKey}|${exerciseId}`, so the two never collide', () => {
    const m = routineMemoryMap(rows)
    expect(m.get('legs_a|curl-uuid')).toEqual({ weightKg: 40, reps: 12 })
    expect(m.get('legs_b|curl-uuid')).toEqual({ weightKg: 45, reps: 15 })
  })

  it('is JSON-safe: tuples survive the persisted-cache round-trip', () => {
    const restored = JSON.parse(JSON.stringify(rows)) as typeof rows
    expect(routineMemoryMap(restored).get('legs_b|curl-uuid')).toEqual({ weightKg: 45, reps: 15 })
  })

  it('tolerates undefined and a legacy blob where a Map serialized to {}', () => {
    expect(routineMemoryMap(undefined).size).toBe(0)
    const legacy = JSON.parse(JSON.stringify(new Map(rows))) as unknown as typeof rows
    expect(legacy).toEqual({})
    expect(() => routineMemoryMap(legacy)).not.toThrow()
    expect(routineMemoryMap(legacy).size).toBe(0)
  })
})
