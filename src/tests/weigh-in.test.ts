import { describe, it, expect } from 'vitest'
import { latestWeighIn, pickLatestBodyMetrics } from '@/lib/hooks/useBioStrips'

/**
 * The Body card said "Weighed yesterday" two days after the real weigh-in,
 * because presence of a `weight_kg` value was treated as proof of a weigh-in.
 * A day only counts when the value actually MOVED.
 */
describe('latestWeighIn', () => {
  const TODAY = '2026-07-24'

  it('reports the real weigh-in age, ignoring carried duplicates', () => {
    const w = latestWeighIn([
      { date: '2026-07-20', weightKg: 65.4 },
      { date: '2026-07-22', weightKg: 64.9 },  // the actual weigh-in
      { date: '2026-07-23', weightKg: 64.9 },  // re-synced same reading
    ], TODAY)
    expect(w?.date).toBe('2026-07-22')
    expect(w?.ageDays).toBe(2)
    expect(w?.kg).toBe(64.9)
  })

  it('computes the delta against the previous CHANGED reading', () => {
    const w = latestWeighIn([
      { date: '2026-07-20', weightKg: 65.4 },
      { date: '2026-07-21', weightKg: 65.4 },
      { date: '2026-07-22', weightKg: 64.9 },
    ], TODAY)
    expect(w?.prevKg).toBe(65.4)
    expect(w?.delta).toBe(-0.5)
  })

  it('treats sub-scale-resolution wobble as no new weigh-in', () => {
    const w = latestWeighIn([
      { date: '2026-07-22', weightKg: 64.9 },
      { date: '2026-07-23', weightKg: 64.92 },   // < 0.05 kg — noise, not a weigh-in
    ], TODAY)
    expect(w?.date).toBe('2026-07-22')
    expect(w?.ageDays).toBe(2)
  })

  it('drops sub-50kg artifacts and nulls, and handles an empty ledger', () => {
    expect(latestWeighIn([], TODAY)).toBeNull()
    expect(latestWeighIn([{ date: '2026-07-23', weightKg: null }], TODAY)).toBeNull()
    const w = latestWeighIn([
      { date: '2026-07-22', weightKg: 64.9 },
      { date: '2026-07-23', weightKg: 3.2 },   // scale artifact
    ], TODAY)
    expect(w?.kg).toBe(64.9)
  })

  it('a same-day weigh-in reads as age 0', () => {
    const w = latestWeighIn([
      { date: '2026-07-22', weightKg: 65.4 },
      { date: TODAY, weightKg: 64.9 },
    ], TODAY)
    expect(w?.ageDays).toBe(0)
  })
})

/**
 * The Body card only showed Weight because it read TODAY's daily_logs row for
 * every other metric while weight carried forward separately. Each field now
 * carries forward independently.
 */
describe('pickLatestBodyMetrics', () => {
  it('carries each field forward from its OWN newest reading', () => {
    const m = pickLatestBodyMetrics([
      { date: '2026-07-20', weight_kg: 65.4, bmi: 21.8, body_fat_pct: 17.2 },
      { date: '2026-07-22', weight_kg: 64.9, bmi: null, body_fat_pct: null },
      { date: '2026-07-24', weight_kg: null, bmi: null, body_fat_pct: null },
    ])
    expect(m.weight_kg).toEqual({ value: 64.9, date: '2026-07-22' })
    // BMI is older than the weight, but it's still the newest BMI there is.
    expect(m.bmi).toEqual({ value: 21.8, date: '2026-07-20' })
    expect(m.body_fat_pct?.value).toBe(17.2)
  })

  it('omits fields that were never logged', () => {
    const m = pickLatestBodyMetrics([{ date: '2026-07-24', weight_kg: 64.9 }])
    expect(m.bmr).toBeUndefined()
    expect(m.visceral_fat).toBeUndefined()
  })

  it('skips a sub-50kg artifact and keeps looking back for a real reading', () => {
    const m = pickLatestBodyMetrics([
      { date: '2026-07-22', weight_kg: 64.9 },
      { date: '2026-07-24', weight_kg: 3.1 },   // artifact must not mask the 22nd
    ])
    expect(m.weight_kg).toEqual({ value: 64.9, date: '2026-07-22' })
  })

  it('is empty for an empty log', () => {
    expect(pickLatestBodyMetrics([])).toEqual({})
  })
})
