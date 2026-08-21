import { describe, it, expect } from 'vitest'
import { tightDomain, niceDomain, axisBound } from '@/lib/charts/scale'

/**
 * ── THE AXIS HAS TWO WAYS TO LIE, AND THIS PINS BOTH ─────────────────────────
 *
 * A domain fitted to zero flattens a real progression into a horizontal line.
 * A domain fitted exactly to the data does the opposite: it stretches a quarter
 * of a kilo into a staircase, because ANY range, however meaningless, gets the
 * full height of the lane.
 *
 * `tightDomain` is the zoom plus a floor on how narrow the zoom may get. What
 * follows is the shape of that trade, expressed as the fraction of the drawing
 * lane a given move actually occupies — which is the only thing a reader sees.
 */

/** How much of the lane a series occupies, 0–1. What the eye actually reads. */
function laneShare(values: number[], opts?: Parameters<typeof tightDomain>[1]): number {
  const [lo, hi] = tightDomain(values, opts)
  return (Math.max(...values) - Math.min(...values)) / (hi - lo)
}

describe('tightDomain', () => {
  it('gives a real progression most of the lane, where niceDomain gives it half', () => {
    // Three sessions of one routine, the exact band session volume lives in.
    const week = [12_400, 12_500, 12_600]
    const [nLo, nHi] = niceDomain(week, { padPct: 0.12, hardMin: 0 })
    const nShare = 200 / (nHi - nLo)

    expect(nShare).toBeLessThan(0.55)          // the bug: half the lane is snap
    expect(laneShare(week)).toBeGreaterThan(0.85)
  })

  it('makes a +5 kg move on a 3,000 kg series a distinct climb', () => {
    // The case that prompted this: a slight progression must LOOK like one.
    expect(laneShare([3000, 3005])).toBeGreaterThan(0.25)
  })

  it('but leaves a microload flat, because a microload is not a trajectory', () => {
    // The counter-lie. Without the span floor this would also fill the lane.
    expect(laneShare([3000, 3000.25])).toBeLessThan(0.05)
  })

  it('centres a flat series instead of welding it to an edge', () => {
    const [lo, hi] = tightDomain([3000, 3000, 3000])
    expect(lo).toBeLessThan(3000)
    expect(hi).toBeGreaterThan(3000)
    expect((3000 - lo) / (hi - lo)).toBeCloseTo(0.5, 5)
  })

  it('never snaps outward — the bounds it returns are the bounds it fitted', () => {
    // niceDomain rounds to 1/2/5×10ⁿ. This must not, or the zoom leaks away
    // again on exactly the narrow series it exists for.
    const [lo, hi] = tightDomain([8137, 8206])
    expect(hi - lo).toBeLessThan(100)
  })

  it('honours hardMin, and still leaves a lane to draw in', () => {
    const [lo, hi] = tightDomain([2, 40], { hardMin: 0 })
    expect(lo).toBeGreaterThanOrEqual(0)
    expect(hi).toBeGreaterThan(lo)
  })

  it('survives an empty and an all-null series rather than dividing by zero', () => {
    expect(tightDomain([])).toEqual([0, 1])
    expect(tightDomain([null, undefined])).toEqual([0, 1])
  })

  it('handles a series at zero — no NaN from a zero midpoint', () => {
    const [lo, hi] = tightDomain([0, 0], { hardMin: 0 })
    expect(Number.isFinite(lo)).toBe(true)
    expect(Number.isFinite(hi)).toBe(true)
    expect(hi).toBeGreaterThan(lo)
  })
})

/**
 * ── THE LABELS ARE WHAT MAKE THE ZOOM HONEST ─────────────────────────────────
 *
 * A domain fitted to the data is a zoom, and a zoom is fine as long as it says
 * so. The two bound labels are the entire declaration — so they have to be
 * right at the precision the zoom actually has.
 *
 * A screenshot is what caught this: a 12 335 → 12 615 domain labelled "12k" and
 * "13k". Both numbers wrong by hundreds of kilos, on the only two elements
 * standing between a zoom and a flattering picture.
 */
describe('axisBound', () => {
  it('states a tight domain in full rather than rounding the zoom away', () => {
    const [lo, hi] = tightDomain([12_400, 12_350, 12_600], { hardMin: 0 })
    expect(axisBound(hi, hi - lo)).toBe(Math.round(hi).toLocaleString())
    expect(axisBound(lo, hi - lo)).toBe(Math.round(lo).toLocaleString())
    // The failure it replaces.
    expect(axisBound(hi, hi - lo)).not.toBe('13k')
  })

  it('still compacts a wide domain, where the rounding is smaller than a tick', () => {
    expect(axisBound(12_000, 8_000)).toBe('12k')
    expect(axisBound(8_400, 6_000)).toBe('8.4k')
  })

  it('never prints a rounding larger than the span it is describing', () => {
    for (const [value, span] of [[12_500, 200], [3_000, 40], [850, 3]] as const) {
      const shown = axisBound(value, span)
      // A label whose own rounding exceeds the domain cannot distinguish the
      // two ends of that domain — which is the bug, stated generally.
      expect(shown).toBe(Math.round(value).toLocaleString())
    }
  })

  it('survives a non-finite bound rather than printing NaN on the axis', () => {
    expect(axisBound(Number.NaN, 10)).toBe('—')
  })
})
