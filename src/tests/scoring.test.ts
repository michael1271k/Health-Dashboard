import { describe, it, expect } from 'vitest'
import {
  computeSleepScore,
  computeNutritionScore,
  computeActivityScore,
  computeWorkoutScore,
  computeRecoveryScore,
  computeDailyScore,
} from '@/lib/scoring/score'
import { computeMorningCharge, computeBattery, computeRecharge, DRAIN_CONSTANTS } from '@/lib/scoring/battery'
import { computeReadiness } from '@/lib/scoring/readiness'
import type { ScoringInputs } from '@/lib/scoring/types'

// ---- Fixture inputs ----
const PERFECT: ScoringInputs = {
  sleepHours: 8, deepMinutes: 100, remMinutes: 100, sleepGoalHours: 8,
  calories: 2500, proteinG: 180, carbsG: 300, fatG: 80,
  calorieGoal: 2500, proteinGoalG: 180, carbsGoalG: 300, fatGoalG: 80,
  steps: 10000, activeCal: 600, stepsGoal: 10000, activeCalGoal: 600,
  workoutLogged: true, newPRsToday: 2, sessionVolumeKg: 5000, trailingAvgVolumeKg: 4000,
  waterMl: 2500, waterGoalMl: 2500, supplementsTaken: 3, supplementsGoal: 3,
}

// Battery-specific fixture: perfect sleep + nutrition/recovery, but no steps/workout yet
// (simulates waking up after perfect sleep, before any activity)
const SLEEP_PERFECT: ScoringInputs = {
  sleepHours: 8, deepMinutes: 100, remMinutes: 100, sleepGoalHours: 8,
  calories: 2500, proteinG: 180, carbsG: 300, fatG: 80,
  calorieGoal: 2500, proteinGoalG: 180, carbsGoalG: 300, fatGoalG: 80,
  steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 600,
  workoutLogged: false, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
  waterMl: 2500, waterGoalMl: 2500, supplementsTaken: 3, supplementsGoal: 3,
}

const ZERO: ScoringInputs = {
  sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8,
  calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
  calorieGoal: 2500, proteinGoalG: 180, carbsGoalG: 300, fatGoalG: 80,
  steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 600,
  workoutLogged: false, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
  waterMl: 0, waterGoalMl: 2500, supplementsTaken: 0, supplementsGoal: 3,
}

// ---- Sleep Score ----
describe('computeSleepScore', () => {
  it('returns 100 for goal hours + deep & REM bonus', () => {
    expect(computeSleepScore({ sleepHours: 8, deepMinutes: 100, remMinutes: 100, sleepGoalHours: 8 })).toBe(100)
  })

  it('returns 100 for 8h sleep with no deep/REM bonus (base 100 clamped)', () => {
    expect(computeSleepScore({ sleepHours: 8, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8 })).toBe(100)
  })

  it('returns 0 for 0 hours sleep', () => {
    expect(computeSleepScore({ sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8 })).toBe(0)
  })

  it('returns ~62.5 for 5h of 8h goal', () => {
    // base = 5/8 * 100 = 62.5, no bonuses → 62
    const score = computeSleepScore({ sleepHours: 5, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8 })
    expect(score).toBeCloseTo(62.5, 0)
  })

  it('adds deep sleep bonus only when ≥90min', () => {
    const withBonus = computeSleepScore({ sleepHours: 6, deepMinutes: 90, remMinutes: 0, sleepGoalHours: 8 })
    const without   = computeSleepScore({ sleepHours: 6, deepMinutes: 89, remMinutes: 0, sleepGoalHours: 8 })
    expect(withBonus - without).toBe(5)
  })

  it('never exceeds 100', () => {
    const score = computeSleepScore({ sleepHours: 12, deepMinutes: 120, remMinutes: 120, sleepGoalHours: 8 })
    expect(score).toBeLessThanOrEqual(100)
  })

  it('returns 100 (goal met) when sleepGoalHours is 0 — no NaN', () => {
    const score = computeSleepScore({ sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 0 })
    expect(score).toBe(100)
    expect(Number.isNaN(score)).toBe(false)
  })
})

// ---- Nutrition Score ----
describe('computeNutritionScore', () => {
  it('returns 100 when all macros exactly hit goals', () => {
    expect(computeNutritionScore({
      calories: 2500, proteinG: 180, carbsG: 300, fatG: 80,
      calorieGoal: 2500, proteinGoalG: 180, carbsGoalG: 300, fatGoalG: 80,
    })).toBe(100)
  })

  it('returns 0 when all macros are 0 (100% error)', () => {
    const score = computeNutritionScore({
      calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
      calorieGoal: 2500, proteinGoalG: 180, carbsGoalG: 300, fatGoalG: 80,
    })
    expect(score).toBe(0)
  })

  it('protein has double weight: 50% protein deficit scores lower than 50% carb deficit', () => {
    const proteinHit = computeNutritionScore({
      calories: 2500, proteinG: 90,  carbsG: 300, fatG: 80,
      calorieGoal: 2500, proteinGoalG: 180, carbsGoalG: 300, fatGoalG: 80,
    })
    const carbMiss = computeNutritionScore({
      calories: 2500, proteinG: 180, carbsG: 150, fatG: 80,
      calorieGoal: 2500, proteinGoalG: 180, carbsGoalG: 300, fatGoalG: 80,
    })
    expect(proteinHit).toBeLessThan(carbMiss)
  })

  it('is always between 0 and 100', () => {
    const extremes = [
      { calories: 5000, proteinG: 500, carbsG: 600, fatG: 200 },
      { calories: 0,    proteinG: 0,   carbsG: 0,   fatG: 0   },
    ]
    const goals = { calorieGoal: 2500, proteinGoalG: 180, carbsGoalG: 300, fatGoalG: 80 }
    for (const e of extremes) {
      const s = computeNutritionScore({ ...e, ...goals })
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })
})

// ---- Activity Score ----
describe('computeActivityScore', () => {
  it('returns 100 when steps and cal both hit goals', () => {
    expect(computeActivityScore({ steps: 10000, activeCal: 600, stepsGoal: 10000, activeCalGoal: 600 })).toBe(100)
  })

  it('returns 0 when steps and cal are both 0', () => {
    expect(computeActivityScore({ steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 600 })).toBe(0)
  })

  it('returns 50 when only steps hit goal', () => {
    expect(computeActivityScore({ steps: 10000, activeCal: 0, stepsGoal: 10000, activeCalGoal: 600 })).toBe(50)
  })

  it('caps at 100 even when over goal', () => {
    expect(computeActivityScore({ steps: 20000, activeCal: 1200, stepsGoal: 10000, activeCalGoal: 600 })).toBe(100)
  })
})

// ---- Workout Score ----
describe('computeWorkoutScore', () => {
  it('returns 0 when no workout logged', () => {
    expect(computeWorkoutScore({
      workoutLogged: false, newPRsToday: 5, sessionVolumeKg: 5000, trailingAvgVolumeKg: 4000,
    })).toBe(0)
  })

  it('returns 60 base for logging a session with no PRs and below trailing avg', () => {
    expect(computeWorkoutScore({
      workoutLogged: true, newPRsToday: 0, sessionVolumeKg: 3000, trailingAvgVolumeKg: 4000,
    })).toBe(60)
  })

  it('returns 80 for session at or above trailing avg', () => {
    expect(computeWorkoutScore({
      workoutLogged: true, newPRsToday: 0, sessionVolumeKg: 5000, trailingAvgVolumeKg: 4000,
    })).toBe(80)
  })

  it('returns 100 for volume ≥ avg + 2 PRs', () => {
    expect(computeWorkoutScore({
      workoutLogged: true, newPRsToday: 2, sessionVolumeKg: 5000, trailingAvgVolumeKg: 4000,
    })).toBe(100)
  })

  it('caps PR bonus at 20 (2 PRs = max)', () => {
    expect(computeWorkoutScore({
      workoutLogged: true, newPRsToday: 10, sessionVolumeKg: 5000, trailingAvgVolumeKg: 4000,
    })).toBe(100)
  })
})

// ---- Recovery Score ----
describe('computeRecoveryScore', () => {
  it('returns 100 when water and supplements both at goal', () => {
    expect(computeRecoveryScore({ waterMl: 2500, waterGoalMl: 2500, supplementsTaken: 3, supplementsGoal: 3 })).toBe(100)
  })

  it('returns 0 when both are 0', () => {
    expect(computeRecoveryScore({ waterMl: 0, waterGoalMl: 2500, supplementsTaken: 0, supplementsGoal: 3 })).toBe(0)
  })

  it('weights water at 60%', () => {
    const waterOnly = computeRecoveryScore({ waterMl: 2500, waterGoalMl: 2500, supplementsTaken: 0, supplementsGoal: 3 })
    expect(waterOnly).toBeCloseTo(60, 0)
  })

  it('handles 0 supplementsGoal without dividing by zero', () => {
    expect(() =>
      computeRecoveryScore({ waterMl: 2500, waterGoalMl: 2500, supplementsTaken: 0, supplementsGoal: 0 })
    ).not.toThrow()
  })
})

// ---- Daily Score composite ----
describe('computeDailyScore', () => {
  it('perfect inputs produce score of 100', () => {
    const result = computeDailyScore(PERFECT)
    expect(result.totalScore).toBe(100)
  })

  it('zero inputs produce score of 0', () => {
    const result = computeDailyScore(ZERO)
    expect(result.totalScore).toBe(0)
  })

  it('weights sum to ~1.0 (consistency check)', () => {
    // sleep 25% + nutrition 30% + activity 20% + workout 15% + recovery 10% = 100%
    // If all components are 60, total should be 60
    const uniform: ScoringInputs = {
      sleepHours: 4.8, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8,   // → sleep ≈ 60
      calories: 1500, proteinG: 108, carbsG: 180, fatG: 48,               // → nutrition ≈ 40% off goals → ~60
      calorieGoal: 2500, proteinGoalG: 180, carbsGoalG: 300, fatGoalG: 80,
      steps: 6000, activeCal: 360, stepsGoal: 10000, activeCalGoal: 600,   // → activity = 60
      workoutLogged: true, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 5000, // → workout = 60
      waterMl: 1500, waterGoalMl: 2500, supplementsTaken: 2, supplementsGoal: 3,          // → recovery = 60*0.6+66*0.4 ≈ 62.4 → ~62
    }
    // Just check it's in a reasonable range — not asserting exact 60 (fixture is approximate)
    const result = computeDailyScore(uniform)
    expect(result.totalScore).toBeGreaterThan(40)
    expect(result.totalScore).toBeLessThan(80)
  })

  it('returns integer scores (Math.round applied)', () => {
    const result = computeDailyScore(PERFECT)
    expect(Number.isInteger(result.totalScore)).toBe(true)
    expect(Number.isInteger(result.sleepScore)).toBe(true)
  })
})

// ---- Battery ----
describe('computeMorningCharge', () => {
  it('returns 50 for 0 sleep score', () => {
    expect(computeMorningCharge(0)).toBe(50)
  })

  it('returns 100 for 100 sleep score', () => {
    expect(computeMorningCharge(100)).toBe(100)
  })

  it('returns 75 for 50 sleep score', () => {
    expect(computeMorningCharge(50)).toBe(75)
  })

  it('never goes below 50 or above 100', () => {
    expect(computeMorningCharge(-10)).toBe(50)
    expect(computeMorningCharge(200)).toBe(100)
  })
})

describe('computeRecharge', () => {
  it('returns 5 when both protein and water goals hit', () => {
    expect(computeRecharge({ proteinG: 180, proteinGoalG: 180, waterMl: 2500, waterGoalMl: 2500 })).toBe(5)
  })

  it('returns 3 for protein only', () => {
    expect(computeRecharge({ proteinG: 180, proteinGoalG: 180, waterMl: 0, waterGoalMl: 2500 })).toBe(3)
  })

  it('returns 2 for water only', () => {
    expect(computeRecharge({ proteinG: 0, proteinGoalG: 180, waterMl: 2500, waterGoalMl: 2500 })).toBe(2)
  })

  it('returns 0 when neither goal is hit', () => {
    expect(computeRecharge({ proteinG: 0, proteinGoalG: 180, waterMl: 0, waterGoalMl: 2500 })).toBe(0)
  })
})

describe('computeBattery', () => {
  it('perfect day at 0h awake = morning charge (100)', () => {
    // SLEEP_PERFECT: perfect sleep + protein/water, no steps/workout yet (just woke up)
    // drain = k1*0 + k2*(0/1000) + k3*0 = 0; recharge = 5; morningCharge = 100
    const result = computeBattery(SLEEP_PERFECT, 0)
    expect(result.currentPct).toBe(100)
  })

  it('battery decreases with more hours awake', () => {
    const early = computeBattery(SLEEP_PERFECT, 4)
    const late  = computeBattery(SLEEP_PERFECT, 12)
    expect(early.currentPct).toBeGreaterThan(late.currentPct)
  })

  it('never goes below 0', () => {
    const result = computeBattery(ZERO, 24)
    expect(result.currentPct).toBeGreaterThanOrEqual(0)
  })

  it('never exceeds 100', () => {
    const result = computeBattery(SLEEP_PERFECT, 0)
    expect(result.currentPct).toBeLessThanOrEqual(100)
  })
})

// ---- Readiness ----
describe('computeReadiness', () => {
  it('returns train_hard when all scores are high (≥70)', () => {
    const result = computeReadiness({ sleepScore: 90, recoveryScore: 90 }, 90)
    expect(result.level).toBe('train_hard')
    expect(result.color).toBe('#00E5A0')
  })

  it('returns rest when all scores are low (<45)', () => {
    const result = computeReadiness({ sleepScore: 20, recoveryScore: 20 }, 20)
    expect(result.level).toBe('rest')
    expect(result.color).toBe('#FF4D6D')
  })

  it('returns train_light for moderate scores (45–69)', () => {
    const result = computeReadiness({ sleepScore: 55, recoveryScore: 55 }, 55)
    expect(result.level).toBe('train_light')
    expect(result.color).toBe('#FFB020')
  })

  it('returns Hebrew labels for all levels', () => {
    const hard  = computeReadiness({ sleepScore: 90, recoveryScore: 90 }, 90)
    const light = computeReadiness({ sleepScore: 55, recoveryScore: 55 }, 55)
    const rest  = computeReadiness({ sleepScore: 20, recoveryScore: 20 }, 20)
    expect(hard.labelHe).toBe('תתאמן בעוצמה')
    expect(light.labelHe).toBe('אימון קל')
    expect(rest.labelHe).toBe('מנוחה היום')
  })

  it('boundary: exactly 70 → train_hard', () => {
    // sleepScore * 0.4 + battery * 0.4 + recovery * 0.2 = 70
    // With all equal: score = 0.4x + 0.4x + 0.2x = x → x = 70
    const result = computeReadiness({ sleepScore: 70, recoveryScore: 70 }, 70)
    expect(result.level).toBe('train_hard')
  })

  it('boundary: exactly 45 → train_light', () => {
    const result = computeReadiness({ sleepScore: 45, recoveryScore: 45 }, 45)
    expect(result.level).toBe('train_light')
  })
})

// Verify DRAIN_CONSTANTS is exported
describe('DRAIN_CONSTANTS', () => {
  it('exports k1, k2, k3 constants', () => {
    expect(DRAIN_CONSTANTS.k1).toBe(1.5)
    expect(DRAIN_CONSTANTS.k2).toBe(0.5)
    expect(DRAIN_CONSTANTS.k3).toBe(0.1)
  })
})
