import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { paintComputedScore, type ComputedScore } from '@/lib/scoring/applyComputedScore'
import { todayBundleKey } from '@/lib/hooks/useToday'
import type { TodayReadiness } from '@/lib/hooks/useTodayReadiness'
import type { TodayBundle } from '@/lib/hooks/useToday'

const DATE = '2026-08-13'

const computed = (o: Partial<ComputedScore> = {}): ComputedScore => ({
  date: DATE,
  score: 88, sleep_score: 92, nutrition_score: 80,
  activity_score: 75, workout_score: 90, recovery_score: 84,
  battery_pct: 41,
  ...o,
})

/**
 * The battery used to move only after a manual sync: the commit invalidated
 * `readiness_today` BEFORE the recompute POST resolved, so the refetch raced the
 * write and read the pre-recompute value — then held it for the five-minute
 * staleTime. Painting the returned row removes the race.
 */
describe('paintComputedScore', () => {
  it('writes the new battery into a cached readiness query', () => {
    const qc = new QueryClient()
    qc.setQueryData<TodayReadiness>(['readiness_today', DATE], {
      batteryPct: 78, sleepScore: 60, sleepMin: 430,
    })

    paintComputedScore(qc, DATE, computed())

    const next = qc.getQueryData<TodayReadiness>(['readiness_today', DATE])
    expect(next?.batteryPct).toBe(41)
    expect(next?.sleepScore).toBe(92)
    // Untouched: sleep minutes come from daily_logs, not from the score row.
    expect(next?.sleepMin).toBe(430)
  })

  it('merges into the today bundle without dropping its other slices', () => {
    const qc = new QueryClient()
    qc.setQueryData<TodayBundle>(todayBundleKey(DATE), {
      date: DATE,
      score: { battery_pct: 78 } as TodayBundle['score'],
      dailyLog: { sleep_minutes: 430 } as TodayBundle['dailyLog'],
      metrics: null, nutrition: null, sleep: null, goals: null,
    })

    paintComputedScore(qc, DATE, computed())

    const next = qc.getQueryData<TodayBundle>(todayBundleKey(DATE))
    expect(next?.score?.battery_pct).toBe(41)
    expect(next?.dailyLog?.sleep_minutes).toBe(430)   // sibling slice survives
  })

  /**
   * Seeding a key that was never fetched would install a bundle holding a score
   * and nothing else, and the dashboard would render that skeleton as the day.
   */
  it('does NOT seed a query that has never been fetched', () => {
    const qc = new QueryClient()
    paintComputedScore(qc, DATE, computed())
    expect(qc.getQueryData(['readiness_today', DATE])).toBeUndefined()
    expect(qc.getQueryData(todayBundleKey(DATE))).toBeUndefined()
  })

  it('is a no-op when the recompute wrote nothing', () => {
    // A frozen past day, or a day with no underlying data, returns score: null.
    const qc = new QueryClient()
    qc.setQueryData<TodayReadiness>(['readiness_today', DATE], {
      batteryPct: 78, sleepScore: 60, sleepMin: 430,
    })
    paintComputedScore(qc, DATE, null)
    expect(qc.getQueryData<TodayReadiness>(['readiness_today', DATE])?.batteryPct).toBe(78)
  })

  it('paints only the date it was given', () => {
    const qc = new QueryClient()
    qc.setQueryData<TodayReadiness>(['readiness_today', '2026-08-12'], {
      batteryPct: 78, sleepScore: 60, sleepMin: 430,
    })
    paintComputedScore(qc, DATE, computed())
    expect(qc.getQueryData<TodayReadiness>(['readiness_today', '2026-08-12'])?.batteryPct).toBe(78)
  })
})
