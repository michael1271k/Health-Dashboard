import { describe, it, expect } from 'vitest'
import { niceDomain, compactKg } from '@/lib/charts/scale'
import { isoWeekNumber, currentWeekDays } from '@/components/charts/CurrentWeekButton'

describe('niceDomain', () => {
  it('fits the DATA, not zero — the flat-volume-chart bug', () => {
    // Real shape of a training block: ~8.4t to ~9.1t. Zero-based, the whole
    // series is a 7% band at the top of the chart.
    const [lo, hi] = niceDomain([8400, 8900, 8600, 9100, 8750])
    expect(lo).toBeGreaterThan(7000)
    expect(hi).toBeLessThan(10_000)
    expect(lo).toBeLessThanOrEqual(8400)
    expect(hi).toBeGreaterThanOrEqual(9100)
  })

  it('includes zero only when asked', () => {
    expect(niceDomain([8400, 9100], { zeroBased: true })[0]).toBe(0)
  })

  it('gives a flat series breathing room instead of a zero-height axis', () => {
    const [lo, hi] = niceDomain([70, 70, 70])
    expect(hi).toBeGreaterThan(lo)
    expect(lo).toBeLessThan(70)
    expect(hi).toBeGreaterThan(70)
  })

  it('survives an empty or all-null series', () => {
    expect(niceDomain([])).toEqual([0, 1])
    expect(niceDomain([null, undefined])).toEqual([0, 1])
  })

  it('ignores nulls among real values', () => {
    const [lo, hi] = niceDomain([null, 50, undefined, 60])
    expect(lo).toBeLessThanOrEqual(50)
    expect(hi).toBeGreaterThanOrEqual(60)
  })

  it('respects hardMin so a count axis never goes negative', () => {
    expect(niceDomain([1, 2, 3], { hardMin: 0 })[0]).toBe(0)
  })

  it('snaps to round steps', () => {
    const [lo, hi] = niceDomain([103, 197])
    expect(Number.isInteger(lo)).toBe(true)
    expect(Number.isInteger(hi)).toBe(true)
  })
})

describe('compactKg', () => {
  it('keeps a decimal below 10 t so near weeks stay distinguishable', () => {
    // The old formatter rendered both of these as "8k" / "9k".
    expect(compactKg(8400)).toBe('8.4k')
    expect(compactKg(9100)).toBe('9.1k')
  })

  it('drops the decimal once it stops adding information', () => {
    expect(compactKg(12_000)).toBe('12k')
  })

  it('leaves sub-tonne values alone', () => {
    expect(compactKg(750)).toBe('750')
  })
})

describe('current-week timeframe', () => {
  it('numbers the ISO week', () => {
    // 2026-01-01 is a Thursday, so it belongs to week 1 of 2026.
    expect(isoWeekNumber('2026-01-01')).toBe(1)
    expect(isoWeekNumber('2026-07-31')).toBe(31)
  })

  it('counts Sunday through today inclusive', () => {
    // 2026-08-01 is a Saturday; its Sunday-anchored week began 2026-07-26.
    expect(currentWeekDays('2026-08-01')).toBe(7)
    expect(currentWeekDays('2026-07-26')).toBe(1)
  })
})
