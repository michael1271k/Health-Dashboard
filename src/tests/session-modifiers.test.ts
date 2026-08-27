import { describe, it, expect } from 'vitest'
import {
  cascadeSetEdit, draftTotals, draftVolumeSeries, buildCommitPayload,
  type SessionDraft, type DraftSet,
} from '@/lib/sessions/draft'
import { SaveWorkoutSchema, countCommittedSets } from '@/lib/sessions/schema'

const draftWith = (sets: DraftSet[]): SessionDraft => ({
  splitDay: 'upper',
  date: '2026-07-16',
  notes: '',
  startedAt: '2026-07-16T12:00:00.000Z',
  exercises: [{ localId: 'x', name: 'Chest Press (Machine)', sets }],
})

describe('countCommittedSets — unilateral L/R sub-sets count once', () => {
  it('an L/R split (shared pairId) is ONE set, not two', () => {
    const sets = [
      { pairId: 'p1' }, { pairId: 'p1' },   // one unilateral set (L + R)
      {},                                    // one bilateral set
    ]
    expect(countCommittedSets(sets)).toBe(2)
  })

  it('counts a mix of bilateral rows and multiple L/R pairs correctly', () => {
    const sets = [
      {}, {},                                // 2 bilateral
      { pairId: 'a' }, { pairId: 'a' },      // 1 unilateral
      { pairId: 'b' }, { pairId: 'b' },      // 1 unilateral
    ]
    expect(countCommittedSets(sets)).toBe(4) // was 6 before the fix
  })
})

describe('cascadeSetEdit — one step forward, never the whole tail', () => {
  it('carries a Set 1 edit to Set 2 and stops there', () => {
    const sets = [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 8 }]
    const out = cascadeSetEdit(sets, 0, { weightKg: 45 })
    // Set 3 keeps 40: it has not been performed, and pre-filling it is a claim
    // about work that has not happened — which the ceiling surfaces then read.
    expect(out.map((s) => s.weightKg)).toEqual([45, 45, 40])
    expect(out.map((s) => s.reps)).toEqual([10, 10, 8]) // reps untouched
  })

  it('preserves a manually-diverged later set', () => {
    const sets = [{ weightKg: 40, reps: 10 }, { weightKg: 50, reps: 10 }]
    const out = cascadeSetEdit(sets, 0, { weightKg: 45 })
    expect(out.map((s) => s.weightKg)).toEqual([45, 50]) // set 2 kept its own load
  })

  it('carries a middle-set edit to its immediate successor only', () => {
    const sets = [
      { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 },
      { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 },
    ]
    const out = cascadeSetEdit(sets, 1, { weightKg: 60 })
    expect(out.map((s) => s.weightKg)).toEqual([40, 60, 60, 40])
  })

  it('never cascades a setType (W/F) change', () => {
    const sets = [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }]
    const out = cascadeSetEdit(sets, 0, { setType: 'warmup' })
    expect(out[0].setType).toBe('warmup')
    expect(out[1].setType).toBeUndefined()
  })
})

describe('warmup sets — counted in volume/sets (never a PR)', () => {
  it('draftTotals INCLUDES warmup sets', () => {
    const draft = draftWith([
      { weightKg: 20, reps: 10, setType: 'warmup' },
      { weightKg: 40, reps: 10 },
      { weightKg: 40, reps: 10, setType: 'failure' },
    ])
    const { volumeKg, sets } = draftTotals(draft)
    expect(sets).toBe(3)           // warmup now counts
    expect(volumeKg).toBe(1000)    // 20×10 + 40×10 + 40×10
  })

  it('buildCommitPayload carries setType through and validates', () => {
    const draft = draftWith([
      { weightKg: 20, reps: 10, setType: 'warmup' },
      { weightKg: 40, reps: 10 },
      { weightKg: 40, reps: 8, setType: 'failure' },
    ])
    const body = buildCommitPayload(draft)
    expect(SaveWorkoutSchema.safeParse(body).success).toBe(true)
    // All sets persist (warmup exclusion happens server-side in saveSession).
    expect(body.sets).toHaveLength(3)
    expect(body.sets[0].setType).toBe('warmup')
    expect(body.sets[1].setType).toBeUndefined()
    expect(body.sets[2].setType).toBe('failure')
  })
})

// REGRESSION — the edit-persist "boss fight" (attempt #4). An edit rebuilds its
// draft from the DB's started_at, which PostgREST returns with a numeric offset
// (`…+00:00`), NOT a `Z`. z.string().datetime() rejects offsets → the edit POST
// 422'd → the client's stall-recovery found the still-present old session by the
// reused client_session_id and reported a false "duplicate" success → the edit
// silently no-op'd. Schema must accept offset datetimes so edits persist.
describe('SaveWorkoutSchema — accepts DB round-trip (offset) datetimes [edit-persist]', () => {
  const base = {
    splitDay: 'upper',
    sets: [{ exerciseName: 'Single-Arm Lateral Raise', setNumber: 1, weightKg: 10, reps: 12 }],
  } as const

  it('accepts a Supabase timestamptz string with +00:00 offset (the edit case)', () => {
    const body = { ...base, startedAt: '2026-07-21T11:00:58.594+00:00', endedAt: '2026-07-21T12:00:58.594+00:00' }
    const r = SaveWorkoutSchema.safeParse(body)
    expect(r.success).toBe(true)
  })

  it('still accepts a fresh Z-suffixed instant (the normal-log case)', () => {
    const body = { ...base, startedAt: '2026-07-21T11:00:58.594Z', endedAt: '2026-07-21T12:00:58.594Z' }
    expect(SaveWorkoutSchema.safeParse(body).success).toBe(true)
  })
})

describe('draftVolumeSeries — the Live Activity sparkline', () => {
  it('is cumulative, and its last point IS the total on the card', () => {
    const draft = draftWith([
      { weightKg: 40, reps: 10 },
      { weightKg: 40, reps: 10 },
      { weightKg: 50, reps: 8 },
    ])
    const series = draftVolumeSeries(draft)
    expect(series).toEqual([400, 800, 1200])
    // The chart's right edge and the figure printed beside it are the same
    // number, or the card contradicts itself.
    expect(series[series.length - 1]).toBe(Math.round(draftTotals(draft).volumeKg))
  })

  it('collapses an L/R pair the way the total does', () => {
    // The pair is scored at the WEAKER side and counts once. A running
    // `total += weight * reps` would count both rows and diverge from the
    // headline by the stronger side's tonnage — on every split set.
    const draft = draftWith([
      { weightKg: 20, reps: 10, side: 'R', pairId: 'p1' },
      { weightKg: 18, reps: 10, side: 'L', pairId: 'p1' },
    ])
    expect(draftVolumeSeries(draft, 12).at(-1)).toBe(Math.round(draftTotals(draft).volumeKg))
  })

  it('draws nothing below two points', () => {
    // One dot on an empty rect reads as a failure to render, not as set one.
    expect(draftVolumeSeries(draftWith([{ weightKg: 40, reps: 10 }]))).toEqual([])
    expect(draftVolumeSeries(draftWith([]))).toEqual([])
  })

  it('samples across the WHOLE session rather than keeping the tail', () => {
    const sets = Array.from({ length: 40 }, () => ({ weightKg: 10, reps: 10 }))
    const series = draftVolumeSeries(draftWith(sets), 12)
    expect(series).toHaveLength(12)
    // Both endpoints kept. Truncating to the last 12 would redraw the shape as
    // the session grew, so the chart would flatten exactly as work piled up.
    expect(series[0]).toBe(100)
    expect(series.at(-1)).toBe(4000)
    // Monotonic, because cumulative tonnage cannot go down.
    expect([...series].sort((a, b) => a - b)).toEqual(series)
  })
})
