/**
 * What the energy ledger predicted against what the scale actually did.
 *
 * ── TWO NUMBERS THAT DISAGREE ON PURPOSE ─────────────────────────────────────
 * The ledger sums `intake − TDEE` and divides by 7,700 kcal/kg. The scale
 * measures a weight. They disagree — always — because water, glycogen and gut
 * content move faster than fat does, and the honest thing for a surface to do
 * is show both rather than pick the one that flatters the week. `gapKg` is the
 * disagreement, stated, and it is the only figure here worth acting on: a
 * ledger that says −0.5 kg a week against a scale that says −0.1 kg for a month
 * is either a mis-measured intake or an active-energy estimate that is too
 * generous, and neither is visible from either number alone.
 *
 * ── AND WHY A DAY WITH A HOLE CONTRIBUTES NOTHING ────────────────────────────
 * `tdeeKcal` is null unless BMR, active energy AND intake are all present
 * (`src/lib/nutrition/energy.ts`), deliberately: a missing active-energy sync
 * treated as zero reports a ~400 kcal larger deficit than the day earned, in
 * the same direction every time it happens, so the error accumulates rather
 * than averaging out. Every week therefore says how many days it is actually
 * summing, and the tile has to print it.
 */

import { isoAddDays, weekStartOf } from '@/lib/utils/week'
import { tdeeKcal } from '@/lib/nutrition/energy'

/** 7,700 kcal per kilogram of body fat — the standard energy-density figure. */
export const KCAL_PER_KG = 7700

export interface DeficitDayIn {
  date: string
  /** `nutrition_entries` daily total. */
  intakeKcal: number | null
  /** `daily_logs.bmr`. */
  bmrKcal: number | null
  /** `daily_logs.active_energy`. */
  activeKcal: number | null
  /** The morning's reading, already through `validWeight`. */
  weightKg: number | null
}

export interface DeficitWeek {
  weekStart: string
  /** Days with intake AND expenditure. The denominator the bar is honest about. */
  daysCounted: number
  /** Sum of `intake − TDEE` over the counted days. Negative is a deficit. */
  balanceKcal: number | null
  /** `balanceKcal / 7700`, two decimals. Negative is a predicted loss. */
  expectedKg: number | null
  /**
   * The last reading of this week against the last reading of the newest
   * EARLIER week that had one — not first-to-last inside the week, which
   * reports nothing at all for the many weeks holding a single weigh-in.
   * (`HistoryWeeks.capsules` compares weeks the same way, for the same reason.)
   */
  measuredKg: number | null
}

export interface DeficitLedger {
  /** Exactly `weeks` weeks, oldest first. */
  weeks: DeficitWeek[]
  daysCounted: number
  /** Every counted day in the window. */
  totalBalanceKcal: number | null
  expectedKg: number | null
  /** Last reading in the window minus the first. */
  measuredKg: number | null
  /**
   * `measured − expected`. Positive means the scale moved LESS than the ledger
   * said it would — the usual direction, and the one worth explaining.
   */
  gapKg: number | null
}

export interface DeficitLedgerOptions {
  endingOn: string
  weeks?: number
  startDay?: number
}

/** `intake − TDEE` for one day, or null when either side is missing. */
export function dayBalanceKcal(day: DeficitDayIn): number | null {
  const tdee = tdeeKcal(day.bmrKcal, day.activeKcal, day.intakeKcal)
  if (day.intakeKcal == null || tdee == null) return null
  return Math.round(day.intakeKcal - tdee)
}

/** kcal → kg at 7,700, two decimals. Null in, null out. */
export function kcalToKg(balance: number | null): number | null {
  return balance == null ? null : Math.round((balance / KCAL_PER_KG) * 100) / 100
}

export function deficitLedgerSeries(days: DeficitDayIn[], options: DeficitLedgerOptions): DeficitLedger {
  const { endingOn, weeks = 8, startDay = 0 } = options
  const byDate = new Map(days.map((d) => [d.date, d]))
  const lastStart = weekStartOf(endingOn, startDay)

  const out: DeficitWeek[] = []
  // The weight the NEXT week is compared against: the newest reading seen so
  // far, carried across weeks that have none. A week with no weigh-in has no
  // delta and must not silently borrow the one before it.
  let previousWeight: number | null = null
  let firstWeight: number | null = null
  let lastWeight: number | null = null

  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = weekStartOf(isoAddDays(lastStart, -7 * w), startDay)
    let counted = 0
    let balance = 0
    let weekWeight: number | null = null

    for (let i = 0; i < 7; i++) {
      const date = isoAddDays(weekStart, i)
      if (date > endingOn) break
      const day = byDate.get(date)
      if (!day) continue
      const dayBalance = dayBalanceKcal(day)
      if (dayBalance != null) {
        counted += 1
        balance += dayBalance
      }
      if (day.weightKg != null) {
        weekWeight = day.weightKg
        if (firstWeight == null) firstWeight = day.weightKg
        lastWeight = day.weightKg
      }
    }

    const balanceKcal = counted > 0 ? balance : null
    const measuredKg = weekWeight != null && previousWeight != null
      ? Math.round((weekWeight - previousWeight) * 100) / 100
      : null
    if (weekWeight != null) previousWeight = weekWeight

    out.push({ weekStart, daysCounted: counted, balanceKcal, expectedKg: kcalToKg(balanceKcal), measuredKg })
  }

  const daysCounted = out.reduce((a, w) => a + w.daysCounted, 0)
  const totalBalanceKcal = daysCounted > 0 ? out.reduce((a, w) => a + (w.balanceKcal ?? 0), 0) : null
  const expectedKg = kcalToKg(totalBalanceKcal)
  const measuredKg = firstWeight != null && lastWeight != null
    ? Math.round((lastWeight - firstWeight) * 100) / 100
    : null

  return {
    weeks: out,
    daysCounted,
    totalBalanceKcal,
    expectedKg,
    measuredKg,
    gapKg: measuredKg != null && expectedKg != null
      ? Math.round((measuredKg - expectedKg) * 100) / 100
      : null,
  }
}
