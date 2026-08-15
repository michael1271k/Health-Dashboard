import { describe, it, expect } from 'vitest'
import { dailySeries, latestDelta, calendarDays, e1rmTrends, type SetRow } from '@/lib/widget/derive'
import { nightOf, nightWindow, nextDayISO } from '@/lib/sleep/nightWindow'

/**
 * The seven-day derivations behind the Large faces.
 *
 * Each of these exists because a register had nothing to put in it, and each has
 * a failure mode that would look like working code: a night filed under the
 * wrong day, a delta of exactly zero on a value nobody measured, a bar chart
 * that quietly zeroes the days you forgot to log.
 */

describe('nightOf', () => {
  /**
   * `nightWindow(D)` is `[prevDay(D) 12:00Z, D 12:00Z)`, so a bedtime at or after
   * noon belongs to TOMORROW's night. Bucketing by `start_time.slice(0, 10)` —
   * the obvious thing — files every pre-midnight bedtime under the evening it
   * began instead of the morning it ended.
   */
  it('files an evening bedtime under the morning it ends on', () => {
    expect(nightOf('2026-08-14T22:48:00Z')).toBe('2026-08-15')
    expect(nightOf('2026-08-14T12:00:00Z')).toBe('2026-08-15')
  })

  it('files an after-midnight bedtime under the same date', () => {
    expect(nightOf('2026-08-15T01:20:00Z')).toBe('2026-08-15')
    expect(nightOf('2026-08-15T11:59:00Z')).toBe('2026-08-15')
  })

  it('is the exact inverse of the window it has to agree with', () => {
    // Every timestamp in `nightWindow(D)` must map back to D, or rows are
    // written into a window nobody queries — the bug the window doc warns about.
    for (const date of ['2026-08-15', '2026-01-01', '2026-03-01']) {
      const { from, to } = nightWindow(date)
      expect(nightOf(from)).toBe(date)
      // `to` is EXCLUSIVE and belongs to the next night.
      expect(nightOf(to)).toBe(nextDayISO(date))
    }
  })

  it('crosses a month and a year boundary', () => {
    expect(nightOf('2026-07-31T23:10:00Z')).toBe('2026-08-01')
    expect(nightOf('2026-12-31T23:10:00Z')).toBe('2027-01-01')
  })
})

describe('dailySeries', () => {
  it('sums rows that share a date — water arrives one glass at a time', () => {
    const series = dailySeries([
      { date: '2026-08-14', value: 500 },
      { date: '2026-08-14', value: 750 },
      { date: '2026-08-15', value: 250 },
    ], { limit: 7 })
    expect(series).toEqual([{ d: '2026-08-14', v: 1250 }, { d: '2026-08-15', v: 250 }])
  })

  it('takes the max when the rows are competing readings of one event', () => {
    // Two sleep sessions on one night are not 11 hours of sleep.
    const series = dailySeries([
      { date: '2026-08-15', value: 431 },
      { date: '2026-08-15', value: 232 },
    ], { limit: 7, combine: 'max' })
    expect(series).toEqual([{ d: '2026-08-15', v: 431 }])
  })

  it('omits a day with no rows rather than zeroing it', () => {
    // A day you forgot to log and a day you drank nothing are different days,
    // and a bar chart is the surface least able to tell them apart.
    const series = dailySeries([
      { date: '2026-08-13', value: 2000 },
      { date: '2026-08-15', value: 1800 },
    ], { limit: 7 })
    expect(series.map((p) => p.d)).toEqual(['2026-08-13', '2026-08-15'])
  })

  it('drops nulls and non-finite values without dropping their day', () => {
    const series = dailySeries([
      { date: '2026-08-15', value: null },
      { date: '2026-08-15', value: 300 },
      { date: '2026-08-15', value: undefined },
    ], { limit: 7 })
    expect(series).toEqual([{ d: '2026-08-15', v: 300 }])
  })

  it('keeps the NEWEST days when the window overflows', () => {
    const rows = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((d) => ({
      date: `2026-08-${d}`, value: 1,
    }))
    const series = dailySeries(rows, { limit: 7 })
    expect(series).toHaveLength(7)
    expect(series[0].d).toBe('2026-08-03')
    expect(series[6].d).toBe('2026-08-09')
  })

  it('is empty, not zero, with nothing to go on', () => {
    expect(dailySeries([], { limit: 7 })).toEqual([])
  })
})

describe('latestDelta', () => {
  it('skips carried-forward duplicates to find the previous real reading', () => {
    // `body_composition` carries values forward. Taking the second-newest row
    // would report 0.0 every day between weigh-ins and call it "held steady".
    const { value, delta } = latestDelta([
      { d: '2026-08-01', v: 19.4 },
      { d: '2026-08-10', v: 18.8 },
      { d: '2026-08-14', v: 18.8 },
      { d: '2026-08-15', v: 18.8 },
    ])
    expect(value).toBe(18.8)
    expect(delta).toBe(-0.6)
  })

  it('has no delta at all when only one distinct value exists', () => {
    const { value, delta } = latestDelta([
      { d: '2026-08-14', v: 26.8 },
      { d: '2026-08-15', v: 26.8 },
    ])
    expect(value).toBe(26.8)
    // Null, not 0 — "never changed" and "only measured once" are different.
    expect(delta).toBeNull()
  })

  it('treats sub-0.05 movement as the same reading', () => {
    // Same rule the weight card already uses: a re-synced identical reading is
    // not a fresh weigh-in.
    expect(latestDelta([{ d: '2026-08-14', v: 50.30 }, { d: '2026-08-15', v: 50.32 }]).delta)
      .toBeNull()
  })

  it('reads the END of the series, which is the newest', () => {
    // Every other producer in this file is oldest-first; reading index 0 would
    // report the fortnight backwards.
    expect(latestDelta([{ d: '2026-08-01', v: 80 }, { d: '2026-08-15', v: 78 }]).value).toBe(78)
  })

  it('is null on both counts for an empty series', () => {
    expect(latestDelta([])).toEqual({ value: null, delta: null })
  })
})

describe('calendarDays carries the plan label', () => {
  it('names a scheduled day and leaves a rest day unnamed', () => {
    const days = calendarDays(
      ['2026-08-14', '2026-08-15'],
      [{ date: '2026-08-14', volumeKg: 4200 }],
      (d) => d === '2026-08-14'
        ? { dayKey: 'legs_b', scheduled: true, label: 'Legs & Core B' }
        : { dayKey: null, scheduled: false, label: null },
    )
    expect(days[0]).toMatchObject({ dayKey: 'legs_b', label: 'Legs & Core B', logged: true })
    expect(days[1]).toMatchObject({ label: null, scheduled: false, logged: false })
  })

  it('defaults the label to null when a caller omits it entirely', () => {
    // The parameter is optional so existing callers keep compiling; what they
    // must NOT get is `undefined` leaking into the payload as a missing key.
    const days = calendarDays(['2026-08-15'], [], () => ({ dayKey: 'cb_a', scheduled: true }))
    expect(days[0].label).toBeNull()
  })
})

describe('e1rmTrends carries a per-lift series', () => {
  const sets = (rows: Array<[string, string, number, number]>): SetRow[] =>
    rows.map(([exercise, day, weightKg, reps]) => ({ exercise, day, weightKg, reps }))

  it('reports the per-DAY best, not the per-set value', () => {
    // A session is a top set followed by back-offs; reading each set as its own
    // point makes every workout look like a collapse halfway through.
    const [lift] = e1rmTrends(sets([
      ['Bench Press', '2026-08-10', 80, 5],
      ['Bench Press', '2026-08-10', 60, 8],
      ['Bench Press', '2026-08-14', 82.5, 5],
    ]), { asOf: '2026-08-15' })

    expect(lift.trend).toHaveLength(2)
    expect(lift.trend?.map((p) => p.d)).toEqual(['2026-08-10', '2026-08-14'])
    // The heavier top set wins its day rather than the last set logged.
    expect(lift.trend![0].v).toBeGreaterThan(lift.trend![1].v - 10)
    expect(lift.kg).toBe(lift.trend![1].v)
  })

  it('leaves the trend oldest-first so a sparkline reads left to right', () => {
    const [lift] = e1rmTrends(sets([
      ['Squat', '2026-08-14', 100, 5],
      ['Squat', '2026-07-20', 90, 5],
    ]), { asOf: '2026-08-15' })
    expect(lift.trend?.map((p) => p.d)).toEqual(['2026-07-20', '2026-08-14'])
  })
})
