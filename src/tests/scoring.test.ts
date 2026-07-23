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
import { computeHydrationScore } from '@/lib/scoring/score'
import { computeMorningCharge, computeBattery, computeSleepQuality, BATTERY } from '@/lib/scoring/battery'
import { computeReadiness } from '@/lib/scoring/readiness'
import type { ScoringInputs } from '@/lib/scoring/types'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const PERFECT: ScoringInputs = {
  sleepHours: 8, deepMinutes: 100, remMinutes: 100, sleepGoalHours: 8,
  calories: 1955, proteinG: 170, carbsG: 195, fatG: 55,           // Cut goals
  calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
  steps: 10000, activeCal: 500, stepsGoal: 10000, activeCalGoal: 500,
  workoutLogged: true, isRestDay: false,
  newPRsToday: 2, sessionVolumeKg: 4000, trailingAvgVolumeKg: 3500,
  waterMl: 3000, waterGoalMl: 3000, supplementsTaken: 3, supplementsGoal: 3,
  contextMode: 'normal',
}

const PERFECT_TRAINING_BATTERY: ScoringInputs = {
  ...PERFECT,
  steps: 10000, sessionVolumeKg: 4000,
  proteinG: 170, waterMl: 3000,
}

const ZERO: ScoringInputs = {
  sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8,
  calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
  calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
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

  it('returns null for 0 hours sleep (no data ≠ a zero score)', () => {
    expect(computeSleepScore({ sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8 })).toBeNull()
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
    expect(withBonus! - without!).toBe(5)
  })

  it('never exceeds 100', () => {
    const score = computeSleepScore({ sleepHours: 12, deepMinutes: 120, remMinutes: 120, sleepGoalHours: 8 })
    expect(score).toBeLessThanOrEqual(100)
  })

  it('returns null when there is no sleep data even if the goal is 0', () => {
    expect(computeSleepScore({ sleepHours: 0, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 0 })).toBeNull()
  })

  it('emergency context reduces penalties (same sleep → higher score in emergency vs normal)', () => {
    const normal    = computeSleepScore({ sleepHours: 4, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8, contextMode: 'normal' })
    const emergency = computeSleepScore({ sleepHours: 4, deepMinutes: 0, remMinutes: 0, sleepGoalHours: 8, contextMode: 'emergency' })
    expect(emergency!).toBeGreaterThan(normal!)
  })
})

// ─── Nutrition Score ───────────────────────────────────────────────────────────
describe('computeNutritionScore', () => {
  const goals = { calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55 }

  it('returns 100 when all macros exactly hit goals', () => {
    expect(computeNutritionScore({
      calories: 1955, proteinG: 170, carbsG: 195, fatG: 55, ...goals,
    })).toBe(100)
  })

  it('returns null when nothing is logged (calories 0 → no data)', () => {
    expect(computeNutritionScore({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, ...goals })).toBeNull()
  })

  it('protein has double weight: 50% protein deficit scores lower than 50% carb deficit', () => {
    const proteinMiss = computeNutritionScore({ calories: 1955, proteinG: 90,  carbsG: 195, fatG: 55, ...goals })
    const carbMiss    = computeNutritionScore({ calories: 1955, proteinG: 170, carbsG: 90,  fatG: 55, ...goals })
    expect(proteinMiss!).toBeLessThan(carbMiss!)
  })

  it('stays within 0–100 for an extreme over-eating day', () => {
    const s = computeNutritionScore({ calories: 5000, proteinG: 500, carbsG: 600, fatG: 200, ...goals })
    expect(s!).toBeGreaterThanOrEqual(0)
    expect(s!).toBeLessThanOrEqual(100)
  })
})

// ─── Activity Score ────────────────────────────────────────────────────────────
describe('computeActivityScore', () => {
  it('returns 100 when steps and cal both hit goals', () => {
    expect(computeActivityScore({ steps: 10000, activeCal: 500, stepsGoal: 10000, activeCalGoal: 500 })).toBe(100)
  })

  it('returns null when steps and cal are both 0 (no activity data)', () => {
    expect(computeActivityScore({ steps: 0, activeCal: 0, stepsGoal: 10000, activeCalGoal: 500 })).toBeNull()
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
  it('returns null on a rest day (NOT a fake 100)', () => {
    expect(computeWorkoutScore({
      workoutLogged: false, isRestDay: true, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
    })).toBeNull()
  })

  it('returns null in travel/vacation context (no training expectation)', () => {
    expect(computeWorkoutScore({
      workoutLogged: false, isRestDay: false, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0, contextMode: 'travel',
    })).toBeNull()
  })

  it('returns null (pending) for the current day before 21:00 with no session', () => {
    expect(computeWorkoutScore({
      workoutLogged: false, isRestDay: false, newPRsToday: 0, sessionVolumeKg: 0, trailingAvgVolumeKg: 0, isCurrentDay: true, localHour: 14,
    })).toBeNull()
  })

  it('returns 0 for a past training day with no session (genuinely missed)', () => {
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
describe('computeRecoveryScore (physiological — sleep + resting HR)', () => {
  it('returns null when there is no sleep and no HR data', () => {
    expect(computeRecoveryScore({ sleepHours: 0, deepMinutes: 0, sleepGoalHours: 8 })).toBeNull()
  })

  it('scores from sleep alone when HR is absent', () => {
    expect(computeRecoveryScore({ sleepHours: 8, deepMinutes: 90, sleepGoalHours: 8 })).toBe(100)
  })

  it('elevated resting HR penalizes recovery score', () => {
    const normal   = computeRecoveryScore({ sleepHours: 8, deepMinutes: 90, sleepGoalHours: 8, restingHR: 60, baselineHR: 58 })
    const elevated = computeRecoveryScore({ sleepHours: 8, deepMinutes: 90, sleepGoalHours: 8, restingHR: 75, baselineHR: 58 })
    expect(elevated!).toBeLessThan(normal!)
  })
})

// ─── Daily Score composite ─────────────────────────────────────────────────────
describe('computeDailyScore', () => {
  it('perfect inputs produce score of 100', () => {
    const result = computeDailyScore(PERFECT)
    expect(result.totalScore).toBe(100)
  })

  it('empty non-travel day: data components null, missed workout = 0, total = 0', () => {
    const result = computeDailyScore(ZERO)
    expect(result.sleepScore).toBeNull()
    expect(result.recoveryScore).toBeNull()
    expect(result.workoutScore).toBe(0)   // training day, genuinely missed
    expect(result.totalScore).toBe(0)
  })

  it('vacation (travel) with no data → total null (blank day, not a fake 0)', () => {
    const result = computeDailyScore({ ...ZERO, contextMode: 'travel' })
    expect(result.workoutScore).toBeNull()
    expect(result.totalScore).toBeNull()
  })

  it('rest day: workout null, total renormalized over the remaining components', () => {
    const result = computeDailyScore({ ...PERFECT, isRestDay: true, workoutLogged: false })
    expect(result.workoutScore).toBeNull()
    expect(result.totalScore).toBe(100)
  })

  it('returns integer scores (Math.round applied)', () => {
    const result = computeDailyScore(PERFECT)
    expect(Number.isInteger(result.totalScore as number)).toBe(true)
    expect(Number.isInteger(result.sleepScore as number)).toBe(true)
  })

  it('a 3h14m night HARD-CAPS the whole day (≤30) even with perfect everything else', () => {
    // Regression: the "July 15" bug — 3h14m sleep must never total 81.
    const result = computeDailyScore({ ...PERFECT, sleepHours: 3 + 14 / 60, deepMinutes: 20, remMinutes: 20 })
    expect(result.totalScore).toBeLessThanOrEqual(30)
  })

  it('flags awaitingSleep on the live current day with no sleep synced', () => {
    const result = computeDailyScore({ ...PERFECT, sleepHours: 0, deepMinutes: 0, remMinutes: 0, isCurrentDay: true })
    expect(result.awaitingSleep).toBe(true)
    expect(result.sleepScore).toBeNull()
  })

  it('does NOT flag awaitingSleep for a past day (only the live day pends)', () => {
    const result = computeDailyScore({ ...PERFECT, sleepHours: 0, deepMinutes: 0, remMinutes: 0, isCurrentDay: false })
    expect(result.awaitingSleep).toBe(false)
  })

  it('water contributes to the composite (hydration score present)', () => {
    const result = computeDailyScore(PERFECT)
    expect(result.hydrationScore).toBe(100)
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

describe('computeHydrationScore', () => {
  it('returns 100 when water hits goal', () => {
    expect(computeHydrationScore({ waterMl: 3000, waterGoalMl: 3000 })).toBe(100)
  })
  it('caps at 100 when over goal', () => {
    expect(computeHydrationScore({ waterMl: 4500, waterGoalMl: 3000 })).toBe(100)
  })
  it('scales below goal (1500/3000 → 50)', () => {
    expect(computeHydrationScore({ waterMl: 1500, waterGoalMl: 3000 })).toBe(50)
  })
  it('returns null (excluded) when nothing logged yet', () => {
    expect(computeHydrationScore({ waterMl: 0, waterGoalMl: 3000 })).toBeNull()
  })
  it('returns null when there is no water goal', () => {
    expect(computeHydrationScore({ waterMl: 500, waterGoalMl: 0 })).toBeNull()
  })
})

describe('computeBattery — phone-like', () => {
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
    expect(result.color).toBe('#34D399')
  })

  it('returns rest when all scores are low (<45)', () => {
    const result = computeReadiness({ sleepScore: 20, recoveryScore: 20 }, 20)
    expect(result.level).toBe('rest')
    expect(result.color).toBe('#FB7185')
  })

  it('returns train_light for moderate scores (45–69)', () => {
    const result = computeReadiness({ sleepScore: 55, recoveryScore: 55 }, 55)
    expect(result.level).toBe('train_light')
    expect(result.color).toBe('#FBBF24')
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

describe('computeBattery — drain-only (v6)', () => {
  it('a heavy leg day drains MUCH more than a light arm day', () => {
    const base = { ...PERFECT, proteinG: 0, waterMl: 0 }  // recharge no longer exists
    const legDay = computeBattery({ ...base, splitDay: 'legs', sessionVolumeKg: 9000 }, 12).currentPct
    const armDay = computeBattery({ ...base, splitDay: 'pull', sessionVolumeKg: 3500 }, 12).currentPct
    expect(legDay).toBeLessThan(armDay - 12)   // a clear, sensible spread
    expect(legDay).toBeGreaterThan(BATTERY.floor)  // hard day, but not pinned at floor
    expect(armDay).toBeGreaterThan(30)             // easy day stays comfortably up
  })

  it('eating does not raise the battery (no recharge term)', () => {
    const hungry = computeBattery({ ...PERFECT, proteinG: 0, waterMl: 0, sessionVolumeKg: 0 }, 8).currentPct
    const fed    = computeBattery({ ...PERFECT, proteinG: 170, waterMl: 3000, sessionVolumeKg: 0 }, 8).currentPct
    expect(fed).toBe(hungry)   // protein/water make no difference to battery now
  })
})

// ─── Battery constants ────────────────────────────────────────────────────────
describe('BATTERY constants', () => {
  it('exposes a sane floor + chronological drain rate', () => {
    expect(BATTERY.floor).toBe(5)
    expect(BATTERY.drainPerHour).toBe(2.2)
    expect(BATTERY.maxAwake).toBe(18)
  })
})
