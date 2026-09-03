/**
 * The Sleep Debt Bank — PURE, extracted from `useSleepDebt` so the decay can be
 * vectored and ported. The clock is INJECTED: `weekAgoISO` is the date before
 * which a night's debt decays.
 */
import { logicalDaysAgoISO } from '@/lib/utils/day'

export interface SleepDebt {
  debtHours: number          // cumulative decayed shortfall vs goal (≥ 0)
  nights: number             // nights with data in the window
  worstNightMin: number | null
  goalHours: number
}

export const SLEEP_DEBT_WINDOW_DAYS = 14
export const SLEEP_DEBT_WEEKLY_DECAY = 0.75  // last week's debt keeps 75% weight

/**
 * Decayed cumulative shortfall vs the goal over a 14-night window. Surplus
 * nights repay debt but never bank "credit" below zero. Nights before
 * `weekAgoISO` decay by SLEEP_DEBT_WEEKLY_DECAY.
 */
export function computeSleepDebt(
  nights: Array<{ date: string; sleepMinutes: number | null }>,
  goalHours: number,
  weekAgoISO: string = logicalDaysAgoISO(7),
): SleepDebt {
  const withData = nights.filter((n) => n.sleepMinutes != null && n.sleepMinutes > 0)
  // Oldest → newest so decay applies chronologically.
  const asc = [...withData].sort((a, b) => a.date.localeCompare(b.date))
  let debt = 0
  let worst: number | null = null
  for (const n of asc) {
    const mins = n.sleepMinutes as number
    if (worst == null || mins < worst) worst = mins
    const deltaH = goalHours - mins / 60          // + = shortfall, − = surplus
    const weight = n.date < weekAgoISO ? SLEEP_DEBT_WEEKLY_DECAY : 1
    debt = Math.max(0, debt + deltaH * weight)    // surplus repays, never banks credit
  }
  return { debtHours: Math.round(debt * 10) / 10, nights: withData.length, worstNightMin: worst, goalHours }
}

/** The gauge's hue band: ember to 2 h, gold to 5 h, oxide beyond. */
export function debtBand(debtHours: number): 'ember' | 'gold' | 'oxide' {
  if (debtHours <= 2) return 'ember'
  if (debtHours <= 5) return 'gold'
  return 'oxide'
}
