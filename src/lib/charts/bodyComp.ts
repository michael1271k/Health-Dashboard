/**
 * The four composition numbers, each with the month behind it.
 *
 * ── WHY FOUR AND WHY THESE FOUR ──────────────────────────────────────────────
 * Weight is not a body composition. On a cut the useful question is which of
 * the kilos left, and the scale reports the answer in four different currencies:
 *
 *   SMM  skeletal muscle mass — the scale's OWN figure (~27 kg), the one that
 *        should not be falling
 *   LST  lean soft tissue — weight × muscle % (~50 kg), a different measurement
 *        that has shared a label with SMM before and cost this app a season of
 *        wrong deltas (`PulseScale`)
 *   FFM  fat-free mass — weight − fat mass, derived
 *   fat  body-fat percentage, the one that should be
 *
 * All four, because the tile picks three and the Body trends screen wants them
 * all; a series that returned only what one face draws would be re-derived by
 * the next one.
 *
 * ── AND WHY THE DELTA CARRIES ITS OWN SPAN ───────────────────────────────────
 * "−1.2 kg over 30 days" and "−1.2 kg over 9 days" are different news, and a
 * body that has only been weighed twice this month can honestly report the
 * second. The delta is the newest reading against the OLDEST one in the window,
 * and `deltaDays` is the span it actually covers — so a face reading "30 d" off
 * the window length while the data spans nine is not a shape this can take. A
 * fixed label over a short span is the kind of quiet lie that reads as a
 * finding.
 */

import { isoAddDays } from '@/lib/utils/week'

export type BodyMetricKey = 'smm' | 'lst' | 'ffm' | 'fat'

export interface BodyCompReadingIn {
  date: string
  weightKg: number | null
  fatPct: number | null
  /** `skeletal_muscle_mass_kg` — the scale's own figure. */
  skeletalMuscleKg: number | null
  /** `muscle_mass_kg` — weight × muscle %. NOT skeletal muscle. */
  leanSoftTissueKg: number | null
  fatFreeMassKg: number | null
}

export interface BodyCompPoint {
  d: string
  v: number
}

export interface BodyCompMetric {
  key: BodyMetricKey
  /** What the strip calls it. */
  label: string
  unit: string
  /** Down is the good direction for fat and nothing else. */
  upIsGood: boolean
  latest: number | null
  latestOn: string | null
  /** `latest − earlier`, two decimals. Null without two readings. */
  delta: number | null
  /** Days between the two readings the delta is measured across. */
  deltaDays: number | null
  /** Every reading of this metric in the window, oldest first. */
  points: BodyCompPoint[]
}

export interface BodyCompOptions {
  endingOn: string
  /** How far back the delta reaches for its comparison. */
  days?: number
}

const METRICS: Array<{
  key: BodyMetricKey
  label: string
  unit: string
  upIsGood: boolean
  pick: (r: BodyCompReadingIn) => number | null
}> = [
  { key: 'smm', label: 'Skeletal', unit: 'kg', upIsGood: true, pick: (r) => r.skeletalMuscleKg },
  { key: 'lst', label: 'Lean', unit: 'kg', upIsGood: true, pick: (r) => r.leanSoftTissueKg },
  { key: 'ffm', label: 'Fat-free', unit: 'kg', upIsGood: true, pick: (r) => r.fatFreeMassKg },
  { key: 'fat', label: 'Body fat', unit: '%', upIsGood: false, pick: (r) => r.fatPct },
]

/** A finite number, or null. Zero is not a body measurement. */
function reading(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) && v > 0 ? v : null
}

export function bodyCompSeries(readings: BodyCompReadingIn[], options: BodyCompOptions): BodyCompMetric[] {
  const { endingOn, days = 30 } = options
  const from = isoAddDays(endingOn, -(Math.max(1, days) - 1))

  const sorted = readings
    .filter((r) => r.date >= from && r.date <= endingOn)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  return METRICS.map((m) => {
    const points: BodyCompPoint[] = []
    for (const r of sorted) {
      const v = reading(m.pick(r))
      if (v != null) points.push({ d: r.date, v })
    }
    const latest = points.length > 0 ? points[points.length - 1] : null
    // The oldest reading the window holds. One reading is a measurement, not a
    // change, and a delta against itself would render as a confident 0.00.
    const usable = points.length >= 2 ? points[0] : null
    return {
      key: m.key,
      label: m.label,
      unit: m.unit,
      upIsGood: m.upIsGood,
      latest: latest?.v ?? null,
      latestOn: latest?.d ?? null,
      delta: usable && latest ? Math.round((latest.v - usable.v) * 100) / 100 : null,
      deltaDays: usable && latest
        ? Math.round((Date.parse(`${latest.d}T00:00:00Z`) - Date.parse(`${usable.d}T00:00:00Z`)) / 86_400_000)
        : null,
      points,
    }
  })
}
