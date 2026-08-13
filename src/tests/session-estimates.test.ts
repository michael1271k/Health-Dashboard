import { describe, it, expect } from 'vitest'
import {
  estimateCalories, estimateAvgBpm, medianKcalPerMin, metKcalPerMin,
  LIFTING_MET, MIN_KCAL_SAMPLES, type KcalSample,
} from '@/lib/sessions/estimates'

const samples = (n: number, kcalPerMin: number): KcalSample[] =>
  Array.from({ length: n }, () => ({ kcal: kcalPerMin * 60, durationMin: 60 }))

describe('metKcalPerMin — the ACSM compendium fallback', () => {
  it('is MET × 3.5 × bodyweight / 200', () => {
    // 6.0 × 3.5 × 75 / 200 = 7.875
    expect(metKcalPerMin(75)).toBeCloseTo((LIFTING_MET * 3.5 * 75) / 200, 6)
    expect(metKcalPerMin(75)).toBeCloseTo(7.875, 6)
  })

  it('scales with bodyweight — the same session costs less at 70 kg than at 80', () => {
    expect(metKcalPerMin(70)!).toBeLessThan(metKcalPerMin(80)!)
  })

  it.each([[null], [undefined], [0], [-5], [NaN]])('refuses a bodyweight of %s', (bw) => {
    expect(metKcalPerMin(bw as number | null | undefined)).toBeNull()
  })
})

describe('medianKcalPerMin — your own data, resistant to one bad session', () => {
  it('needs a floor of samples before it will speak', () => {
    expect(medianKcalPerMin(samples(MIN_KCAL_SAMPLES - 1, 8))).toBeNull()
    expect(medianKcalPerMin(samples(MIN_KCAL_SAMPLES, 8))).toBeCloseTo(8, 6)
  })

  it('is a MEDIAN, so a watch left on through lunch does not move it', () => {
    const withOutlier: KcalSample[] = [
      ...samples(4, 8),
      { kcal: 900, durationMin: 60 },   // 15 kcal/min — the outlier
    ]
    expect(medianKcalPerMin(withOutlier)).toBeCloseTo(8, 6)
    // A mean would have been dragged to ~9.4.
    const mean = withOutlier.reduce((s, x) => s + x.kcal / x.durationMin, 0) / withOutlier.length
    expect(mean).toBeGreaterThan(9)
  })

  it('averages the middle pair on an even count', () => {
    const s: KcalSample[] = [
      { kcal: 60, durationMin: 10 },   // 6
      { kcal: 70, durationMin: 10 },   // 7
      { kcal: 80, durationMin: 10 },   // 8
      { kcal: 90, durationMin: 10 },   // 9
      { kcal: 100, durationMin: 10 },  // 10
      { kcal: 110, durationMin: 10 },  // 11
    ]
    expect(medianKcalPerMin(s)).toBeCloseTo(8.5, 6)
  })

  it('discards unusable rows before counting toward the floor', () => {
    const s: KcalSample[] = [...samples(4, 8), { kcal: 0, durationMin: 60 }, { kcal: 400, durationMin: 0 }]
    expect(medianKcalPerMin(s)).toBeNull()   // only 4 usable
  })
})

describe('estimateCalories — personal first, compendium second', () => {
  it('prefers your own median once there are enough samples', () => {
    const est = estimateCalories({ durationMin: 60, samples: samples(6, 9), bodyweightKg: 75 })
    expect(est).toEqual({ kcal: 540, basis: 'personal-median' })
  })

  it('falls back to the MET formula below the sample floor', () => {
    const est = estimateCalories({ durationMin: 60, samples: samples(2, 9), bodyweightKg: 75 })
    // 7.875 × 60 = 472.5 → 473
    expect(est).toEqual({ kcal: 473, basis: 'met-formula' })
  })

  it('returns null when neither rule can fire', () => {
    expect(estimateCalories({ durationMin: 60, samples: [], bodyweightKg: null })).toBeNull()
    expect(estimateCalories({ durationMin: null, samples: samples(9, 8), bodyweightKg: 75 })).toBeNull()
    expect(estimateCalories({ durationMin: 0, samples: samples(9, 8), bodyweightKg: 75 })).toBeNull()
  })

  it('scales with duration', () => {
    const half = estimateCalories({ durationMin: 30, samples: samples(6, 8), bodyweightKg: 75 })!
    const full = estimateCalories({ durationMin: 60, samples: samples(6, 8), bodyweightKg: 75 })!
    expect(full.kcal).toBe(half.kcal * 2)
  })
})

describe('estimateAvgBpm — a carry-forward, never a formula', () => {
  it('carries the previous measured value', () => {
    expect(estimateAvgBpm(118)).toBe(118)
    expect(estimateAvgBpm(117.6)).toBe(118)   // rounded, the column is an integer in practice
  })

  it.each([[null], [undefined], [0], [-1], [NaN]])('has nothing to say given %s', (bpm) => {
    expect(estimateAvgBpm(bpm as number | null | undefined)).toBeNull()
  })
})
