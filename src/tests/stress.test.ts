import { describe, it, expect } from 'vitest'
import {
  STRESS, stressBreakdown, stressIndex, stressBand, stressLoadParts, fragmentationRatio, fragmentationZ,
  type StressInputs,
} from '@/lib/scoring/stress'
import { stressSeries } from '@/lib/charts/stressSeries'
import { batteryBreakdown, MAX_TOTAL_DRAIN, BATTERY } from '@/lib/scoring/battery'
import { fatigueDayMean } from '@/lib/recovery/fatigue'
import type { ScoringInputs } from '@/lib/scoring/types'

// ─────────────────────────────────────────────────────────────────────────────
// Stress index v1 — the claims docs/STRESS_MODEL.md makes, before the Swift
// twin exists. The golden vectors prove the port agrees with this file.
// ─────────────────────────────────────────────────────────────────────────────

const zero: StressInputs = { hrvZ: 0, rhrZ: 0, fragZ: 0, sleepOnsetTrouble: false, fatigueDayMean: 3, acwr: 1.0, strainZ: 0 }

describe('stress — the composite', () => {
  it('your normal reads 50 and Baseline', () => {
    const b = stressBreakdown(zero)
    expect(b.index).toBe(50)
    expect(b.band).toBe('baseline')
    expect(b.weightSum).toBeCloseTo(1, 12)
  })

  it('nothing answered is no reading, never a 50 standing in', () => {
    const b = stressBreakdown({})
    expect(b.index).toBeNull()
    expect(b.band).toBeNull()
    expect(b.composite).toBeNull()
    expect(b.weightSum).toBe(0)
  })

  it('a missing term is neutral: the answered terms are renormalised, not diluted', () => {
    // One term at +2, alone, is the full 90 whichever term it is.
    expect(stressIndex({ hrvZ: -2 })).toBe(90)
    expect(stressIndex({ fragZ: 2 })).toBe(90)
    expect(stressIndex({ fatigueDayMean: 5 })).toBe(90)
    expect(stressIndex({ acwr: 2.0, strainZ: 2 })).toBe(90)
    // And a term at zero DOES dilute — that is what "answered" means.
    expect(stressIndex({ hrvZ: -2, fatigueDayMean: 3 })).toBeLessThan(90)
  })

  it('the autonomic term reads HRV inverted and resting HR as-is', () => {
    expect(stressBreakdown({ hrvZ: 1.5 }).terms.auto.z).toBe(-1.5)
    expect(stressBreakdown({ rhrZ: 1.5 }).terms.auto.z).toBe(1.5)
    expect(stressBreakdown({ hrvZ: -1, rhrZ: 1 }).terms.auto.z).toBe(1)
  })

  it('onset is one-sided: a calm night does not de-stress', () => {
    expect(stressBreakdown({ sleepOnsetTrouble: false }).terms.sleep.z).toBe(0)
    expect(stressBreakdown({ sleepOnsetTrouble: true }).terms.sleep.z).toBe(1)
    expect(stressBreakdown({ sleepOnsetTrouble: null }).terms.sleep.answered).toBe(0)
    expect(stressBreakdown({ fragZ: 2, sleepOnsetTrouble: true }).terms.sleep.z).toBe(1.5)
  })

  it('the self-report term is the DAY mean of the 1–5 scale around Worn, clamped ±2', () => {
    expect(stressBreakdown({ fatigueDayMean: 1 }).terms.self.z).toBe(-2)
    expect(stressBreakdown({ fatigueDayMean: 5 }).terms.self.z).toBe(2)
    expect(stressBreakdown({ fatigueDayMean: 3.5 }).terms.self.z).toBe(0.5)
    expect(stressBreakdown({ fatigueDayMean: 99 }).terms.self.z).toBe(2)
  })

  it('load is never negative — a light week de-stresses nothing', () => {
    for (const acwr of [null, 0, 0.5, 1.0, 1.29, 1.3, 1.65, 2.0, 3, 9]) {
      for (const strainZ of [null, -2, -1, 0, 1, 2, 9]) {
        const t = stressBreakdown({ acwr, strainZ }).terms.load
        if (acwr == null && strainZ == null) { expect(t.z).toBeNull(); continue }
        expect(t.z).toBeGreaterThanOrEqual(0)
        expect(t.z).toBeLessThanOrEqual(2)
        expect(t.acwrTerm).toBeGreaterThanOrEqual(0)
        expect(t.strainTerm).toBeGreaterThanOrEqual(0)
      }
    }
    expect(stressLoadParts(1.3, null).acwrTerm).toBe(0)
    expect(stressLoadParts(2.0, null).acwrTerm).toBe(2)
    expect(stressLoadParts(3.0, null).acwrTerm).toBe(2)      // saturates at 2.0
    expect(stressLoadParts(1.65, null).acwrTerm).toBeCloseTo(1, 12)
    expect(stressBreakdown({ acwr: 2.0, strainZ: 2 }).terms.load.z).toBe(2)
    expect(stressBreakdown({ acwr: 1.65, strainZ: 1 }).terms.load.z).toBeCloseTo(1, 12)
  })

  it('stays inside [10, 90] on an adversarial grid', () => {
    const grid = [null, -9, -2, -1, 0, 1, 2, 9]
    for (const hrvZ of grid) for (const rhrZ of grid) for (const fragZ of grid) for (const fatigue of [null, -5, 1, 3, 5, 99]) {
      const s = stressIndex({ hrvZ, rhrZ, fragZ, fatigueDayMean: fatigue, sleepOnsetTrouble: true, acwr: 9, strainZ: 9 })
      if (s == null) continue
      expect(s).toBeGreaterThanOrEqual(STRESS.min)
      expect(s).toBeLessThanOrEqual(STRESS.max)
      expect(Number.isInteger(s)).toBe(true)
    }
  })

  it('every band is reachable and 50 is Baseline', () => {
    expect(stressBand(10)).toBe('calm')
    expect(stressBand(29)).toBe('calm')
    expect(stressBand(30)).toBe('baseline')
    expect(stressBand(50)).toBe('baseline')
    expect(stressBand(51)).toBe('elevated')
    expect(stressBand(62)).toBe('elevated')
    expect(stressBand(63)).toBe('high')
    expect(stressBand(75)).toBe('high')
    expect(stressBand(76)).toBe('overreached')
    expect(stressBand(90)).toBe('overreached')
    // Reached from real inputs, not just the classifier.
    expect(stressBreakdown({ hrvZ: 2, fatigueDayMean: 1 }).band).toBe('calm')
    expect(stressBreakdown({ hrvZ: -1, rhrZ: 1, sleepOnsetTrouble: true, fatigueDayMean: 4, acwr: 1.5, strainZ: 1 }).band).toBe('high')
    expect(stressBreakdown({ hrvZ: -2, rhrZ: 2, fragZ: 2, sleepOnsetTrouble: true, fatigueDayMean: 5, acwr: 2, strainZ: 2 }).band).toBe('overreached')
  })
})

describe('stress — fragmentation', () => {
  it('a duration-only night has no ratio; a still night with stages has zero', () => {
    expect(fragmentationRatio({ awakeMin: 0, asleepMin: 420, deepMin: 0, remMin: 0 })).toBeNull()
    expect(fragmentationRatio({ awakeMin: 0, asleepMin: 420, deepMin: 60, remMin: 90 })).toBe(0)
    expect(fragmentationRatio({ awakeMin: 42, asleepMin: 420 })).toBe(0.1)
    expect(fragmentationRatio({ awakeMin: 42, asleepMin: 0 })).toBeNull()
    expect(fragmentationRatio({ awakeMin: null, asleepMin: 420 })).toBeNull()
  })

  it('runs the ratio through the readiness z-signal, raw', () => {
    const awake = [...Array(42).fill(20), ...Array(7).fill(60)]
    const asleep = Array(49).fill(400)
    const jitter = awake.map((a, i) => (i < 42 ? a + (i % 2 ? 4 : -4) : a))
    const z = fragmentationZ(jitter, asleep)
    expect(z.rolling).toBeCloseTo(0.15, 12)
    expect(z.baselineMean).toBeCloseTo(0.05, 12)
    expect(z.n).toEqual({ rolling: 7, baseline: 42 })
    expect(z.z).toBe(2)
    // A night with no ratio is a hole, not a zero: the counts drop.
    const holes = fragmentationZ(jitter.map((a, i) => (i % 3 ? a : null)), asleep)
    expect(holes.n.baseline).toBe(28)
  })
})

describe('stress — the day mean of fatigue', () => {
  it('averages every slot logged and is null with none', () => {
    expect(fatigueDayMean({})).toBeNull()
    expect(fatigueDayMean({ waking: 1, pre: 3, post: 5 })).toBe(3)
    expect(fatigueDayMean({ waking: 2 })).toBe(2)
  })
})

describe('stress — the series', () => {
  it('is exactly `limit` days, holes present and empty', () => {
    const days = [
      { date: '2026-09-05', breakdown: stressBreakdown(zero) },
      { date: '2026-09-06', breakdown: stressBreakdown({ hrvZ: -2, fatigueDayMean: 4.25 }) },
    ]
    const out = stressSeries(days, { endingOn: '2026-09-06', limit: 5 })
    expect(out.map((d) => d.d)).toEqual(['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
    expect(out.slice(0, 3).every((d) => d.empty && d.index == null)).toBe(true)
    expect(out[3].index).toBe(50)
    expect(out[4].terms.self).toBe(1.3)   // 1.25 → one decimal
    expect(out[4].terms.load).toBeNull()
    expect(stressSeries(days, { endingOn: '2026-09-06', limit: 0 })).toEqual([])
  })
})

describe('stress — the battery is not listening', () => {
  it('Battery.breakdown is a function of ScoringInputs alone; no stress input reaches it, and the budget is still 93', () => {
    const inputs: ScoringInputs = {
      sleepHours: 7, deepMinutes: 60, remMinutes: 90, sleepGoalHours: 8,
      calories: 0, proteinG: 0, carbsG: 0, fatG: 0, calorieGoal: 0, proteinGoalG: 0, carbsGoalG: 0, fatGoalG: 0,
      steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 500,
      workoutLogged: false, isRestDay: false, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
      waterMl: 0, waterGoalMl: 3000, hoursAwake: 10, hrvZ: -1, rhrZ: 1, acwr: 1.5, strainZ: 1, fatigueLevel: 4, sleepOnsetTrouble: true,
    }
    const before = batteryBreakdown(inputs)
    // Compute stress with everything the index can read, at every extreme.
    for (const s of [{}, zero, { hrvZ: -2, rhrZ: 2, fragZ: 2, sleepOnsetTrouble: true, fatigueDayMean: 5, acwr: 2, strainZ: 2 }]) {
      stressBreakdown(s)
      expect(batteryBreakdown(inputs)).toEqual(before)
    }
    // Neither type carries the other's fields.
    expect('fragZ' in inputs).toBe(false)
    expect('fatigueDayMean' in inputs).toBe(false)
    expect(MAX_TOTAL_DRAIN).toBe(93)
    expect(BATTERY.version).toBe(9)
  })
})
