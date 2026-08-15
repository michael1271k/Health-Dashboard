import { describe, it, expect } from 'vitest'
import { calendarDays, streakFrom, weeklyVolume } from '@/lib/widget/derive'
import { weekStartOf } from '@/lib/utils/week'

/**
 * The Training widget's calendar, streak and volume sparkline.
 *
 * Helix-5 trains Sun/Mon/Tue/Thu/Fri and rests Wed/Sat, so every one of these
 * has to reason about scheduled days rather than calendar days — a counter that
 * a rest day could break would be measuring the plan, not the athlete.
 */

// Week of 2026-08-09 (Sunday) → Sun 09 · Mon 10 · Tue 11 · [Wed rest] ·
// Thu 13 · Fri 14 · [Sat rest].
const WEEK = ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']
const REST = new Set(['2026-08-12', '2026-08-15'])
const DAY_KEYS: Record<string, string> = {
  '2026-08-09': 'cb_a', '2026-08-10': 'legs_a', '2026-08-11': 'arms',
  '2026-08-13': 'cb_b', '2026-08-14': 'legs_b',
}
const schedule = (d: string) => ({ dayKey: DAY_KEYS[d] ?? null, scheduled: !REST.has(d) })

describe('calendarDays', () => {
  it('returns every day, trained or not — the empty ones are the content', () => {
    const out = calendarDays(WEEK, [], schedule)
    expect(out).toHaveLength(7)
    expect(out.every((x) => !x.logged)).toBe(true)
  })

  it('carries the PLAN’s dayKey, so the ring can be tinted', () => {
    const out = calendarDays(WEEK, [], schedule)
    expect(out.find((x) => x.d === '2026-08-14')!.dayKey).toBe('legs_b')
    expect(out.find((x) => x.d === '2026-08-15')!.dayKey).toBeNull()
  })

  it('marks rest days unscheduled', () => {
    const out = calendarDays(WEEK, [], schedule)
    expect(out.filter((x) => !x.scheduled).map((x) => x.d)).toEqual(['2026-08-12', '2026-08-15'])
  })

  it('records what was logged, and its tonnage', () => {
    const out = calendarDays(WEEK, [{ date: '2026-08-10', volumeKg: 9200 }], schedule)
    const mon = out.find((x) => x.d === '2026-08-10')!
    expect(mon.logged).toBe(true)
    expect(mon.volumeKg).toBe(9200)
  })

  it('sums two sessions on one date rather than letting the second win', () => {
    const out = calendarDays(WEEK, [
      { date: '2026-08-10', volumeKg: 9200 },
      { date: '2026-08-10', volumeKg: 1800 },
    ], schedule)
    expect(out.find((x) => x.d === '2026-08-10')!.volumeKg).toBe(11000)
  })

  it('logs a session with no tonnage as trained, volume null — not zero', () => {
    // "Trained, tonnage unknown" and "trained nothing" are different days.
    const out = calendarDays(WEEK, [{ date: '2026-08-10', volumeKg: null }], schedule)
    const mon = out.find((x) => x.d === '2026-08-10')!
    expect(mon.logged).toBe(true)
    expect(mon.volumeKg).toBeNull()
  })

  it('counts a session logged on a REST day — a swap is not an error', () => {
    const out = calendarDays(WEEK, [{ date: '2026-08-12', volumeKg: 5000 }], schedule)
    const wed = out.find((x) => x.d === '2026-08-12')!
    expect(wed.scheduled).toBe(false)
    expect(wed.logged).toBe(true)
  })
})

describe('streakFrom', () => {
  const cal = (loggedDates: string[]) => calendarDays(
    WEEK, loggedDates.map((d) => ({ date: d, volumeKg: 1000 })), schedule)

  it('does NOT break on a scheduled rest day', () => {
    // The whole reason this is not a raw consecutive-day count: Wed and Sat rest,
    // so a calendar-day streak could never exceed 3.
    const days = cal(['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-13', '2026-08-14'])
    expect(streakFrom(days, '2026-08-14').current).toBe(5)
  })

  it('breaks on a scheduled day that was missed', () => {
    const days = cal(['2026-08-09', '2026-08-10', '2026-08-13', '2026-08-14'])   // Tue missed
    expect(streakFrom(days, '2026-08-14').current).toBe(2)
  })

  it('does not count TODAY against you before you have trained it', () => {
    // A training day still in progress is not a miss.
    const days = cal(['2026-08-09', '2026-08-10', '2026-08-11'])
    expect(streakFrom(days, '2026-08-13').current).toBe(3)
  })

  it('counts today once it IS logged', () => {
    const days = cal(['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-13'])
    expect(streakFrom(days, '2026-08-13').current).toBe(4)
  })

  it('ignores scheduled days still in the future', () => {
    const days = cal(['2026-08-09', '2026-08-10'])
    expect(streakFrom(days, '2026-08-10').current).toBe(2)
  })

  it('reports the BEST run, which can exceed the current one', () => {
    const days = cal(['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-14'])   // Thu missed
    const { current, best } = streakFrom(days, '2026-08-14')
    expect(current).toBe(1)
    expect(best).toBe(3)
  })

  it('is 0/0 on an empty history rather than throwing', () => {
    expect(streakFrom([], '2026-08-14')).toEqual({ current: 0, best: 0 })
    expect(streakFrom(cal([]), '2026-08-14')).toEqual({ current: 0, best: 0 })
  })

  it('ignores rest days entirely, logged or not', () => {
    const days = cal(['2026-08-12'])   // a Wednesday session and nothing else
    expect(streakFrom(days, '2026-08-14').current).toBe(0)
  })
})

describe('weeklyVolume', () => {
  const wk = (d: string) => weekStartOf(d, 0)

  it('buckets by week start, oldest first', () => {
    const out = weeklyVolume([
      { date: '2026-08-10', volumeKg: 9000 },
      { date: '2026-08-14', volumeKg: 3000 },
      { date: '2026-08-03', volumeKg: 5000 },
    ], wk, 8)
    expect(out).toEqual([
      { d: '2026-08-02', v: 5000 },
      { d: '2026-08-09', v: 12000 },
    ])
  })

  it('omits a week with no sessions — that is a real gap, not a zero', () => {
    const out = weeklyVolume([
      { date: '2026-08-10', volumeKg: 9000 },
      { date: '2026-07-27', volumeKg: 4000 },
    ], wk, 8)
    expect(out.map((p) => p.d)).toEqual(['2026-07-26', '2026-08-09'])
  })

  it('keeps only the newest `limit` weeks', () => {
    const rows = ['2026-06-07', '2026-06-14', '2026-06-21', '2026-06-28']
      .map((date) => ({ date, volumeKg: 1000 }))
    expect(weeklyVolume(rows, wk, 2).map((p) => p.d)).toEqual(['2026-06-21', '2026-06-28'])
  })

  it('treats a session with no tonnage as 0 within a week that happened', () => {
    const out = weeklyVolume([
      { date: '2026-08-10', volumeKg: null },
      { date: '2026-08-11', volumeKg: 2000 },
    ], wk, 8)
    expect(out).toEqual([{ d: '2026-08-09', v: 2000 }])
  })
})
