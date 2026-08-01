/**
 * Axis scaling — PURE, no recharts, no React.
 *
 * WHY THIS EXISTS
 * Recharts' automatic domain starts at zero for a bar/area series. For weekly
 * training volume — which lives between roughly 8 and 12 tonnes and moves by a
 * few hundred kilos — that renders as five nearly identical bars pinned to the
 * top of an empty chart. The variation you actually care about is a rounding
 * error against the axis.
 *
 * A "nice" domain fitted to the DATA (with a little padding, snapped to a round
 * step) turns the same numbers into a readable line.
 */

/** Round `x` up to the next 1/2/5 × 10ⁿ — the steps humans read as round. */
function niceStep(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(x))
  const norm = x / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * mag
}

export interface NiceDomainOptions {
  /** Fraction of the data range to pad on each side. Default 0.1 (10%). */
  padPct?: number
  /** Force the axis to include 0. Default false — that is the bug this fixes. */
  zeroBased?: boolean
  /** Values can never sensibly go below this (e.g. 0 for a count). */
  hardMin?: number
}

/**
 * A readable [min, max] for a series.
 *
 * Degenerate inputs are handled rather than propagated: an empty series gives
 * `[0, 1]`, and a flat series is given symmetric breathing room instead of a
 * zero-height domain (which recharts renders as a line stuck to one edge).
 */
export function niceDomain(
  values: ReadonlyArray<number | null | undefined>,
  { padPct = 0.1, zeroBased = false, hardMin }: NiceDomainOptions = {},
): [number, number] {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!nums.length) return [0, 1]

  let lo = Math.min(...nums)
  let hi = Math.max(...nums)

  if (lo === hi) {
    // Flat series: ±10% of the value, or ±1 when the value is 0.
    const pad = Math.abs(lo) * 0.1 || 1
    lo -= pad
    hi += pad
  } else {
    const pad = (hi - lo) * padPct
    lo -= pad
    hi += pad
  }

  if (zeroBased) lo = Math.min(0, lo)
  if (hardMin != null) lo = Math.max(hardMin, lo)

  // Snap both ends outward to a round step so the ticks read cleanly.
  const step = niceStep((hi - lo) / 4)
  const flooredLo = Math.floor(lo / step) * step
  const ceiledHi = Math.ceil(hi / step) * step
  // Guard the float dust that `Math.floor(x / step) * step` leaves behind.
  return [round(flooredLo), round(ceiledHi)]
}

const round = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * Compact axis label for a mass in kg.
 *
 * The old formatter was `(v / 1000).toFixed(0) + 'k'`, which collapses 8 400
 * and 9 100 to "8k" and "9k" — two visibly different weeks reading as one tick
 * apart, or worse, as the same. One decimal below 10 t keeps them distinct
 * without making the axis noisy.
 */
export function compactKg(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 10_000) return `${Math.round(v / 1000)}k`
  if (abs >= 1_000) return `${(v / 1000).toFixed(1)}k`
  return `${Math.round(v)}`
}
