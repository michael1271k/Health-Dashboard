import { describe, it, expect } from 'vitest'
import { nightWindow, fallbackBedTime, prevDayISO } from '@/lib/sleep/nightWindow'

/**
 * Guards the "Awaiting Sleep Data after pull-to-refresh" regression.
 *
 * The ingest route DELETEs a night's window before inserting it, and the rolling
 * HealthKit sync pushes two adjacent days. If consecutive windows overlap,
 * yesterday's delete can wipe the row today's request just wrote. These tests
 * fail against the old `[prev 12:00Z, date 23:59:59Z)` bound.
 */
describe('nightWindow', () => {
  it('spans previous noon → this noon (half-open)', () => {
    expect(nightWindow('2026-07-23')).toEqual({
      from: '2026-07-22T12:00:00Z',
      to: '2026-07-23T12:00:00Z',
    })
  })

  it('consecutive nights TILE without overlapping', () => {
    const a = nightWindow('2026-07-23')
    const b = nightWindow('2026-07-24')
    // b starts exactly where a ends — no gap, no overlap.
    expect(b.from).toBe(a.to)
    expect(a.to <= b.from).toBe(true)
  })

  it('a real bedtime lands in exactly ONE night', () => {
    const bed = '2026-07-22T20:45:00Z' // evening of the 22nd = night of the 23rd
    const inWindow = (d: string) => {
      const w = nightWindow(d)
      return bed >= w.from && bed < w.to
    }
    expect(inWindow('2026-07-23')).toBe(true)
    expect(inWindow('2026-07-22')).toBe(false)
    expect(inWindow('2026-07-24')).toBe(false)
  })

  it('the bed_start-less fallback sits INSIDE its own night window', () => {
    for (const date of ['2026-07-23', '2026-01-01', '2026-03-01']) {
      const w = nightWindow(date)
      const t = fallbackBedTime(date)
      expect(t >= w.from).toBe(true)
      expect(t < w.to).toBe(true)
    }
  })

  it('prevDayISO crosses month and year boundaries', () => {
    expect(prevDayISO('2026-03-01')).toBe('2026-02-28')
    expect(prevDayISO('2026-01-01')).toBe('2025-12-31')
  })
})
