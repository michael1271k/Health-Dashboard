import { describe, it, expect } from 'vitest'
import { streakFrom, type StreakDay } from '@/lib/training/streak'
import { monthStartOf, lastDayOfMonth, isoAddDays } from '@/lib/utils/week'

/**
 * THE STREAK MUST SURVIVE A CALENDAR THAT RUNS PAST TODAY.
 *
 * The widget payload's calendar used to be exactly 42 days ending today, which
 * is what the streak wants and what a MONTH grid cannot use — the back half of
 * the current month is in the future and so was simply absent. The window is now
 * the trailing 42 days UNION the current calendar month, and both the streak and
 * the grid read the same array.
 *
 * That makes a property the streak already had load-bearing: a scheduled day
 * that has not happened yet owes nothing. `streakFrom` guards it (`x.d >
 * todayISO` is skipped when walking `current`), but nothing tested it — so the
 * guarantee could have been deleted as a redundant line by anyone tidying, and
 * the widget would have reported a broken streak every single day, because
 * tomorrow is always scheduled and never logged.
 */

const TODAY = '2026-08-16'   // a Sunday

/** Helix-5 trains Sun/Mon/Tue/Thu/Fri; Wed/Sat are Zone-2 rest. */
function day(d: string, logged: boolean): StreakDay {
  const weekday = new Date(`${d}T12:00:00Z`).getUTCDay()
  const scheduled = weekday !== 3 && weekday !== 6
  return { d, scheduled, logged }
}

/** A run of days ending on `TODAY`, every scheduled one of them trained. */
function historyThrough(from: string): StreakDay[] {
  const out: StreakDay[] = []
  for (let d = from; d <= TODAY; d = isoAddDays(d, 1)) out.push(day(d, true))
  return out
}

describe('streakFrom with future days in the window', () => {
  it('answers identically whether or not the window runs past today', () => {
    const past = historyThrough('2026-08-01')
    // The same history, plus the rest of August — scheduled by the plan and
    // logged by nobody, because it has not happened.
    const withFuture = [...past]
    for (let d = isoAddDays(TODAY, 1); d <= lastDayOfMonth(TODAY); d = isoAddDays(d, 1)) {
      withFuture.push(day(d, false))
    }

    expect(withFuture.length).toBeGreaterThan(past.length)
    expect(streakFrom(withFuture, TODAY)).toEqual(streakFrom(past, TODAY))
  })

  it('does not let tomorrow break the current streak', () => {
    const withTomorrow = [
      ...historyThrough('2026-08-10'),
      day('2026-08-17', false),   // a Monday: scheduled, unlogged, in the future
    ]
    // Aug 10–16 is Mon Tue Thu Fri Sun trained (Wed and Sat are rest) = 5.
    expect(streakFrom(withTomorrow, TODAY).current).toBe(5)
  })

  it('does not let a future day lower the best run', () => {
    const past = historyThrough('2026-08-01')
    const best = streakFrom(past, TODAY).best
    const withFuture = [...past, day('2026-08-17', false), day('2026-08-18', false)]
    expect(streakFrom(withFuture, TODAY).best).toBe(best)
  })

  it('still breaks on a MISSED scheduled day in the past', () => {
    // The guard is about the future, not about forgiveness.
    const days = [...historyThrough('2026-08-10')]
    const thursday = days.findIndex((x) => x.d === '2026-08-13')
    days[thursday] = { ...days[thursday], logged: false }
    // Only Fri and Sun remain after the break.
    expect(streakFrom(days, TODAY).current).toBe(2)
  })
})

describe('the month window helpers', () => {
  it('finds the first and last day of an ordinary month', () => {
    expect(monthStartOf('2026-08-16')).toBe('2026-08-01')
    expect(lastDayOfMonth('2026-08-16')).toBe('2026-08-31')
  })

  it('gets February right in both a common and a leap year', () => {
    // Derived from Date rather than a table, so this is really asserting that
    // the day-0-of-next-month trick holds.
    expect(lastDayOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(lastDayOfMonth('2028-02-10')).toBe('2028-02-29')
  })

  it('handles the 30-day months and December', () => {
    expect(lastDayOfMonth('2026-04-01')).toBe('2026-04-30')
    expect(lastDayOfMonth('2026-12-25')).toBe('2026-12-31')
  })

  it('echoes an unparseable date rather than throwing', () => {
    // Same totality rule as `weekStartOf`: a bad date in a render path must not
    // take the surface down with it.
    expect(lastDayOfMonth('not-a-date')).toBe('not-a-date')
  })
})
