import { describe, it, expect } from 'vitest'
import { paceMinPerKm, formatPace, distanceKm, activeKcalOf } from '@/lib/cardio/metrics'
import { normalizeCr10, cr10Label, cr10Color, CR10_MIN, CR10_MAX } from '@/lib/training/effort'

describe('paceMinPerKm', () => {
  it('is minutes divided by kilometres', () => {
    expect(paceMinPerKm(5000, 30)).toBe(6)
    expect(paceMinPerKm(4200, 45)).toBeCloseTo(10.714, 3)
  })

  it('refuses to divide by zero or negative distance', () => {
    expect(paceMinPerKm(0, 30)).toBeNull()
    expect(paceMinPerKm(-100, 30)).toBeNull()
    expect(paceMinPerKm(5000, 0)).toBeNull()
  })

  it('returns null when either input is missing — a half-logged walk has no pace', () => {
    expect(paceMinPerKm(null, 30)).toBeNull()
    expect(paceMinPerKm(5000, null)).toBeNull()
    expect(paceMinPerKm(undefined, undefined)).toBeNull()
    expect(paceMinPerKm(NaN, 30)).toBeNull()
  })
})

describe('formatPace', () => {
  it('renders mm:ss /km with a zero-padded seconds field', () => {
    expect(formatPace(6)).toBe('6:00 /km')
    // 45 min over 4.2 km = 10.7142… min/km = 642.86 s → 10:43.
    expect(formatPace(paceMinPerKm(4200, 45))).toBe('10:43 /km')
  })

  // Regression: flooring the minute and then flooring the remainder loses a
  // second to binary error — (5.05 - 5) * 60 is 2.9999…, so 5:03 read 5:02.
  it('rounds to the nearest second rather than flooring twice', () => {
    expect(formatPace(5.05)).toBe('5:03 /km')
    expect(formatPace(6.999)).toBe('7:00 /km')   // 6 min 59.94 s IS 7:00
    expect(formatPace(9.99)).toBe('9:59 /km')     // 599.4 s, does not tip to 10:00
  })

  it('em-dashes the unusable: null, zero, and absurd paces', () => {
    expect(formatPace(null)).toBe('—')
    expect(formatPace(0)).toBe('—')
    expect(formatPace(-3)).toBe('—')
    // A 1 m "walk" over an hour is a typo, not a 60000 min/km pace.
    expect(formatPace(paceMinPerKm(1, 60))).toBe('—')
  })
})

describe('distanceKm', () => {
  it('converts metres and rounds to 2 dp', () => {
    expect(distanceKm(4200)).toBe(4.2)
    expect(distanceKm(4237)).toBe(4.24)
    expect(distanceKm(0)).toBe(0)
  })
  it('is null-safe and rejects negatives', () => {
    expect(distanceKm(null)).toBeNull()
    expect(distanceKm(-5)).toBeNull()
  })
})

describe('activeKcalOf — the legacy column fallback', () => {
  it('prefers active_kcal', () => {
    expect(activeKcalOf({ active_kcal: 210, kcal: 999 })).toBe(210)
  })
  it('falls back to the original kcal column for pre-migration rows', () => {
    expect(activeKcalOf({ kcal: 185 })).toBe(185)
    expect(activeKcalOf({ active_kcal: null, kcal: 185 })).toBe(185)
  })
  it('is null when neither exists', () => {
    expect(activeKcalOf({})).toBeNull()
    expect(activeKcalOf({ active_kcal: null, kcal: null })).toBeNull()
  })
})

describe('Borg CR10 effort', () => {
  it('snaps to the 0.5 grid the column stores', () => {
    expect(normalizeCr10(7.3)).toBe(7.5)
    expect(normalizeCr10(7.2)).toBe(7)
    expect(normalizeCr10(8)).toBe(8)
  })

  it('clamps to 1–10', () => {
    expect(normalizeCr10(0)).toBe(CR10_MIN)
    expect(normalizeCr10(-4)).toBe(CR10_MIN)
    expect(normalizeCr10(99)).toBe(CR10_MAX)
  })

  it('keeps "not rated" distinct from "zero effort"', () => {
    expect(normalizeCr10(null)).toBeNull()
    expect(normalizeCr10(undefined)).toBeNull()
    expect(normalizeCr10(NaN)).toBeNull()
  })

  it('gives every rating a verbal anchor, interpolating between canonical points', () => {
    expect(cr10Label(1)).toBe('Very light')
    expect(cr10Label(5)).toBe('Hard')
    expect(cr10Label(6)).toBe('Hard')      // between 5 and 7 → the lower anchor
    expect(cr10Label(7.5)).toBe('Very hard')
    expect(cr10Label(10)).toBe('Maximal')
    expect(cr10Label(null)).toBe('—')
  })

  it('ramps colour from green to red and greys out an unrated session', () => {
    expect(cr10Color(3)).toBe('#3E9E7A')
    expect(cr10Color(10)).toBe('#C4514E')
    expect(cr10Color(null)).toBe('#8E9AAC')
  })
})
