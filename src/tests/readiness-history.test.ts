import { describe, it, expect } from 'vitest'
import { historyDates, readinessHistoryFor, flattenReadiness, sessionDateOf } from '@/lib/scoring/readinessHistory'
import { computeReadinessSignals, READINESS } from '@/lib/scoring/readiness'

// The data layer's half of readiness v9: the same rows, the same series, on
// the web (`computeForDate`, `useWeeklyLoop`) and — by construction — on the
// phone (`ReadinessHistoryBuilder`). What this pins is the SHAPE of the
// history handed to the model, which is where the two sides could disagree
// without either formula being wrong.

describe('historyDates', () => {
  it('is 49 consecutive dates ending on the day itself', () => {
    const dates = historyDates('2026-09-05')
    expect(dates).toHaveLength(READINESS.historyDays)
    expect(dates[0]).toBe('2026-07-19')
    expect(dates[dates.length - 1]).toBe('2026-09-05')
    expect(dates[41]).toBe('2026-08-29')
  })
})

describe('sessionDateOf', () => {
  it('files a session under the UTC date of its start, as the day query does', () => {
    expect(sessionDateOf('2026-08-31T21:40:00+00:00')).toBe('2026-08-31')
    expect(sessionDateOf('2026-08-31T21:40:00Z')).toBe('2026-08-31')
  })
})

describe('readinessHistoryFor', () => {
  const date = '2026-09-05'
  const rows = {
    logs: [
      { date: '2026-09-05', hrv_ms: 48, avg_rest_heart_rate: 55 },
      { date: '2026-09-04', hrv_ms: null, avg_rest_heart_rate: 54 },
      { date: '2026-08-01', hrv_ms: 62, avg_rest_heart_rate: 51 },
      { date: '2026-06-01', hrv_ms: 99, avg_rest_heart_rate: 99 },  // outside the window
    ],
    metrics: [
      { date: '2026-09-04', rest_hr: 57 },                        // beats the log's 54
      { date: '2026-09-03', rest_hr: 53 },                        // the only reading that day
    ],
    sessions: [
      { started_at: '2026-09-05T17:00:00+00:00', session_rpe: 8, duration_min: 60 },
      { started_at: '2026-09-04T17:00:00+00:00', session_rpe: null, duration_min: 50 },
      { started_at: '2026-06-01T17:00:00+00:00', session_rpe: 9, duration_min: 60 },
    ],
    cardio: [
      { date: '2026-09-04', effort: 3, duration_min: 30 },
      { date: '2026-09-03', effort: null, duration_min: 30 },
    ],
    nights: [
      // The night of the 5th: two rows in one window, the longest is the night.
      { start_time: '2026-09-04T22:46:00+00:00', duration_min: 431, deep_min: 74, rem_min: 96, awake_min: 18 },
      { start_time: '2026-09-04T23:30:00+00:00', duration_min: 90, deep_min: 0, rem_min: 0, awake_min: 0 },
      // The 4th: a duration-only legacy row — asleep counts, awake does not.
      { start_time: '2026-09-03T23:00:00+00:00', duration_min: 420, deep_min: 0, rem_min: 0, awake_min: 0 },
      // The 3rd: a still night WITH stages — a real zero awake.
      { start_time: '2026-09-02T22:00:00+00:00', duration_min: 400, deep_min: 60, rem_min: 80, awake_min: 0 },
      // A bedtime after noon files under the NEXT morning (the 2nd → the 3rd is taken; this is the 2nd).
      { start_time: '2026-09-01T13:00:00+00:00', duration_min: 300, deep_min: 30, rem_min: 40, awake_min: 30 },
      { start_time: '2026-06-01T23:00:00+00:00', duration_min: 999, deep_min: 1, rem_min: 1, awake_min: 999 },  // outside the window
    ],
  }

  it('lays every series on the 49-day calendar, newest last', () => {
    const h = readinessHistoryFor(date, rows)
    expect(h.hrv).toHaveLength(49)
    expect(h.rhr).toHaveLength(49)
    expect(h.loads).toHaveLength(49)
    expect(h.hrv[48]).toBe(48)
    expect(h.hrv[47]).toBeNull()
    expect(h.hrv[13]).toBe(62)          // 2026-08-01
    expect(h.hrv).not.toContain(99)
  })

  it('reads resting HR from daily_metrics first and the log second — the scorer\'s own rule', () => {
    const h = readinessHistoryFor(date, rows)
    expect(h.rhr[48]).toBe(55)
    expect(h.rhr[47]).toBe(57)
    expect(h.rhr[46]).toBe(53)
    expect(h.rhr[45]).toBeNull()
  })

  it('sums the loads per day, with the unrated session at the default and the unrated walk at zero', () => {
    const h = readinessHistoryFor(date, rows)
    expect(h.loads[48]).toBe(480)
    expect(h.loads[47]).toBe(7 * 50 + 3 * 30)
    expect(h.loads[46]).toBe(0)
    expect(h.loads.slice(0, 46).every((v) => v === 0)).toBe(true)
  })

  it('lays the nights on the calendar: longest wins, duration-only has no awake, noon files under tomorrow', () => {
    const h = readinessHistoryFor(date, rows)
    expect(h.asleepMin).toHaveLength(49)
    expect(h.awakeMin).toHaveLength(49)
    expect(h.asleepMin![48]).toBe(431)
    expect(h.awakeMin![48]).toBe(18)
    expect(h.asleepMin![47]).toBe(420)
    expect(h.awakeMin![47]).toBeNull()      // duration-only
    expect(h.asleepMin![46]).toBe(400)
    expect(h.awakeMin![46]).toBe(0)         // a real still night
    expect(h.asleepMin![45]).toBe(300)      // 2026-09-01T13:00Z → the night of the 2nd
    expect(h.awakeMin![45]).toBe(30)
    expect(h.asleepMin![44]).toBeNull()
    expect(h.asleepMin).not.toContain(999)
  })

  it('a caller with no nights gets an all-null fragmentation series, not a crash', () => {
    const { nights: _drop, ...bare } = rows
    void _drop
    const h = readinessHistoryFor(date, bare)
    expect(h.asleepMin!.every((v) => v == null)).toBe(true)
    expect(h.awakeMin!.every((v) => v == null)).toBe(true)
  })

  it('flattens the signals to the export shape, null for null', () => {
    const flat = flattenReadiness(computeReadinessSignals(readinessHistoryFor(date, rows)))
    expect(flat.hrvZ).toBeNull()
    expect(flat.rhrZ).toBeNull()
    expect(flat.load).toBe(480)
    // Two sessions, both inside the rolling week: no chronic side, no ratio.
    expect(flat.acwr).toBeNull()
    expect(flat.acute).not.toBeNull()
    expect(Object.keys(flat).sort()).toEqual(
      ['acute', 'acwr', 'chronic', 'hrvZ', 'load', 'monotony', 'rhrZ', 'strain', 'strainZ', 'weeklyLoad'],
    )
  })
})
