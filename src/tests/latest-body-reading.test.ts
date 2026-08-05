import { describe, it, expect } from 'vitest'
import { reduceLatest, CARRY_FIELDS } from '@/lib/hooks/useLatestBodyReading'

/**
 * Built from the real July rows. 07-20 has a weight and a body fat but NO
 * muscle % — the exact shape that makes row-wise carry-forward wrong.
 */
const ROWS = [
  { date: '2026-07-20', weight_kg: 65.3, body_fat_pct: 18.0, muscle_percent: null, water_percent: null },
  { date: '2026-07-19', weight_kg: 65.3, body_fat_pct: 18.0, muscle_percent: 77.6, water_percent: 57.1 },
  { date: '2026-07-18', weight_kg: 65.2, body_fat_pct: 17.8, muscle_percent: 77.9, water_percent: 57.2 },
]

describe('reduceLatest — carry-forward, field by field', () => {
  it('takes each field from the newest row that HAS it, not from one row', () => {
    const r = reduceLatest(ROWS)
    expect(r.values.weight_kg).toBe(65.3)
    expect(r.dates.weight_kg).toBe('2026-07-20')
    // 07-20 has no muscle %, so this must fall through to 07-19 — the whole
    // reason this isn't "take the most recent row".
    expect(r.values.muscle_percent).toBe(77.6)
    expect(r.dates.muscle_percent).toBe('2026-07-19')
  })

  it('never reaches past the first non-null for a field', () => {
    const r = reduceLatest(ROWS)
    expect(r.values.water_percent).toBe(57.1)   // 07-19's, not 07-18's
  })

  it('reports the newest contributing date', () => {
    expect(reduceLatest(ROWS).latestDate).toBe('2026-07-20')
  })

  it('is empty for no history — a first weigh-in offers nothing to carry', () => {
    const r = reduceLatest([])
    expect(r.values).toEqual({})
    expect(r.latestDate).toBeNull()
  })

  it('ignores rows where every field is null (an unweighed day)', () => {
    const r = reduceLatest([
      { date: '2026-08-04', weight_kg: null, body_fat_pct: null, muscle_percent: null },
      ...ROWS,
    ])
    expect(r.values.weight_kg).toBe(65.3)
    expect(r.dates.weight_kg).toBe('2026-07-20')
    expect(r.latestDate).toBe('2026-07-20')
  })

  it('treats a stored zero as a real reading, not as absent', () => {
    // `visceral_fat: 0` is a value; `?? `-style coalescing would drop it.
    const r = reduceLatest([{ date: '2026-08-01', visceral_fat: 0 }])
    expect(r.values.visceral_fat).toBe(0)
  })

  it('carries every field the form can enter', () => {
    // Guards against a field being added to the form and silently not carried.
    // `estimated_waist_to_hip_ratio` is deliberately ABSENT until its paste-SQL
    // runs: this is one select, and PostgREST 400s all of it on one unknown
    // column, which would kill the carry-forward for every other field too.
    expect(CARRY_FIELDS).not.toContain('estimated_waist_to_hip_ratio')
    expect(CARRY_FIELDS).toEqual([
      'weight_kg', 'bmi', 'body_fat_pct', 'muscle_percent', 'water_percent',
      'protein_percent', 'bone_mineral', 'visceral_fat', 'bmr',
      'skeletal_muscle_mass_kg',
    ])
  })
})
