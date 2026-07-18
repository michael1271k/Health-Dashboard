import { weekStartOf } from '@/lib/hooks/useWeekSessions'

/** Week 0 = the week containing Jul 15–18 2026 (Sunday-anchored start 2026-07-12). */
export const WEEK0_START = '2026-07-12'

/** Program week number for a Sunday week-start (Week 0 = 2026-07-12, then +1/week). */
export function weekNumberOf(weekStartISO: string): number {
  const a = new Date(`${WEEK0_START}T00:00:00Z`).getTime()
  const b = new Date(`${weekStartISO}T00:00:00Z`).getTime()
  return Math.round((b - a) / (7 * 86_400_000))
}

/** Week number for any date. */
export function weekNumberForDate(dateISO: string): number {
  return weekNumberOf(weekStartOf(dateISO))
}
