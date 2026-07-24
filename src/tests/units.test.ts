import { describe, it, expect } from 'vitest'
import { normalizeSpO2 } from '@/lib/utils/units'
import { mergedMinutes } from '@/lib/native/healthkit'
import { computeBattery, computeMorningCharge, computeSleepQuality } from '@/lib/scoring/battery'
import type { ScoringInputs } from '@/lib/scoring/types'

describe('mergedMinutes — iPhone/Watch overlap dedupe', () => {
  const min = (n: number) => n * 60000
  it('counts overlapping samples ONCE (the 9h11m vs 9h15m drift)', () => {
    // Watch says 00:00–01:00, iPhone says 00:30–01:30 → 90 real minutes, not 120.
    expect(mergedMinutes([[0, min(60)], [min(30), min(90)]])).toBe(90)
  })
  it('sums disjoint intervals normally', () => {
    expect(mergedMinutes([[0, min(30)], [min(60), min(90)]])).toBe(60)
  })
  it('collapses a fully-contained duplicate', () => {
    expect(mergedMinutes([[0, min(60)], [min(10), min(20)]])).toBe(60)
  })
  it('handles empty + single', () => {
    expect(mergedMinutes([])).toBe(0)
    expect(mergedMinutes([[0, min(45)]])).toBe(45)
  })
})

describe('battery wake charge — "woke up to 55%" regression', () => {
  const night = (hours: number, deep: number): ScoringInputs => ({
    sleepHours: hours, deepMinutes: deep, remMinutes: 120, sleepGoalHours: 8,
    calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
    calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
    steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 500,
    workoutLogged: false, isRestDay: false, newPRsToday: 0,
    sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
    waterMl: 0, waterGoalMl: 3000, supplementsTaken: 0, supplementsGoal: 3,
    contextMode: 'normal',
  })

  it('a full 9h night wakes NEAR FULL, not at the 55% floor', () => {
    const charge = computeMorningCharge(computeSleepQuality(night(9.18, 65)))
    expect(charge).toBeGreaterThanOrEqual(95)
  })

  it('battery just after waking reflects that charge (not 55%)', () => {
    expect(computeBattery(night(9.18, 65), 0.5).currentPct).toBeGreaterThanOrEqual(93)
  })

  it('55% only happens when there is genuinely NO sleep signal', () => {
    // This is what the broken scorer window produced for every single day.
    expect(computeMorningCharge(computeSleepQuality(night(0, 0)))).toBeLessThanOrEqual(62)
  })
})

/**
 * Regression guards for the two "reported fixed but still broken" bugs.
 * `daily_logs.blood_oxygen` holds MIXED units — the native bridge wrote the raw
 * HealthKit fraction (0.982) while the legacy Shortcut wrote a real percent
 * (97.79). Display must be correct for BOTH forms.
 */
describe('normalizeSpO2 — mixed-unit blood oxygen', () => {
  it('scales a HealthKit fraction to a percent (0.982 → 98.2, never "1%")', () => {
    expect(normalizeSpO2(0.982)).toBe(98.2)
    expect(normalizeSpO2(0.99)).toBe(99)
    expect(normalizeSpO2(0.94)).toBe(94)
  })

  it('passes an already-percent legacy value through untouched', () => {
    expect(normalizeSpO2(97.79)).toBe(97.79)
    expect(normalizeSpO2(98)).toBe(98)
  })

  it('is idempotent — normalizing twice never double-scales', () => {
    const once = normalizeSpO2(0.982)!
    expect(normalizeSpO2(once)).toBe(once)
  })

  it('handles null/undefined/non-finite as null', () => {
    expect(normalizeSpO2(null)).toBeNull()
    expect(normalizeSpO2(undefined)).toBeNull()
    expect(normalizeSpO2(NaN)).toBeNull()
  })

  it('boundary: 1.0 is a fraction (100%), 1.5 is the cutoff', () => {
    expect(normalizeSpO2(1)).toBe(100)
    expect(normalizeSpO2(1.5)).toBe(150)   // still treated as fraction at the edge
    expect(normalizeSpO2(1.6)).toBe(1.6)   // above the cutoff → left alone
  })
})
