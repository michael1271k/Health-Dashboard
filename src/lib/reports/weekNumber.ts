import { weekStartOf } from '@/lib/utils/week'
import { getWeekPhase } from '@/lib/phases'

/**
 * Week 0 = the week containing Jul 15–18 2026 (Sunday-anchored start 2026-07-12).
 *
 * Week 0 is not an off-by-one — it is a real, PARTIAL week. The block opened on
 * a Wednesday, so its first four days are not a week of training and are not
 * counted as one. Everything downstream of this constant inherits that, which is
 * the whole reason there is exactly one counter (see `programWeekNumber`).
 */
export const WEEK0_START = '2026-07-12'

/**
 * Program week number for a week-start (Week 0 = 2026-07-12, then +1/week).
 *
 * TOTAL: an unparseable date yields 0 rather than NaN. `weekStartOf` echoes
 * input it cannot parse, so a bad date reaches here intact, and NaN rendered
 * into a badge reads as "Week NaN" on a page that otherwise still works.
 */
export function weekNumberOf(weekStartISO: string): number {
  const a = Date.parse(`${WEEK0_START}T00:00:00Z`)
  const b = Date.parse(`${weekStartISO}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
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
 * THE program week for a date — the ONE counter, shared by the dashboard badge,
 * the analytics header and the Momentum timeline.
 *
 * There used to be a second, independent `planWeekNumber` that counted 1-based
 * from `user_goals.phase_started_on` (falling back to HELIX_CUT_START). It
 * disagreed with Momentum by exactly one and always would have, for a reason no
 * fallback could fix: **the block opened mid-week.** Training began Wed
 * 2026-07-15, so the first week is a half week — Momentum calls it Week 0 and
 * counts full weeks after it, while a 1-based count from the same Sunday calls
 * that half week "Week 1" and every week since is off by one. On 2026-08-03 the
 * dashboard read Wk 4 against Momentum's Week 3.
 *
 * Two counters for one concept is one counter too many, so the plan-relative one
 * is gone. `phase_started_on` is deliberately NOT consulted: a number that
 * silently rebases when a plan is picked in Settings cannot also be the number
 * the timeline is labelled with, and the timeline is the one the athlete reads.
 *
 * BOUNDARIES ARE THE USER'S. `weekStartOf` reads the configured first day of the
 * week (Settings → "Week starts on", mirrored from `user_goals.week_end_day`),
 * so the result is a pure function of the calendar: it changes at 00:00 on the
 * chosen first day and at no other instant. Callers pass the CURRENT logical
 * date and `useLogicalDate` re-renders them exactly at local midnight.
 */
export function programWeekNumber(todayISO: string): number {
  return weekNumberForDate(todayISO)
}
