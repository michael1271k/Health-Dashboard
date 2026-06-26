import { describe, it, expect } from 'vitest'
import { epley1RM } from '@/lib/hooks/useCharts'

describe('epley1RM', () => {
  it('returns weight as-is for 1 rep', () => {
    expect(epley1RM(100, 1)).toBe(100)
    expect(epley1RM(80, 1)).toBe(80)
  })

  it('estimates correctly for typical sets', () => {
    // 100kg × 5 reps → Epley: 100 × (1 + 5/30) = 100 × 1.1667 ≈ 116.7kg
    expect(epley1RM(100, 5)).toBeCloseTo(116.7, 0)
    // 80kg × 10 reps → 80 × (1 + 10/30) = 80 × 1.333 ≈ 106.7kg
    expect(epley1RM(80, 10)).toBeCloseTo(106.7, 0)
  })

  it('returns higher values for more reps at same weight', () => {
    expect(epley1RM(100, 5)).toBeGreaterThan(epley1RM(100, 3))
    expect(epley1RM(100, 10)).toBeGreaterThan(epley1RM(100, 5))
  })

  it('returns higher values for higher weight at same reps', () => {
    expect(epley1RM(120, 5)).toBeGreaterThan(epley1RM(100, 5))
  })

  it('handles edge case: 0 reps returns 0 × factor = 0', () => {
    expect(epley1RM(100, 0)).toBe(100) // 100 * (1 + 0/30) = 100
  })

  it('returns a number with at most 1 decimal place', () => {
    const result = epley1RM(95, 8)
    // Should be rounded to 1dp
    expect(result).toBe(Math.round(result * 10) / 10)
  })
})

describe('chart data transforms', () => {
  it('epley1RM is monotonically increasing with reps', () => {
    const results = [1, 2, 3, 5, 8, 10, 12].map((reps) => epley1RM(100, reps))
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(results[i - 1])
    }
  })

  it('epley1RM at 30 reps doubles the weight', () => {
    // 100 × (1 + 30/30) = 100 × 2 = 200
    expect(epley1RM(100, 30)).toBe(200)
  })
})
