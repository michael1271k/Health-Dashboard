import { describe, it, expect } from 'vitest'
import {
  computeSleepScore,
  computeNutritionScore,
  computeActivityScore,
  computeWorkoutScore,
  computeRecoveryScore,
  computeDailyScore,
  computeAlerts,
} from '@/lib/scoring/score'
import { computeMorningCharge, computeBattery, computeRecharge, computeSleepQuality, BATTERY } from '@/lib/scoring/battery'
import { computeReadiness } from '@/lib/scoring/readiness'
import type { ScoringInputs } from '@/lib/scoring/types'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const PERFECT: ScoringInputs = {
  sleepHours: 8, deepMinutes: 100, remMinutes: 100, sleepGoalHours: 8,
  calories: 1935, proteinG: 180, carbsG: 180, fatG: 55,           // Cut goals
  calorieGoal: 1935, proteinGoalG: 180, carbsGoalG: 180, fatGoalG: 55,
  steps: 10000, activeCal: 500, stepsGoal: 10000, activeCalGoal: 500,
  workoutLogged: true, isRestDay: false,
  newPRsToday: 2, sessionVolumeKg: 4000, trailingAvgVolumeKg: 3500,
  waterMl: 3000, waterGoalMl: 3000, supplementsTaken: 3, supplementsGoal: 3,
  contextMode: 'normal',
}

const PERFECT_TRAINING_BATTERY: ScoringInputs = {
  ...PERFECT,
  steps: 10000, sessionVolumeKg: 4000,
  proteinG: 180, waterMl: 3000,
}

const ZERO: ScoringInputs = {
  sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8,
  calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
  calorieGoal: 1935, proteinGoalG: 180, carbsGoalG: 180, fatGoalG: 55,
  steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 500,
  workoutLogged: false, isRestDay: false,
  newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
  waterMl: 0, waterGoalMl: 3000, supplementsTaken: 0, supplementsGoal: 3,
  contextMode: 'normal',
}

// ─── Sleep Score ───────────────────────────────────────────────────────────────
describe('computeSleepScore', () => {
  it('returns 100 for goal hours + deep & REM bonus', () => {
    expect(computeSleepScore({ sleepHours: 8, deepMinutes: 100, remMinutes: 100, sleepGoalHours: 8 })).toBe(100)
  })

  it('returns 100 for 8h sleep with no deep/REM bonus (base 100, no deficit)', () => {
    expect(computeSleepScore({ sleepHours: 8, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8 })).toBe(100)
  })

  it('returns 0 for 0 hours sleep', () => {
    expect(computeSleepScore({ sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8 })).toBe(0)
  })

  it('within ±0.5h tolerance band → full credit', () => {
    // 7.6h — within the 0.5h tolerance of 8h goal
    const score = computeSleepScore({ sleepHours: 7.6, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8 })
    expect(score).toBe(100)
  })

  it('outside tolerance band → penalized', () => {
    // 6.5h — 1.5h below goal, 1h outside tolerance
    const score = computeSleepScore({ sleepHours: 6.5, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8 })
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(90)
  })

  it('adds deep sleep bonus only when ≥90min (tested below tolerance band)', () => {
    // Use 6h sleep (1.5h below 8h goal, outside the 0.5h band) so there is headroom for the bonus
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

  it('emergency context reduces penalties (same sleep → higher score in emergency vs normal)', () => {
    const normal    = computeSleepScore({ sleepHours: 4, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8, contextMode: 'normal' })
    const emergency = computeSleepScore({ sleepHours: 4, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8, contextMode: 'emergency' })
    expect(emergency).toBeGreaterThan(normal)
  })
})

// ─── Nutrition Score ───────────────────────────────────────────────────────────
describe('computeNutritionScore', () => {
  const goals = { calorieGoal: 1935, proteinGoalG: 180, carbsGoalG: 180, fatGoalG: 55 }

  it('returns 100 when all macros exactly hit goals', () => {
    expect(computeNutritionScore({
      calories: 1935, proteinG: 180, carbsG: 180, fatG: 55, ...goals,
    })).toBe(100)
  })

  it('returns 0 when all macros are 0 (100% error)', () => {
    const score = computeNutritionScore({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, ...goals })
    expect(score).toBe(0)
  })

  it('protein has double weight: 50% protein deficit scores lower than 50% carb deficit', () => {
    const proteinMiss = computeNutritionScore({ calories: 1935, proteinG: 90,  carbsG: 180, fatG: 55, ...goals })
    const carbMiss    = computeNutritionScore({ calories: 1935, proteinG: 180, carbsG: 90,  fatG: 55, ...goals })
    expect(proteinMiss).toBeLessThan(carbMiss)
  })

  it('is always between 0 and 100', () => {
    const extremes = [
      { calories: 5000, proteinG: 500, carbsG: 600, fatG: 200 },
      { calories: 0,    proteinG: 0,   carbsG: 0,   fatG: 0   },
    ]
    for (const e of extremes) {
      const s = computeNutritionScore({ ...e, ...goals })
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })
})

// ─── Activity Score ────────────────────────────────────────────────────────────
describe('computeActivityScore', () => {
  it('returns 100 when steps and cal both hit goals', () => {
    expect(computeActivityScore({ steps: 10000, activeCal: 500, stepsGoal: 10000, activeCalGoal: 500 })).toBe(100)
  })

  it('returns 0 when steps and cal are both 0', () => {
    expect(computeActivityScore({ steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 500 })).toBe(0)
  })

  it('returns 50 when only steps hit goal', () => {
    expect(computeActivityScore({ steps: 10000, activeCal: 0, stepsGoal: 10000, activeCalGoal: 500 })).toBe(50)
  })

  it('caps at 100 even when over goal', () => {
    expect(computeActivityScore({ steps: 20000, activeCal: 1000, stepsGoal: 10000, activeCalGoal: 500 })).toBe(100)
  })
})

// ─── Workout Score ─────────────────────────────────────────────────────────────
describe('computeWorkoutScore', () => {
  it('returns 100 on a rest day (rest is part of the plan)', () => {
    expect(computeWorkoutScore({
      workoutLogged: false, isRestDay: true, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
    })).toBe(100)
  })

  it('returns 0 when no workout logged on a training day', () => {
    expect(computeWorkoutScore({
      workoutLogged: false, isRestDay: false, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
    })).toBe(0)
  })

  it('returns 60 base for logging a session below trailing avg', () => {
    expect(computeWorkoutScore({
      workoutLogged: true, isRestDay: false, newPRsToday: 0, sessionVolumeKg: 3000, trailingAvgVolumeKg: 4000,
    })).toBe(60)
  })

  it('returns 80 for session at or above trailing avg', () => {
    expect(computeWorkoutScore({
      workoutLogged: true, isRestDay: false, newPRsToday: 0, sessionVolumeKg: 5000, trailingAvgVolumeKg: 4000,
    })).toBe(80)
  })

  it('returns 100 for volume ≥ avg + 2 PRs', () => {
    expect(computeWorkoutScore({
      workoutLogged: true, isRestDay: false, newPRsToday: 2, sessionVolumeKg: 5000, trailingAvgVolumeKg: 4000,
    })).toBe(100)
  })

  it('caps PR bonus at 20 (2 PRs = max)', () => {
    expect(computeWorkoutScore({
      workoutLogged: true, isRestDay: false, newPRsToday: 10, sessionVolumeKg: 5000, trailingAvgVolumeKg: 4000,
    })).toBe(100)
  })
})

// ─── Recovery Score ────────────────────────────────────────────────────────────
describe('computeRecoveryScore', () => {
  it('returns 100 when water and supplements both at goal', () => {
    expect(computeRecoveryScore({ waterMl: 3000, waterGoalMl: 3000, supplementsTaken: 3, supplementsGoal: 3 })).toBe(100)
  })

  it('returns 0 when both are 0', () => {
    expect(computeRecoveryScore({ waterMl: 0, waterGoalMl: 3000, supplementsTaken: 0, supplementsGoal: 3 })).toBe(0)
  })

  it('handles 0 supplementsGoal without dividing by zero', () => {
    expect(() =>
      computeRecoveryScore({ waterMl: 3000, waterGoalMl: 3000, supplementsTaken: 0, supplementsGoal: 0 })
    ).not.toThrow()
  })

  it('elevated resting HR penalizes recovery score', () => {
    const normal   = computeRecoveryScore({ waterMl: 3000, waterGoalMl: 3000, supplementsTaken: 3, supplementsGoal: 3, restingHR: 60, baselineHR: 58 })
    const elevated = computeRecoveryScore({ waterMl: 3000, waterGoalMl: 3000, supplementsTaken: 3, supplementsGoal: 3, restingHR: 75, baselineHR: 58 })
    expect(elevated).toBeLessThan(normal)
  })
})

// ─── Daily Score composite ─────────────────────────────────────────────────────
describe('computeDailyScore', () => {
  it('perfect inputs produce score of 100', () => {
    const result = computeDailyScore(PERFECT)
    expect(result.totalScore).toBe(100)
  })

  it('zero inputs produce score of 0', () => {
    const result = computeDailyScore(ZERO)
    expect(result.totalScore).toBe(0)
  })

  it('rest day: workout score is 100 (neutral) and total is still high', () => {
    const restInputs: ScoringInputs = { ...PERFECT, isRestDay: true, workoutLogged: false }
    const result = computeDailyScore(restInputs)
    expect(result.workoutScore).toBe(100)
    expect(result.totalScore).toBe(100)
  })

  it('returns integer scores (Math.round applied)', () => {
    const result = computeDailyScore(PERFECT)
    expect(Number.isInteger(result.totalScore)).toBe(true)
    expect(Number.isInteger(result.sleepScore)).toBe(true)
  })
})

// ─── Battery ──────────────────────────────────────────────────────────────────
describe('computeMorningCharge (sleep quality 0..1 → 55..100)', () => {
  it('worst sleep → 55', () => { expect(computeMorningCharge(0)).toBe(55) })
  it('perfect sleep → 100', () => { expect(computeMorningCharge(1)).toBe(100) })
  it('half quality → 78 (55 + 45×0.5)', () => { expect(computeMorningCharge(0.5)).toBe(78) })
  it('clamps out-of-range input', () => {
    expect(computeMorningCharge(-1)).toBe(55)
    expect(computeMorningCharge(2)).toBe(100)
  })
})

describe('computeRecharge', () => {
  it('returns 10 when both protein and water goals hit', () => {
    expect(computeRecharge({ proteinG: 180, proteinGoalG: 180, waterMl: 3000, waterGoalMl: 3000 })).toBe(10)
  })

  it('returns 6 for protein only', () => {
    expect(computeRecharge({ proteinG: 180, proteinGoalG: 180, waterMl: 0, waterGoalMl: 3000 })).toBe(6)
  })

  it('returns 4 for water only', () => {
    expect(computeRecharge({ proteinG: 0, proteinGoalG: 180, waterMl: 3000, waterGoalMl: 3000 })).toBe(4)
  })

  it('returns 0 when neither goal is hit', () => {
    expect(computeRecharge({ proteinG: 0, proteinGoalG: 180, waterMl: 0, waterGoalMl: 3000 })).toBe(0)
  })
})

describe('computeBattery — phone-like (Phase 8)', () => {
  it('is high in the morning after good sleep — never ~0% at breakfast', () => {
    // 8h sleep, ~1.5h awake, no workout yet, light steps
    const morning = computeBattery(
      { ...PERFECT, sessionVolumeKg: 0, steps: 1500, activeCal: 80, proteinG: 0, waterMl: 0 },
      1.5,
    )
    expect(morning.currentPct).toBeGreaterThanOrEqual(85)
  })

  it('evening training day lands in a sensible mid range', () => {
    const result = computeBattery(PERFECT_TRAINING_BATTERY, 16)
    expect(result.currentPct).toBeGreaterThanOrEqual(33)
    expect(result.currentPct).toBeLessThanOrEqual(50)
  })

  it('drains with more hours awake', () => {
    expect(computeBattery(PERFECT, 4).currentPct).toBeGreaterThan(computeBattery(PERFECT, 12).currentPct)
  })

  it('never drops below the floor', () => {
    expect(computeBattery(ZERO, 24).currentPct).toBeGreaterThanOrEqual(BATTERY.floor)
  })

  it('never exceeds 100', () => {
    expect(computeBattery(PERFECT, 0).currentPct).toBeLessThanOrEqual(100)
  })

  it('worse sleep lowers the wake charge', () => {
    expect(computeSleepQuality(ZERO)).toBeLessThan(computeSleepQuality(PERFECT))
  })
})

// ─── Readiness ────────────────────────────────────────────────────────────────
describe('computeReadiness', () => {
  it('returns train_hard when all scores are high (≥70)', () => {
    const result = computeReadiness({ sleepScore: 90, recoveryScore: 90 }, 90)
    expect(result.level).toBe('train_hard')
    expect(result.color).toBe('#19E3B1')
  })

  it('returns rest when all scores are low (<45)', () => {
    const result = computeReadiness({ sleepScore: 20, recoveryScore: 20 }, 20)
    expect(result.level).toBe('rest')
    expect(result.color).toBe('#FF5470')
  })

  it('returns train_light for moderate scores (45–69)', () => {
    const result = computeReadiness({ sleepScore: 55, recoveryScore: 55 }, 55)
    expect(result.level).toBe('train_light')
    expect(result.color).toBe('#FFB020')
  })

  it('returns strict-English labels for all levels', () => {
    const hard  = computeReadiness({ sleepScore: 90, recoveryScore: 90 }, 90)
    const light = computeReadiness({ sleepScore: 55, recoveryScore: 55 }, 55)
    const rest  = computeReadiness({ sleepScore: 20, recoveryScore: 20 }, 20)
    expect(hard.label).toBe('Train Hard')
    expect(light.label).toBe('Train Light')
    expect(rest.label).toBe('Rest Today')
  })
})

// ─── Alert Engine ─────────────────────────────────────────────────────────────
describe('computeAlerts', () => {
  it('fires "do not train" alert when sleep < 6h on a training day', () => {
    const inputs: ScoringInputs = { ...PERFECT, sleepHours: 5, isRestDay: false }
    const alerts = computeAlerts(inputs, 60)
    expect(alerts.some((a) => a.message.includes('do not train'))).toBe(true)
  })

  it('does NOT fire "do not train" alert on a rest day', () => {
    const inputs: ScoringInputs = { ...PERFECT, sleepHours: 5, isRestDay: true }
    const alerts = computeAlerts(inputs, 60)
    expect(alerts.some((a) => a.message.includes('do not train'))).toBe(false)
  })

  it('fires battery alert when battery < 20%', () => {
    const alerts = computeAlerts(PERFECT, 15)
    expect(alerts.some((a) => a.message.includes('Energy reserves low'))).toBe(true)
  })

  it('does not fire "do not train" in emergency context', () => {
    const inputs: ScoringInputs = { ...PERFECT, sleepHours: 4, isRestDay: false, contextMode: 'emergency' }
    const alerts = computeAlerts(inputs, 60)
    expect(alerts.some((a) => a.message.includes('do not train'))).toBe(false)
  })

  it('fires elevated HR alert when restingHR > baseline + 7', () => {
    const inputs: ScoringInputs = { ...PERFECT, restingHR: 75, baselineHR: 60 }
    const alerts = computeAlerts(inputs, 70)
    expect(alerts.some((a) => a.message.includes('resting HR'))).toBe(true)
  })
})

// ─── Battery constants ────────────────────────────────────────────────────────
describe('BATTERY constants', () => {
  it('exposes a sane floor + chronological drain rate', () => {
    expect(BATTERY.floor).toBe(5)
    expect(BATTERY.drainPerHour).toBe(3.0)
    expect(BATTERY.maxAwake).toBe(18)
  })
})
