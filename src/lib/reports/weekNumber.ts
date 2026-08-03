import { weekStartOf } from '@/lib/utils/week'
import { getWeekPhase } from '@/lib/phases'
import { HELIX_CUT_START } from '@/lib/programs'

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
 * unchanged. This counts from the first day of the week the plan started
 * (`user_goals.phase_started_on`), so choosing a plan puts you in Week 1 the
 * moment it is saved.
 *
 * A NULL START FALLS BACK TO THE PROGRAM ERA, not to 1. `phase_started_on` is
 * only stamped when a plan is picked in Settings; an account that has simply
 * been training since the block opened has never written it, and the old
 * `return 1` made the badge read "Wk 1" forever — indistinguishable from a real
 * first week and the reason the dashboard looked hardcoded. HELIX_CUT_START is
 * when this block actually began, which is the honest answer to "which week am
 * I in" when nothing more specific was recorded.
 *
 * BOUNDARIES ARE THE USER'S. Both dates are collapsed to their week start via
 * `weekStartOf`, which reads the configured first day of the week (Settings →
 * "Week starts on", mirrored from `user_goals.week_end_day`). The number is
 * therefore a pure function of two calendar dates: it changes at 00:00 on the
 * chosen first day and at no other instant. Callers pass the CURRENT logical
 * date; `useLogicalDate` re-renders them exactly at local midnight.
 *
 * Clamped at 1: a plan whose start date is in the future reads as Week 1 rather
 * than Week 0 or a negative.
 */
export function planWeekNumber(planStartISO: string | null | undefined, todayISO: string): number {
  const a = Date.parse(`${weekStartOf(planStartISO || HELIX_CUT_START)}T00:00:00Z`)
  const b = Date.parse(`${weekStartOf(todayISO)}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1
  return Math.max(1, Math.round((b - a) / (7 * 86_400_000)) + 1)
}
