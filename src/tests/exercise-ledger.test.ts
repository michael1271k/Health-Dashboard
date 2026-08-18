import { describe, it, expect } from 'vitest'
import { groupLedgerRows, type LedgerRow } from '@/lib/hooks/useExerciseSetLedger'

const session = (id: string, date: string, dayKey: string | null = 'upper_a') => ({
  id, started_at: `${date}T09:00:00Z`, day_key: dayKey, split_day: 'upper',
})

const row = (over: Partial<LedgerRow> & { session: LedgerRow['workout_sessions'] }): LedgerRow => ({
  weight_kg: 30, reps: 10, rpe: null, set_number: 1,
  set_type: null, side: null, pair_id: null,
  ...over,
  workout_sessions: over.session,
})

describe('groupLedgerRows', () => {
  it('orders sets by set_number, not by the order rows arrive', () => {
    const s = session('a', '2026-08-12')
    // Batch-inserted rows share a created_at, so PostgREST hands them back in an
    // undefined order — this is the exact shape that once rendered 11, 12, 12.
    const out = groupLedgerRows([
      row({ session: s, set_number: 3, reps: 8 }),
      row({ session: s, set_number: 1, reps: 12 }),
      row({ session: s, set_number: 2, reps: 10 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].sets.map((x) => x.reps)).toEqual([12, 10, 8])
    expect(out[0].sets.map((x) => x.workingNum)).toEqual([1, 2, 3])
  })

  it('warm-ups keep their place but consume no set number', () => {
    const s = session('a', '2026-08-12')
    const out = groupLedgerRows([
      row({ session: s, set_number: 1, weight_kg: 20, reps: 12, set_type: 'warmup' }),
      row({ session: s, set_number: 2, weight_kg: 30, reps: 10 }),
      row({ session: s, set_number: 3, weight_kg: 30, reps: 9 }),
    ])
    expect(out[0].sets.map((x) => x.workingNum)).toEqual([null, 1, 2])
    expect(out[0].workingSets).toBe(2)
  })

  it('a unilateral pair is ONE set of work, scored at the weaker side', () => {
    const s = session('a', '2026-08-12')
    const out = groupLedgerRows([
      row({ session: s, set_number: 1, weight_kg: 20, reps: 10, side: 'L', pair_id: 'p1' }),
      row({ session: s, set_number: 2, weight_kg: 20, reps: 8, side: 'R', pair_id: 'p1' }),
    ])
    expect(out[0].workingSets).toBe(1)
    expect(out[0].sets.map((x) => x.workingNum)).toEqual([1, 1])
    // Not 20×10 + 20×8 = 360, and not the doubled 320 either. One set of work,
    // at the weaker side: 20 × 8.
    expect(out[0].volumeKg).toBe(160)
  })

  it('warm-ups earn no tonnage', () => {
    const s = session('a', '2026-08-12')
    const out = groupLedgerRows([
      row({ session: s, set_number: 1, weight_kg: 20, reps: 10, set_type: 'warmup' }),
      row({ session: s, set_number: 2, weight_kg: 40, reps: 10 }),
    ])
    expect(out[0].volumeKg).toBe(400)
  })

  it('splits rows into sessions and returns them newest first', () => {
    const out = groupLedgerRows([
      row({ session: session('new', '2026-08-12'), set_number: 1 }),
      row({ session: session('old', '2026-07-29'), set_number: 1 }),
      row({ session: session('mid', '2026-08-05'), set_number: 1 }),
    ])
    expect(out.map((x) => x.date)).toEqual(['2026-08-12', '2026-08-05', '2026-07-29'])
  })

  it('honours the session cap', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ session: session(`s${i}`, `2026-08-0${i + 1}`), set_number: 1 }))
    expect(groupLedgerRows(rows, 3)).toHaveLength(3)
  })

  it('names the workout from day_key, never the weekday', () => {
    // A swapped session lands on a different weekday and is still its own day.
    const out = groupLedgerRows([row({ session: session('a', '2026-08-12', 'upper_a'), set_number: 1 })])
    expect(out[0].label).not.toBe('Session')
    expect(out[0].label.toLowerCase()).toContain('upper')
  })

  it('falls back to split_day when day_key is null (legacy rows)', () => {
    const out = groupLedgerRows([row({ session: session('a', '2026-08-12', null), set_number: 1 })])
    expect(out[0].label).toBe('Upper')
  })

  it('coerces an RPE that arrives as a string', () => {
    const out = groupLedgerRows([row({ session: session('a', '2026-08-12'), set_number: 1, rpe: '8.5' })])
    expect(out[0].sets[0].rpe).toBe(8.5)
  })

  it('ignores a set_type the app does not know', () => {
    const out = groupLedgerRows([row({ session: session('a', '2026-08-12'), set_number: 1, set_type: 'myoreps' })])
    expect(out[0].sets[0].setType).toBeNull()
  })

  it('is safe on no rows', () => {
    expect(groupLedgerRows([])).toEqual([])
  })
})
