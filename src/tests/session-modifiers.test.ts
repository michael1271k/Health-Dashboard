import { describe, it, expect } from 'vitest'
import {
  cascadeSetEdit, draftTotals, buildCommitPayload,
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

describe('cascadeSetEdit — Hevy-style Set 1 cascade', () => {
  it('cascades Set 1 weight to later sets that still shared its previous value', () => {
    const sets = [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 8 }]
    const out = cascadeSetEdit(sets, 0, { weightKg: 45 })
    expect(out.map((s) => s.weightKg)).toEqual([45, 45, 45])
    expect(out.map((s) => s.reps)).toEqual([10, 10, 8]) // reps untouched
  })

  it('preserves a manually-diverged later set', () => {
    const sets = [{ weightKg: 40, reps: 10 }, { weightKg: 50, reps: 10 }]
    const out = cascadeSetEdit(sets, 0, { weightKg: 45 })
    expect(out.map((s) => s.weightKg)).toEqual([45, 50]) // set 2 kept its own load
  })

  it('does NOT cascade when a non-first set is edited', () => {
    const sets = [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }, { weightKg: 40, reps: 10 }]
    const out = cascadeSetEdit(sets, 1, { weightKg: 60 })
    expect(out.map((s) => s.weightKg)).toEqual([40, 60, 40])
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
