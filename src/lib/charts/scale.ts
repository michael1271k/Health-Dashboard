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

export interface TightDomainOptions {
  /** Fraction of the data range to pad on each side. Default 0.06. */
  padPct?: number
  /** Values can never sensibly go below this (e.g. 0 for a tonnage). */
  hardMin?: number
  /**
   * The narrowest span the domain may have, as a fraction of the data's
   * midpoint. Default 0.005 (half a percent).
   */
  minSpanPct?: number
}

/**
 * A domain that ZOOMS, for a chart that draws a shape rather than a table.
 *
 * ── WHY `niceDomain` IS THE WRONG TOOL HERE ──────────────────────────────────
 * `niceDomain` exists to produce ROUND TICK LABELS, so after padding it snaps
 * both ends outward to a 1/2/5×10ⁿ step. On a series that already lives in a
 * narrow band, that snap is most of the domain. Worked example from the session
 * volume trail — 12 400 / 12 500 / 12 600 kg:
 *
 *     pad 12%  → [12 376, 12 624]      span 248
 *     step     → niceStep(62) = 100
 *     snap     → [12 300, 12 700]      span 400
 *
 * The data occupies 200 of 400 — HALF the lane is snap — and against a 38px
 * drawing height the entire week-to-week range gets about 19px. The progression
 * is real; the axis is spending its height on round numbers nobody reads.
 *
 * This fits the data and stops. The caller prints the two bounds (see
 * `VolumeCurve`), so the zoom is DECLARED rather than hidden — which is the
 * whole difference between a zoom and a lie about the size of a change.
 *
 * ── AND WHY THERE IS A FLOOR ON THE SPAN ─────────────────────────────────────
 * A pure fit has the opposite failure and it is just as bad: three sessions
 * within a quarter-kilo of each other would draw as a dramatic staircase,
 * because ANY range, however meaningless, gets stretched to the full height. A
 * 0.25 kg microload is not a trajectory.
 *
 * So the domain can never be narrower than `minSpanPct` of the midpoint. At the
 * default of 0.5%, a +5 kg move on a 3 000 kg series takes about a third of the
 * lane — a distinct climb, which is what was asked for — while +0.25 kg takes
 * under 2% and correctly stays flat. The floor is what lets the zoom be
 * aggressive without becoming dishonest.
 */
export function tightDomain(
  values: ReadonlyArray<number | null | undefined>,
  { padPct = 0.06, hardMin, minSpanPct = 0.005 }: TightDomainOptions = {},
): [number, number] {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!nums.length) return [0, 1]

  let lo = Math.min(...nums)
  let hi = Math.max(...nums)
  const mid = (lo + hi) / 2

  // The floor first, so padding applies to the span the chart will actually
  // draw rather than to a degenerate one. A series centred on zero has no
  // proportional floor to take, so it falls back to one unit — the same escape
  // `niceDomain` makes for a flat series, and for the same reason.
  const floor = Math.abs(mid) * minSpanPct || 1
  if (hi - lo < floor) {
    const half = floor / 2
    lo = mid - half
    hi = mid + half
  }

  const pad = (hi - lo) * padPct
  lo -= pad
  hi += pad

  if (hardMin != null) lo = Math.max(hardMin, lo)

  // Rounded FIRST, then guarded. `round` snaps to 1e-6, so a domain narrower
  // than that collapses to a single value here and every downstream `/ span`
  // divides by zero — which is how an all-zero series blanks the chart instead
  // of drawing a flat line at the bottom.
  const rLo = round(lo)
  const rHi = round(hi)
  return rHi > rLo ? [rLo, rHi] : [rLo, rLo + (Math.abs(rLo) * minSpanPct || 1)]
}

/**
 * An axis bound, at the precision the axis actually has.
 *
 * ── WHY `compactKg` IS NOT ENOUGH HERE ───────────────────────────────────────
 * `compactKg` rounds anything at or above 10 000 to whole thousands, which is
 * right for an axis that runs from zero: 8k and 12k are readable and the
 * rounding is smaller than the tick spacing.
 *
 * It is wrong for a ZOOMED axis, and the screenshot is what showed it. A domain
 * of 12 335 → 12 615 labelled "12k" and "13k" states bounds that are out by
 * three hundred kilograms in one direction and four hundred in the other — and
 * those two labels are the ONLY thing making the zoom honest rather than a
 * flattering picture. A clipped axis that misreports its own bounds is worse
 * than one that does not state them at all, because it looks like it has.
 *
 * So the precision follows the SPAN: when the whole domain is narrower than the
 * rounding `compactKg` would apply, the bound is printed in full.
 */
export function axisBound(value: number, span: number): string {
  if (!Number.isFinite(value)) return '—'
  // The step `compactKg` would round to at this magnitude.
  const rounding = Math.abs(value) >= 10_000 ? 1000 : Math.abs(value) >= 1_000 ? 100 : 1
  if (span >= rounding * 2) return compactKg(value)
  return Math.round(value).toLocaleString()
}
