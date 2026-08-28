import { describe, it, expect } from 'vitest'
import { consistencyWindow } from '@/components/dashboard/widgets/PlanWidgets'

/**
 * The consistency widget graded a window it did not draw.
 *
 * It built `weeks * 7 + 7` days and handed them to a `Heatmap` that renders
 * exactly `weeks` week-aligned columns ending on today — so at 52 weeks the
 * headline "% kept" was computed over 371 days while the grid showed between
 * 358 and 364. Up to a fortnight of history counted toward the number and
 * appeared nowhere in the picture, which is the worst shape a discrepancy can
 * take: the figure nobody can check disagrees with the figure everybody can.
 *
 * `consistencyWindow` is the single answer both now read.
 */
describe('consistencyWindow — the grid grades what it draws', () => {
  /** What `Heatmap` actually renders: it winds back to the Sunday opening the
   *  earliest column, then draws `weeks × 7` cells ending on the current week. */
  function cellsCoveringToday(weeks: number, todayISO: string): number {
    const dow = new Date(`${todayISO}T12:00:00Z`).getUTCDay()
    // (weeks - 1) whole weeks behind, plus this week up to and including today.
    return (weeks - 1) * 7 + dow + 1
  }

  const SUNDAY = '2026-08-23'
  const THURSDAY = '2026-08-27'
  const SATURDAY = '2026-08-29'

  it('matches the grid on every weekday, at every size', () => {
    for (const weeks of [12, 26, 52]) {
      for (const today of [SUNDAY, THURSDAY, SATURDAY]) {
        expect(consistencyWindow(weeks, today)).toBe(cellsCoveringToday(weeks, today))
      }
    }
  })

  it('is never the old over-count', () => {
    // 52 * 7 + 7 = 371, against 357–363 actually drawn.
    for (const today of [SUNDAY, THURSDAY, SATURDAY]) {
      expect(consistencyWindow(52, today)).toBeLessThan(52 * 7 + 7)
    }
  })

  it('shortens as the week does — a Sunday window is six days shorter than a Saturday one', () => {
    expect(consistencyWindow(26, SATURDAY) - consistencyWindow(26, SUNDAY)).toBe(6)
  })

  it('always ends on today, so the newest column is the live week', () => {
    // The remainder past the whole weeks is exactly today's weekday index + 1.
    expect(consistencyWindow(12, SUNDAY) % 7).toBe(1)     // Sunday → 1 day of this week
    expect(consistencyWindow(12, SATURDAY) % 7).toBe(0)   // Saturday → a full 7
  })
})
