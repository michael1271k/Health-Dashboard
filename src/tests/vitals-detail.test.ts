import { describe, it, expect } from 'vitest'
import { latestReading, seriesStats } from '@/components/insights/VitalsGroups'
import type { VitalsDay } from '@/lib/hooks/useVitals'

/**
 * The two helpers the rebuilt Vitals rows added: the today strip's headline
 * reading, and the tapped row's range.
 *
 * Both have to survive a gap. Apple Health writes HRV on the nights the watch
 * was worn and nothing on the nights it wasn't, so "latest" almost never means
 * "the last row in the array".
 */

const day = (date: string, hrv: number | null): VitalsDay => ({
  date,
  hrv_ms: hrv,
  avg_rest_heart_rate: null,
  wrist_temp_delta: null,
  respiratory_rate: null,
  blood_oxygen: null,
  vo2max: null,
  time_in_daylight_min: null,
  stand_hours: null,
  steps: null,
  sleep_minutes: null,
  exercise_minutes: null,
  training_minutes: null,
  active_energy: null,
})

const hrv = (d: VitalsDay) => d.hrv_ms

describe('latestReading', () => {
  it('walks BACK past empty days rather than reporting the last row', () => {
    const rows = [day('2026-08-10', 58), day('2026-08-11', 61), day('2026-08-12', null)]
    expect(latestReading(rows, hrv)).toEqual({ value: 61, date: '2026-08-11' })
  })

  it('is null when nothing was ever recorded — not 0', () => {
    expect(latestReading([day('2026-08-10', null)], hrv)).toBeNull()
    expect(latestReading([], hrv)).toBeNull()
  })

  it('returns the newest reading when every day has one', () => {
    const rows = [day('2026-08-10', 58), day('2026-08-11', 61)]
    expect(latestReading(rows, hrv)!.value).toBe(61)
  })
})

describe('seriesStats', () => {
  it('ignores the gaps rather than counting them as zero', () => {
    // A missing week is a week the reading did not exist, not a week it was 0 —
    // averaging the null in would drag every mean toward the floor.
    expect(seriesStats([60, null, 70])).toEqual({ min: 60, max: 70, mean: 65, n: 2 })
  })

  it('is null when the whole series is empty', () => {
    expect(seriesStats([])).toBeNull()
    expect(seriesStats([null, null])).toBeNull()
  })

  it('handles a single point without collapsing the range', () => {
    expect(seriesStats([42])).toEqual({ min: 42, max: 42, mean: 42, n: 1 })
  })
})
