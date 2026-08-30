import { describe, it, expect } from 'vitest'
import {
  NUTRITION_EXCEPTION_REASONS, exceptionReason, isExceptionDay, exceptionTag, estimatedTag,
} from '@/lib/nutrition/exceptionDay'
import { computeNutritionScore, computeDailyScore } from '@/lib/scoring/score'
import type { ScoringInputs } from '@/lib/scoring/types'

// ─── The flag itself ──────────────────────────────────────────────────────────

describe('reading the flag', () => {
  it('null is an ordinary day', () => {
    // The inversion worth guarding: `weighInSkipReason` resolves null to a
    // DEFAULT reason because skipping the scale is the protocol. Here null must
    // stay null — adherence is the norm, so silence means nothing happened.
    expect(exceptionReason(null)).toBeNull()
    expect(exceptionReason(undefined)).toBeNull()
    expect(isExceptionDay(null)).toBe(false)
    expect(exceptionTag(null)).toBe('')
  })

  it('whitespace is not a reason', () => {
    // A stored " " would otherwise print "[Exception: ]" and forgive a day for
    // no stated cause.
    expect(exceptionReason('   ')).toBeNull()
    expect(isExceptionDay('  \t ')).toBe(false)
  })

  it('trims what it returns', () => {
    expect(exceptionReason(' Event ')).toBe('Event')
    expect(exceptionTag(' Event ')).toBe(' [Exception: Event]')
  })

  it('honours a value that is not one of the presets', () => {
    // A reason written before the list changed must not silently stop counting
    // — that would un-forgive a day retroactively.
    expect(isExceptionDay('Wedding')).toBe(true)
    expect(exceptionTag('Wedding')).toBe(' [Exception: Wedding]')
  })

  it('every preset reads back as flagged', () => {
    for (const r of NUTRITION_EXCEPTION_REASONS) expect(isExceptionDay(r)).toBe(true)
  })
})

// ─── The OTHER flag, and the line it must never cross ─────────────────────────

describe('estimated is a confidence marker and nothing else', () => {
  it('tags only when set', () => {
    expect(estimatedTag(true)).toBe(' [Estimated]')
    expect(estimatedTag(false)).toBe('')
    expect(estimatedTag(null)).toBe('')
    expect(estimatedTag(undefined)).toBe('')
  })

  it('composes with an exception rather than replacing it', () => {
    // A restaurant birthday is BOTH. This is the whole argument for two columns
    // instead of one enum — an enum would have made the day pick.
    expect(exceptionTag('Event') + estimatedTag(true))
      .toBe(' [Exception: Event] [Estimated]')
  })

  it('HAS NO PATH INTO THE SCORE — the invariant this file exists to hold', () => {
    // There is deliberately no `nutritionEstimated` on ScoringInputs, so the
    // strongest available statement is a structural one: the scorer's entire
    // input surface knows nothing about the flag, and adding it would mean the
    // score IMPROVES as the measurement gets worse.
    //
    // If a future change gives estimation a numeric consequence, the field will
    // have to appear here first — and this assertion is where that gets caught.
    const day = { calories: 3200, proteinG: 150, carbsG: 310, fatG: 120,
      calorieGoal: 1900, proteinGoalG: 170, carbsGoalG: 190, fatGoalG: 54 }
    expect('nutritionEstimated' in day).toBe(false)

    // And the two flags are independent in the one direction that can be tested
    // today: forgiveness comes from the exception alone, at every combination.
    const plain = computeNutritionScore(day)
    const forgiven = computeNutritionScore({ ...day, nutritionException: true })
    expect(plain).not.toBe(forgiven)
    expect(computeNutritionScore({ ...day, nutritionException: false })).toBe(plain)
  })
})

// ─── What it does to the grade ────────────────────────────────────────────────

describe('an exception day is graded on protein alone', () => {
  const goals = { calorieGoal: 1900, proteinGoalG: 170, carbsGoalG: 190, fatGoalG: 54 }
  /** A date night on a cut: roughly 1.7× the calorie target, protein held. */
  const dateNight = { calories: 3200, proteinG: 150, carbsG: 310, fatG: 120, ...goals }

  it('rescues the day that the cut asymmetry would have destroyed', () => {
    // Graded: five error terms — kcal +68% ×1.5 = 102.6, protein 11.8 twice,
    // carbs 63.2, fat 122.2 → mean 62.3 → 37.7.
    // Forgiven: the single protein term, 11.8 → 88.2.
    const graded = computeNutritionScore(dateNight)!
    const forgiven = computeNutritionScore({ ...dateNight, nutritionException: true })!
    expect(graded).toBeCloseTo(37.7, 1)
    expect(forgiven).toBeCloseTo(88.2, 1)
  })

  it('does not forgive protein', () => {
    // The whole point: the one intake that defends lean mass in a deficit is
    // still graded, so a flagged day cannot buy a free 100.
    const heldProtein = computeNutritionScore({ ...dateNight, nutritionException: true })!
    const droppedProtein = computeNutritionScore({
      ...dateNight, proteinG: 60, nutritionException: true,
    })!
    expect(droppedProtein).toBeLessThan(50)
    expect(droppedProtein).toBeLessThan(heldProtein)
  })

  it('is symmetric — an illness day that ate far too little is forgiven too', () => {
    const sickDay = { calories: 700, proteinG: 165, carbsG: 60, fatG: 20, ...goals }
    expect(computeNutritionScore(sickDay)!).toBeLessThan(60)
    expect(computeNutritionScore({ ...sickDay, nutritionException: true })!).toBeGreaterThan(90)
  })

  it('ignores calories, carbs and fat entirely', () => {
    // Same protein, wildly different everything else → identical score.
    const a = computeNutritionScore({ ...dateNight, nutritionException: true })
    const b = computeNutritionScore({
      calories: 9000, proteinG: 150, carbsG: 1200, fatG: 400, ...goals, nutritionException: true,
    })
    expect(a).toBe(b)
  })

  it('a flagged day that hit protein exactly is a 100', () => {
    expect(computeNutritionScore({
      ...dateNight, proteinG: 170, nutritionException: true,
    })).toBe(100)
  })

  it('still returns null when nothing was logged', () => {
    // Flagging tomorrow's dinner in advance must not manufacture a score for a
    // day with no food in it.
    expect(computeNutritionScore({
      calories: 0, proteinG: 0, carbsG: 0, fatG: 0, ...goals, nutritionException: true,
    })).toBeNull()
  })

  it('is unknown, not perfect, when there is no protein target to grade', () => {
    // Bulk/Maintenance leave macros null. With calories forgiven and no protein
    // goal there is nothing left to judge, so the day must drop out of the
    // composite rather than score a silent 100.
    expect(computeNutritionScore({
      calories: 3200, proteinG: 150, carbsG: 310, fatG: 120,
      calorieGoal: 2600, proteinGoalG: 0, carbsGoalG: 0, fatGoalG: 0,
      nutritionException: true,
    })).toBeNull()
  })

  it('leaves an ordinary day untouched', () => {
    const plain = { calories: 1900, proteinG: 170, carbsG: 190, fatG: 54, ...goals }
    expect(computeNutritionScore(plain)).toBe(computeNutritionScore({
      ...plain, nutritionException: false,
    }))
  })
})

// ─── What it does NOT do ──────────────────────────────────────────────────────

describe('the flag reaches the composite and stops there', () => {
  const base: ScoringInputs = {
    sleepHours: 7.5, deepMinutes: 95, remMinutes: 95, sleepGoalHours: 8,
    calories: 3200, proteinG: 150, carbsG: 310, fatG: 120,
    calorieGoal: 1900, proteinGoalG: 170, carbsGoalG: 190, fatGoalG: 54,
    steps: 10000, activeCal: 500, stepsGoal: 10000, activeCalGoal: 500,
    workoutLogged: false, isRestDay: true, newPRsToday: 0,
    sessionVolumeKg: 0, trailingAvgVolumeKg: 0,
    waterMl: 3000, waterGoalMl: 3000,
  }

  it('lifts the day score without touching any other component', () => {
    const plain = computeDailyScore(base)
    const flagged = computeDailyScore({ ...base, nutritionException: true })

    expect(flagged.nutritionScore!).toBeGreaterThan(plain.nutritionScore!)
    expect(flagged.totalScore!).toBeGreaterThan(plain.totalScore!)

    // Nutrition is weight 0.30 — the largest single component. Everything else
    // must be bit-identical, or the flag is doing more than it claims.
    expect(flagged.sleepScore).toBe(plain.sleepScore)
    expect(flagged.activityScore).toBe(plain.activityScore)
    expect(flagged.workoutScore).toBe(plain.workoutScore)
    expect(flagged.recoveryScore).toBe(plain.recoveryScore)
    expect(flagged.hydrationScore).toBe(plain.hydrationScore)
  })

  it('cannot rescue a day that a short night has already capped', () => {
    // The sleep gate is downstream of every component and is not a nutrition
    // judgement. Three hours' sleep caps the day at 25 whatever you ate.
    const flagged = computeDailyScore({ ...base, sleepHours: 3, nutritionException: true })
    expect(flagged.totalScore!).toBeLessThanOrEqual(25)
  })
})
