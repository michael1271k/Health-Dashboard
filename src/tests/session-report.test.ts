import { describe, it, expect } from 'vitest'
import { toRows } from '@/components/session-detail/ExerciseBreakdown'
import { highlightsOf, strongestOf } from '@/components/session-detail/SessionHighlights'
import type { DetailSet, DetailExercise } from '@/lib/hooks/useSessionDetail'

const set = (o: Partial<DetailSet> & Pick<DetailSet, 'setNumber' | 'weightKg' | 'reps'>): DetailSet => ({
  rpe: null, isPr: false, est1rmKg: null, setType: 'normal', side: null, pairId: null, prAxes: [],
  ...o,
})

const ex = (o: Partial<DetailExercise> & Pick<DetailExercise, 'name' | 'sets'>): DetailExercise => ({
  exerciseId: o.name, order: 0, muscleGroups: ['Legs'], isCompound: true,
  workingSets: o.sets.filter((s) => s.setType !== 'warmup').length,
  topKg: 0, volumeKg: 0, bestEst1rm: null, prAxes: [], ...o,
})

describe('toRows — set numbering in the ledger', () => {
  it('does NOT let a warm-up consume a set number', () => {
    // Leg Press 2026-07-31: 60×15 warm-up, then the two working sets. The
    // header says "2/2 @ 12 reps", so the rows have to read 1 and 2 — numbering
    // the warm-up as Set 1 made the ceiling count look off by one.
    const rows = toRows([
      set({ setNumber: 1, weightKg: 60, reps: 15, setType: 'warmup' }),
      set({ setNumber: 2, weightKg: 72.5, reps: 13 }),
      set({ setNumber: 3, weightKg: 72.5, reps: 12, setType: 'failure' }),
    ])
    expect(rows.map((r) => r.num)).toEqual([null, 1, 2])
  })

  it('collapses a unilateral L/R pair into one numbered row', () => {
    const rows = toRows([
      set({ setNumber: 1, weightKg: 5, reps: 15, pairId: 'p1', side: 'L' }),
      set({ setNumber: 1, weightKg: 5, reps: 15, pairId: 'p1', side: 'R' }),
      set({ setNumber: 2, weightKg: 5, reps: 14, pairId: 'p2', side: 'L' }),
      set({ setNumber: 2, weightKg: 5, reps: 13, pairId: 'p2', side: 'R' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.num)).toEqual([1, 2])
    expect(rows[0].kind).toBe('pair')
  })

  it('keeps sides on the right slots regardless of log order', () => {
    const rows = toRows([
      set({ setNumber: 1, weightKg: 5, reps: 12, pairId: 'p1', side: 'R' }),
      set({ setNumber: 1, weightKg: 5, reps: 11, pairId: 'p1', side: 'L' }),
    ])
    const pair = rows[0] as Extract<ReturnType<typeof toRows>[number], { kind: 'pair' }>
    expect(pair.right?.reps).toBe(12)
    expect(pair.left?.reps).toBe(11)
  })
})

describe('highlightsOf — one line per record, at the top of the report', () => {
  const kg = (v: number) => v
  const july31 = [
    ex({
      name: 'Romanian Deadlift (DB)',
      sets: [
        set({ setNumber: 1, weightKg: 35, reps: 12 }),
        set({ setNumber: 2, weightKg: 35, reps: 12 }),
        set({ setNumber: 3, weightKg: 35, reps: 12, isPr: true, prAxes: ['volume'] }),
      ],
      bestEst1rm: 49,
    }),
    ex({
      name: 'Hip Thrust (Machine)',
      sets: [
        set({ setNumber: 1, weightKg: 25, reps: 14 }),
        set({ setNumber: 2, weightKg: 27.5, reps: 13, isPr: true, prAxes: ['reps'] }),
        set({ setNumber: 3, weightKg: 27.5, reps: 13 }),
      ],
      bestEst1rm: 39.4,
    }),
    ex({
      name: 'Leg Press',
      sets: [set({ setNumber: 1, weightKg: 72.5, reps: 13 })],
      bestEst1rm: 103.9,
    }),
  ]

  it('lists the record and the set that won it', () => {
    const h = highlightsOf(july31, kg, 'kg')
    expect(h.map((x) => x.name)).toEqual(['Romanian Deadlift (DB)', 'Hip Thrust (Machine)'])
    expect(h[1]).toEqual({ name: 'Hip Thrust (Machine)', axes: ['Reps'], detail: '27.5kg × 13' })
  })

  it('gives ONE line per exercise even when two sets are flagged', () => {
    const e = ex({
      name: 'Cable Lateral Raise',
      sets: [
        set({ setNumber: 1, weightKg: 5, reps: 15, isPr: true, prAxes: ['reps'] }),
        set({ setNumber: 2, weightKg: 6.25, reps: 12, isPr: true, prAxes: ['weight', 'reps'] }),
      ],
    })
    const h = highlightsOf([e], kg, 'kg')
    expect(h).toHaveLength(1)
    // The set carrying the most axes leads.
    expect(h[0].axes).toEqual(['Weight', 'Reps'])
    expect(h[0].detail).toBe('6.25kg × 12')
  })

  it('reads a timed hold in seconds, not kilos', () => {
    const plank = ex({
      name: 'Side Plank',
      sets: [set({ setNumber: 1, weightKg: 0, reps: 58, isPr: true, prAxes: ['reps'] })],
    })
    const h = highlightsOf([plank], kg, 'kg')
    expect(h[0]).toEqual({ name: 'Side Plank', axes: ['Duration'], detail: '58 sec' })
  })

  it('is empty when nothing was set — the panel renders nothing', () => {
    expect(highlightsOf([ex({ name: 'Calf Press', sets: [set({ setNumber: 1, weightKg: 67.5, reps: 15 })] })], kg, 'kg'))
      .toEqual([])
  })

  it('survives a set restored from a cache written before prAxes existed', () => {
    // The persisted localStorage query cache is JSON of an OLDER DetailSet
    // shape. `undefined is not an object (evaluating 'r.prAxes.length')` took
    // down the whole report via the error boundary. The trophy still renders;
    // only the axis chips are unavailable.
    const stale = { setNumber: 1, weightKg: 40, reps: 10, rpe: null, isPr: true, est1rmKg: 53.3, setType: 'normal', side: null, pairId: null } as unknown as DetailSet
    const e = { ...ex({ name: 'Lat Pulldown', sets: [stale] }), prAxes: undefined } as unknown as DetailExercise
    expect(() => highlightsOf([e], kg, 'kg')).not.toThrow()
    expect(highlightsOf([e], kg, 'kg')[0]).toEqual({ name: 'Lat Pulldown', axes: [], detail: '40kg × 10' })
  })

  it('picks the strongest lift by est-1RM, ignoring zero-weight holds', () => {
    expect(strongestOf(july31)?.name).toBe('Leg Press')
    expect(strongestOf([ex({ name: 'Side Plank', sets: [], bestEst1rm: 0 })])).toBeNull()
  })
})
