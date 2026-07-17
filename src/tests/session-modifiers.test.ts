import { describe, it, expect } from 'vitest'
import {
  cascadeSetEdit, draftTotals, buildCommitPayload,
  type SessionDraft, type DraftSet,
} from '@/lib/sessions/draft'
import { SaveWorkoutSchema } from '@/lib/sessions/schema'

const draftWith = (sets: DraftSet[]): SessionDraft => ({
  splitDay: 'upper',
  date: '2026-07-16',
  notes: '',
  startedAt: '2026-07-16T12:00:00.000Z',
  exercises: [{ localId: 'x', name: 'Chest Press (Machine)', sets }],
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

describe('warmup sets — excluded from volume/sets', () => {
  it('draftTotals ignores warmup sets', () => {
    const draft = draftWith([
      { weightKg: 20, reps: 10, setType: 'warmup' },
      { weightKg: 40, reps: 10 },
      { weightKg: 40, reps: 10, setType: 'failure' },
    ])
    const { volumeKg, sets } = draftTotals(draft)
    expect(sets).toBe(2)          // warmup not counted
    expect(volumeKg).toBe(800)    // 40×10 + 40×10; failure still counts
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
