import { describe, it, expect } from 'vitest'
import { epley1RM, collapseToSessionBest, mergeStepsTrend, type PRRawRow } from '@/lib/hooks/useCharts'
import { resolveEraStart, daysBetween, eraForRange } from '@/lib/hooks/useEraWindow'
import { HELIX_CUT_START } from '@/lib/programs'

/** Epley returns `number | null`; these cases are all loaded, so assert non-null. */
const e = (w: number, r: number): number => {
  const v = epley1RM(w, r)
  expect(v).not.toBeNull()
  return v as number
}

describe('epley1RM', () => {
  it('returns weight as-is for 1 rep', () => {
    expect(e(100, 1)).toBe(100)
    expect(e(80, 1)).toBe(80)
  })

  it('estimates correctly for typical sets', () => {
    // 100kg × 5 reps → Epley: 100 × (1 + 5/30) = 100 × 1.1667 ≈ 116.7kg
    expect(e(100, 5)).toBeCloseTo(116.7, 0)
    // 80kg × 10 reps → 80 × (1 + 10/30) = 80 × 1.333 ≈ 106.7kg
    expect(e(80, 10)).toBeCloseTo(106.7, 0)
  })

  it('returns higher values for more reps at same weight', () => {
    expect(e(100, 5)).toBeGreaterThan(e(100, 3))
    expect(e(100, 10)).toBeGreaterThan(e(100, 5))
  })

  it('returns higher values for higher weight at same reps', () => {
    expect(e(120, 5)).toBeGreaterThan(e(100, 5))
  })

  it('handles 0 reps: weight × (1 + 0/30) = weight unchanged', () => {
    expect(e(100, 0)).toBe(100) // 100 * (1 + 0/30) = 100
  })

  it('returns a number with at most 1 decimal place', () => {
    const result = e(95, 8)
    // Should be rounded to 1dp
    expect(result).toBe(Math.round(result * 10) / 10)
  })

  // A bodyweight set has no 1RM to estimate, and 0 is not the absence of one —
  // it is a number, and the app printed it: "1RM 0" beside a Reverse Crunch
  // 0 kg × 17, a flat zero PR-history series, and a permanently null trend.
  it('returns null for unloaded work rather than a zero estimate', () => {
    expect(epley1RM(0, 17)).toBeNull()   // Reverse Crunch
    expect(epley1RM(0, 58)).toBeNull()   // Side Plank, 58 s
    expect(epley1RM(0, 1)).toBeNull()    // the 1-rep shortcut must not leak 0 either
    expect(epley1RM(-5, 10)).toBeNull()
    expect(epley1RM(Number.NaN, 10)).toBeNull()
  })
})

describe('chart data transforms', () => {
  it('epley1RM is monotonically increasing with reps', () => {
    const results = [1, 2, 3, 5, 8, 10, 12].map((reps) => e(100, reps))
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(results[i - 1])
    }
  })

  it('epley1RM at 30 reps doubles the weight', () => {
    // 100 × (1 + 30/30) = 100 × 2 = 200
    expect(e(100, 30)).toBe(200)
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

describe('mergeStepsTrend — daily_metrics wins per date', () => {
  it('prefers the HealthKit fan-out over the flat log row', () => {
    // The SAME precedence api/widget/snapshot applies. If these two disagreed,
    // the widget and the chart would report different step counts for one day.
    const out = mergeStepsTrend(
      [{ date: '2026-08-10', steps: 9812 }],
      [{ date: '2026-08-10', steps: 9000 }],
    )
    expect(out).toEqual([{ date: '2026-08-10', steps: 9812 }])
  })

  it('falls back to daily_logs for a date daily_metrics never received', () => {
    const out = mergeStepsTrend(
      [{ date: '2026-08-10', steps: 9812 }],
      [{ date: '2026-08-09', steps: 7100 }, { date: '2026-08-10', steps: 9000 }],
    )
    expect(out).toEqual([
      { date: '2026-08-09', steps: 7100 },
      { date: '2026-08-10', steps: 9812 },
    ])
  })

  it('drops nulls rather than plotting them as zero', () => {
    // A day with no reading is a GAP. Zero is a claim you stood still all day.
    const out = mergeStepsTrend([], [{ date: '2026-08-09', steps: null }, { date: '2026-08-10', steps: 8000 }])
    expect(out).toEqual([{ date: '2026-08-10', steps: 8000 }])
  })

  it('a null in daily_metrics does NOT erase a real daily_logs value', () => {
    // Precedence is per-VALUE, not per-table: metrics winning outright would let
    // an empty fan-out row blank a day the flat log actually has.
    const out = mergeStepsTrend([{ date: '2026-08-10', steps: null }], [{ date: '2026-08-10', steps: 9000 }])
    expect(out).toEqual([{ date: '2026-08-10', steps: 9000 }])
  })

  it('sorts chronologically whatever order the rows arrive in', () => {
    const out = mergeStepsTrend([], [
      { date: '2026-08-12', steps: 3 }, { date: '2026-08-10', steps: 1 }, { date: '2026-08-11', steps: 2 },
    ])
    expect(out.map((p) => p.date)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12'])
  })
})

describe('the era chart window', () => {
  it('prefers the plan start over the phase start', () => {
    // The toggle is labelled with the PLAN's name, so a window anchored to the
    // phase would be narrower than the thing it claims to span.
    expect(resolveEraStart('2026-07-15', '2026-08-01')).toBe('2026-07-15')
  })

  it('falls back to the phase start, then to the era anchor', () => {
    expect(resolveEraStart(null, '2026-08-01')).toBe('2026-08-01')
    expect(resolveEraStart(null, null)).toBe(HELIX_CUT_START)
    // Both columns exist but are empty in the live DB — the fallback is the
    // normal path, not the edge case.
    expect(resolveEraStart(undefined, undefined)).toBe(HELIX_CUT_START)
  })

  it('counts inclusively and never returns 0 or NaN', () => {
    expect(daysBetween('2026-08-01', '2026-08-01')).toBe(1)
    expect(daysBetween('2026-07-15', '2026-08-14')).toBe(31)
    expect(daysBetween('2026-08-14', '2026-08-01')).toBe(1)   // reversed → floored
    expect(Number.isFinite(daysBetween('not-a-date', '2026-08-01'))).toBe(true)
  })

  it('1 Month means all eras; anything else means the active plan era', () => {
    // Over 30 days every row is inside the current era anyway, so filtering
    // would only ever remove rows on the one month you switched plans — exactly
    // when you want to see both sides of the switch.
    expect(eraForRange(30)).toBe('all')
    expect(eraForRange(31)).toBe('axis')
    expect(eraForRange(400)).toBe('axis')
  })
})
