import { describe, it, expect } from 'vitest'
import { normalizeSpO2 } from '@/lib/utils/units'

/**
 * Regression guards for the two "reported fixed but still broken" bugs.
 * `daily_logs.blood_oxygen` holds MIXED units — the native bridge wrote the raw
 * HealthKit fraction (0.982) while the legacy Shortcut wrote a real percent
 * (97.79). Display must be correct for BOTH forms.
 */
describe('normalizeSpO2 — mixed-unit blood oxygen', () => {
  it('scales a HealthKit fraction to a percent (0.982 → 98.2, never "1%")', () => {
    expect(normalizeSpO2(0.982)).toBe(98.2)
    expect(normalizeSpO2(0.99)).toBe(99)
    expect(normalizeSpO2(0.94)).toBe(94)
  })

  it('passes an already-percent legacy value through untouched', () => {
    expect(normalizeSpO2(97.79)).toBe(97.79)
    expect(normalizeSpO2(98)).toBe(98)
  })

  it('is idempotent — normalizing twice never double-scales', () => {
    const once = normalizeSpO2(0.982)!
    expect(normalizeSpO2(once)).toBe(once)
  })

  it('handles null/undefined/non-finite as null', () => {
    expect(normalizeSpO2(null)).toBeNull()
    expect(normalizeSpO2(undefined)).toBeNull()
    expect(normalizeSpO2(NaN)).toBeNull()
  })

  it('boundary: 1.0 is a fraction (100%), 1.5 is the cutoff', () => {
    expect(normalizeSpO2(1)).toBe(100)
    expect(normalizeSpO2(1.5)).toBe(150)   // still treated as fraction at the edge
    expect(normalizeSpO2(1.6)).toBe(1.6)   // above the cutoff → left alone
  })
})
