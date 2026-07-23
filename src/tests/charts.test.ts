import { describe, it, expect } from 'vitest'
import { epley1RM, collapseToSessionBest, type PRRawRow } from '@/lib/hooks/useCharts'

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

  it('handles 0 reps: weight × (1 + 0/30) = weight unchanged', () => {
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

describe('collapseToSessionBest (strength-trend ghost-data fix)', () => {
  const raw = (est: number, startedAt: string): PRRawRow => ({
    exercise_id: 'hack-squat', exercise_name: 'Hack Squat',
    startedAt, date: startedAt.slice(0, 10), est_1rm_kg: est, weight_kg: est, reps: 5,
  })

  it('a single session with a top set + back-off sets yields ONE point (no fake drop)', () => {
    const rows = [raw(76, '2026-07-20T18:00:00Z'), raw(68, '2026-07-20T18:00:00Z'), raw(59, '2026-07-20T18:00:00Z')]
    const out = collapseToSessionBest(rows)
    expect(out).toHaveLength(1)
    expect(out[0].est_1rm_kg).toBe(76) // the top set, not the back-off
  })

  it('keeps one point per session across multiple sessions, chronologically', () => {
    const rows = [
      raw(59, '2026-07-20T18:00:00Z'), raw(76, '2026-07-20T18:00:00Z'),
      raw(80, '2026-07-27T18:00:00Z'), raw(70, '2026-07-27T18:00:00Z'),
    ]
    const out = collapseToSessionBest(rows)
    expect(out.map((p) => p.est_1rm_kg)).toEqual([76, 80]) // real progression, sorted by date
  })
})
