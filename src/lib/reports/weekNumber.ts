import { weekStartOf } from '@/lib/utils/week'
import { getWeekPhase } from '@/lib/phases'

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

/**
 * Human timeline label for a week. Helix-era weeks number globally from Week 0
 * (2026-07-12) → "Week 0", "Week 1", … A pre-Week-0 week (PPL Bulk/Cut/Peak,
 * the Thailand deload) would compute a NEGATIVE weekNumberOf, so those draw
 * their label from the phase config instead — "PPL Bulk · Week 4", "Peak Week
 * (Maintenance)", "Thailand Vacation (Deload)". This is why old PPL reports no
 * longer show "Week -18".
 */
export function weekLabelOf(weekStartISO: string): string {
  const n = weekNumberOf(weekStartISO)
  if (n >= 0) return `Week ${n}`
  return getWeekPhase(weekStartISO)?.label ?? `Week ${n}`
}

/**
 * Week number WITHIN THE ACTIVE PLAN — 1-based, resetting when the plan changes.
 *
 * The analytics header used to read "Week 31", which is the ISO CALENDAR week.
 * It is a true number about the year and a useless one about training: nothing
 * in the app is on its 31st week, and picking a new plan in Settings left it
 * unchanged. This counts from the Sunday of the week the plan started
 * (`user_goals.phase_started_on`), so choosing a plan puts you in Week 1 the
 * moment it is saved.
 *
 * Clamped at 1: a plan whose start date is in the future (or a missing column)
 * reads as Week 1 rather than Week 0 or a negative.
 */
export function planWeekNumber(planStartISO: string | null | undefined, todayISO: string): number {
  if (!planStartISO) return 1
  const a = Date.parse(`${weekStartOf(planStartISO)}T00:00:00Z`)
  const b = Date.parse(`${weekStartOf(todayISO)}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1
  return Math.max(1, Math.round((b - a) / (7 * 86_400_000)) + 1)
}
