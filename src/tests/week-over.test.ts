import { describe, it, expect } from 'vitest'
import { isWeekOver } from '@/components/dashboard/WeeklySummaryCard'

/**
 * The week-complete CTA used to be `weekday === 5` — Friday. Weeks are
 * Sunday-anchored (`WEEK0_START = '2026-07-12'` is a Sunday), so a Sunday-start
 * week ENDS on Saturday and the card announced a complete week with a whole day
 * of it still to run. The 5 was reasoning about Legs B, the last TRAINING day,
 * which is a fact about the plan and not about the calendar.
 *
 * Week of 2026-08-09 (Sunday) → Sun 09 … Sat 15.
 */
describe('isWeekOver', () => {
  const SUNDAY_WEEK = '2026-08-09'

  it('is FALSE on Friday — the bug', () => {
    expect(isWeekOver(SUNDAY_WEEK, '2026-08-14')).toBe(false)
  })

  it('is TRUE on Saturday, the week’s final day', () => {
    expect(isWeekOver(SUNDAY_WEEK, '2026-08-15')).toBe(true)
  })

  it('is false on every earlier day of the week', () => {
    for (const d of ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']) {
      expect(isWeekOver(SUNDAY_WEEK, d)).toBe(false)
    }
  })

  /**
   * "Week starts on" is a real setting. A Monday-start week ends on Sunday, and
   * the card must follow the preference rather than a hardcoded weekday — which
   * it does for free, because the week START is passed in.
   */
  it('follows a Monday-start week to its Sunday end', () => {
    const MONDAY_WEEK = '2026-08-10'
    expect(isWeekOver(MONDAY_WEEK, '2026-08-15')).toBe(false)  // Saturday, still mid-week
    expect(isWeekOver(MONDAY_WEEK, '2026-08-16')).toBe(true)   // Sunday, the final day
  })

  /**
   * `>=`, not `===`. The caller recomputes `weekStartOf(today)` every render, so
   * a date past the end belongs to the NEXT week and this is asked again with a
   * new start — but a clock that jumps must not be able to skip the window
   * entirely and leave the card never having appeared.
   */
  it('stays true past the final day rather than skipping the window', () => {
    expect(isWeekOver(SUNDAY_WEEK, '2026-08-16')).toBe(true)
  })
})
