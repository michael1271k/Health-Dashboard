/**
 * The volume chart's buckets — PURE, extracted from `VolumeChart` so the
 * swap-safe resolution can be vectored and ported.
 */
import type { SplitDay } from '@/lib/types/workout'

// Chart buckets. HELIX-only pseudo-splits resolved by weekday: 'upper_a'/'upper_b'
// (both DB split_day='upper', Sun vs Thu), 'arms' (Delts & Arms, also DB 'upper',
// Tue) and 'legs_a'/'legs_b' (Legs A/B, both DB split_day='legs', Mon vs Fri).
export type ChartSplit = SplitDay | 'upper_a' | 'upper_b' | 'arms' | 'legs_a' | 'legs_b'

// The pill set is era-specific. PPL trains Push/Pull/Legs (no "Upper" — zero
// records); HELIX-5 logs the five real splits. Legacy "lower" folds into legs.
// `all` is the UNION, so the worst an 'all' caller can do is offer more pills
// than it has data for — visible and harmless — instead of naming a plan that
// ended in July and drawing an empty curve.
const AXIS_SPLITS: ChartSplit[] = ['upper_a', 'upper_b', 'arms', 'legs_a', 'legs_b']
const PPL_SPLITS: ChartSplit[] = ['push', 'pull', 'legs']
export const SPLITS_FOR_ERA: Record<'all' | 'ppl' | 'axis', ChartSplit[]> = {
  all: [...AXIS_SPLITS, ...PPL_SPLITS],
  ppl: PPL_SPLITS,
  axis: AXIS_SPLITS,
}

export const splitLabel = (s: ChartSplit): string => {
  if (s === 'upper_a') return 'Upper A'
  if (s === 'upper_b') return 'Upper B'
  if (s === 'arms') return 'Delts & Arms'
  if (s === 'legs_a') return 'Legs & Core A'
  if (s === 'legs_b') return 'Legs & Core B'
  if (s === 'legs') return 'Legs'
  return s[0].toUpperCase() + s.slice(1)
}

/**
 * The program day a session RECORDED for itself → its chart bucket.
 *
 * `day_key` is the workout's own identity, written at commit time from whatever
 * the schedule actually said that morning — swaps included. Both Helix plans and
 * the PPL legacy plan are covered so a keyed session never falls through to the
 * weekday guess.
 */
export const DAY_KEY_SPLIT: Record<string, ChartSplit> = {
  // Helix-5 (active)
  cb_a: 'upper_a', cb_b: 'upper_b', arms: 'arms', legs_a: 'legs_a', legs_b: 'legs_b',
  // Helix-4
  upper_a: 'upper_a', upper_b: 'upper_b', lower_a: 'legs_a', lower_b: 'legs_b',
  // PPL (legacy)
  ppl_push_sun: 'push', ppl_push_thu: 'push',
  ppl_pull_mon: 'pull', ppl_pull_fri: 'pull', ppl_legs_tue: 'legs',
}

/**
 * Map a session to its chart bucket — by what was PERFORMED, never by what the
 * template says that weekday should have been.
 *
 * THE SWAP BUG (fixed 2026-08-06). HELIX logs every upper day as DB
 * split_day='upper', so the bucket used to be recovered from the weekday alone.
 * A swapped week violates that: a Wednesday Delts & Arms session landed in the
 * Upper A curve. `day_key` is the fix and the whole fix; the weekday heuristic
 * survives ONLY as the fallback for the legacy rows written before the column
 * existed — those are all pre-swap-feature, so the inference is safe there.
 */
export function resolveChartSplit(
  dateISO: string,
  split: string,
  era: 'all' | 'ppl' | 'axis',
  dayKey?: string | null,
): ChartSplit {
  const byKey = dayKey ? DAY_KEY_SPLIT[dayKey] : undefined
  if (byKey) return byKey
  if (split === 'lower') return 'legs'
  if (era === 'axis') {
    const weekday = new Date(dateISO + 'T12:00:00Z').getUTCDay()
    if (split === 'upper') return weekday === 2 ? 'arms' : weekday === 4 ? 'upper_b' : 'upper_a'
    if (split === 'legs') return weekday === 1 ? 'legs_a' : weekday === 5 ? 'legs_b' : 'legs'
  }
  return split as ChartSplit
}
