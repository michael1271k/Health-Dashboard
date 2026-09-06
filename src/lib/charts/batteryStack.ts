/**
 * The battery, taken apart: what the night charged and what the day spent.
 *
 * ── WHY A STACK AND NOT A LINE ───────────────────────────────────────────────
 * A battery percentage is one number and it is the answer to the wrong
 * question. "62 %" tells you where you are; it does not tell you whether you
 * are there because you slept badly or because the week's load is finally
 * showing, and those two have opposite answers today. v9 computes five drains
 * separately (`batteryBreakdown`) and then throws four of them away at the
 * point of render. This puts them back: the charge line is what the night was
 * worth, and the bands under it are where it went.
 *
 * ── THE FLOOR IS WHY THE SUM DOES NOT ALWAYS CLOSE ───────────────────────────
 * `currentPct` is `clamp(charge − Σdrains, floor, 100)`, so on a day whose
 * drains exceed the charge the reading sits on the floor and the stack is
 * taller than the gap it explains. That is not an error to hide — it is the day
 * saying the model ran out of room — so `totalDrain` is reported raw and the
 * face draws the overflow rather than scaling it away.
 */

import { isoAddDays } from '@/lib/utils/week'
import type { BatteryBreakdown } from '@/lib/scoring/battery'

/** Stacking order, bottom to top: the involuntary drains first, then the ones
 *  you chose, then the ones your body is reporting. */
export const BATTERY_DRAIN_KEYS = ['time', 'activity', 'workout', 'load', 'wellness'] as const
export type BatteryDrainKey = (typeof BATTERY_DRAIN_KEYS)[number]

export interface BatteryStackDayIn {
  date: string
  /** `daily_scores.battery_pct` — what the day was actually stored as. */
  batteryPct: number | null
  /** The v9 breakdown, when the day was scored with one. */
  breakdown: BatteryBreakdown | null
}

export interface BatteryStackDay {
  d: string
  /** The morning charge the drains come off. Null on an unscored day. */
  charge: number | null
  /** Each drain, floored at zero — a negative drain is a recharge and v9 has none. */
  drains: Record<BatteryDrainKey, number>
  /** The five, summed, BEFORE the floor and ceiling. Null on an unscored day. */
  totalDrain: number | null
  /** The stored reading. Not `charge − totalDrain`: see the header. */
  batteryPct: number | null
  /** Nothing was scored for this day. The face draws a gap, never a zero. */
  empty: boolean
}

export interface BatteryStackOptions {
  endingOn: string
  /** How many days the face draws. */
  limit?: number
}

const EMPTY_DRAINS: Record<BatteryDrainKey, number> = {
  time: 0, activity: 0, workout: 0, load: 0, wellness: 0,
}

/** One day's bands, floored. */
export function batteryStackDay(day: BatteryStackDayIn | undefined, date: string): BatteryStackDay {
  const b = day?.breakdown
  if (!b) {
    return {
      d: date,
      charge: null,
      drains: { ...EMPTY_DRAINS },
      totalDrain: null,
      batteryPct: day?.batteryPct ?? null,
      empty: day?.batteryPct == null,
    }
  }
  const drains = {} as Record<BatteryDrainKey, number>
  for (const key of BATTERY_DRAIN_KEYS) {
    const v = b.drains[key]
    drains[key] = Number.isFinite(v) ? Math.max(0, Math.round(v * 10) / 10) : 0
  }
  return {
    d: date,
    charge: Math.round(b.charge.morningCharge * 10) / 10,
    drains,
    totalDrain: Math.round(b.drains.total * 10) / 10,
    batteryPct: day?.batteryPct ?? Math.round(b.currentPct),
    empty: false,
  }
}

/**
 * Exactly `limit` days ending on `endingOn`, oldest first. A day nothing was
 * scored for is present and empty, never absent — a stack with holes closed up
 * would draw a fortnight as though it were ten days.
 */
export function batteryStackSeries(days: BatteryStackDayIn[], options: BatteryStackOptions): BatteryStackDay[] {
  const { endingOn, limit = 14 } = options
  if (limit <= 0) return []
  const byDate = new Map(days.map((d) => [d.date, d]))
  const out: BatteryStackDay[] = []
  for (let i = limit - 1; i >= 0; i--) {
    const date = isoAddDays(endingOn, -i)
    out.push(batteryStackDay(byDate.get(date), date))
  }
  return out
}
