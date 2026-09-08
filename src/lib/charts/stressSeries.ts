/**
 * The stress index over a fortnight — `BatteryStackSeries`' shape, for the
 * Trends series and the Pulse tile's sparkline (Phase 3 E3, U5).
 *
 * Computed on read: v1 stores no column (`docs/STRESS_MODEL.md` §6), so the
 * caller hands in one `stressBreakdown` per scored day and this lays them on
 * exactly `limit` consecutive days ending on `endingOn`. A day with no reading
 * is present and EMPTY, never absent — a sparkline with holes closed up would
 * draw a fortnight as though it were ten days, and the stress line's whole
 * point is when the days were.
 */

import { isoAddDays } from '@/lib/utils/week'
import type { StressBand, StressBreakdown, StressTermKey } from '@/lib/scoring/stress'

export const STRESS_TERM_KEYS: readonly StressTermKey[] = ['auto', 'sleep', 'self', 'load']

export interface StressDayIn {
  date: string
  breakdown: StressBreakdown | null
}

export interface StressDay {
  d: string
  /** The index, 10–90. Null on a day with no reading. */
  index: number | null
  band: StressBand | null
  /** Each term's z, one decimal; null where the term was unanswered. */
  terms: Record<StressTermKey, number | null>
  /** Nothing was computed for this day. The face draws a gap, never a zero. */
  empty: boolean
}

export interface StressSeriesOptions {
  endingOn: string
  /** How many days the face draws. */
  limit?: number
}

const EMPTY_TERMS: Record<StressTermKey, number | null> = { auto: null, sleep: null, self: null, load: null }

/** One day's reading, rounded for the face. */
export function stressDay(day: StressDayIn | undefined, date: string): StressDay {
  const b = day?.breakdown
  if (!b || b.index == null) {
    return { d: date, index: null, band: null, terms: { ...EMPTY_TERMS }, empty: true }
  }
  const terms = {} as Record<StressTermKey, number | null>
  for (const key of STRESS_TERM_KEYS) {
    const z = b.terms[key].z
    terms[key] = z != null && Number.isFinite(z) ? Math.round(z * 10) / 10 : null
  }
  return { d: date, index: b.index, band: b.band, terms, empty: false }
}

/** Exactly `limit` days ending on `endingOn`, oldest first. */
export function stressSeries(days: StressDayIn[], options: StressSeriesOptions): StressDay[] {
  const { endingOn, limit = 14 } = options
  if (limit <= 0) return []
  const byDate = new Map(days.map((d) => [d.date, d]))
  const out: StressDay[] = []
  for (let i = limit - 1; i >= 0; i--) {
    const date = isoAddDays(endingOn, -i)
    out.push(stressDay(byDate.get(date), date))
  }
  return out
}
