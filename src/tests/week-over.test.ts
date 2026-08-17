import { describe, it, expect } from 'vitest'
import { isWeekComplete, isoAddDays, weekStartOf } from '@/lib/utils/week'

/**
 * WHEN IS A WEEK OVER.
 *
 * This file has been wrong twice, in the same direction both times, and the
 * history is the point:
 *
 *   · first the dashboard CTA fired on `weekday === 5` — Friday. That 5 was
 *     reasoning about Legs B, the last TRAINING day, which is a fact about the
 *     plan and not about the calendar;
 *   · then it fired on `today >= weekStart + 6` — Saturday, the week's final
 *     day. Closer, still early: a day with hours left in it is a day that can
 *     still have a session logged into it, so the "week complete" summary was
 *     describing a week that was still changing.
 *
 * A week is over when it is OVER: strictly after its final day, which is the
 * midnight that opens the next one. That instant is `weekStart + 7`, and
 * `isWeekComplete` expresses it as `today > weekStart + 6` — the same boundary
 * from the other side, and the form the Pathfinder capsules already used.
 *
 * Week of 2026-08-09 (Sunday) → Sun 09 … Sat 15, over at 00:00 on Sun 16.
 */
describe('isWeekComplete', () => {
  const SUNDAY_WEEK = '2026-08-09'

  it('is false on Friday', () => {
    expect(isWeekComplete(SUNDAY_WEEK, '2026-08-14')).toBe(false)
  })

  it('is FALSE on Saturday — the week is running until midnight', () => {
    expect(isWeekComplete(SUNDAY_WEEK, '2026-08-15')).toBe(false)
  })

  it('is true on Sunday, the first day of the next week', () => {
    expect(isWeekComplete(SUNDAY_WEEK, '2026-08-16')).toBe(true)
  })

  it('is false on every day of the week itself', () => {
    for (let i = 0; i < 7; i++) {
      expect(isWeekComplete(SUNDAY_WEEK, isoAddDays(SUNDAY_WEEK, i))).toBe(false)
    }
  })

  /**
   * "Week starts on" is a real setting. A Monday-start week ends on Sunday and
   * is over on the Monday — which follows for free, because the week START is
   * passed in rather than a weekday being hardcoded.
   */
  it('follows a Monday-start week', () => {
    const MONDAY_WEEK = '2026-08-10'
    expect(isWeekComplete(MONDAY_WEEK, '2026-08-16')).toBe(false)  // Sunday, the final day
    expect(isWeekComplete(MONDAY_WEEK, '2026-08-17')).toBe(true)   // Monday, over
  })

  it('stays true well past the boundary rather than being a single instant', () => {
    expect(isWeekComplete(SUNDAY_WEEK, '2026-09-01')).toBe(true)
  })
})

/**
 * The dashboard card's own window. It reviews the week that just concluded, and
 * `weekStartOf(today) - 7` is that week — so the two must agree that on the
 * first day of a new week, the previous one is complete. This is the join the
 * card depends on, and it is a property of the helpers, not of the component.
 */
describe('the concluded week the summary card reviews', () => {
  for (const startDay of [0, 1]) {
    it(`is complete on the first day of the new week (startDay ${startDay})`, () => {
      const firstDayOfNewWeek = startDay === 0 ? '2026-08-16' : '2026-08-17'
      const thisWeekStart = weekStartOf(firstDayOfNewWeek, startDay)

      expect(thisWeekStart).toBe(firstDayOfNewWeek)          // today IS the boundary
      expect(isWeekComplete(isoAddDays(thisWeekStart, -7), firstDayOfNewWeek)).toBe(true)
    })

    it(`is not complete a day earlier (startDay ${startDay})`, () => {
      const finalDay = startDay === 0 ? '2026-08-15' : '2026-08-16'
      const thisWeekStart = weekStartOf(finalDay, startDay)

      expect(thisWeekStart).not.toBe(finalDay)               // still mid-week
      expect(isWeekComplete(thisWeekStart, finalDay)).toBe(false)
    })
  }
})
