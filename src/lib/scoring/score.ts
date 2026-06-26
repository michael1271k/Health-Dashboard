import type { ScoringInputs, ScoreComponents } from './types'

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * Sleep score (0–100)
 * Base: hours vs goal, clamped at 100%.
 * Bonus: +5 if deep ≥ 90min, +5 if REM ≥ 90min (capped at 100).
 */
export function computeSleepScore(inputs: Pick<ScoringInputs,
  'sleepHours' | 'deepMinutes' | 'remMinutes' | 'sleepGoalHours'>
): number {
  const base = clamp((inputs.sleepHours / inputs.sleepGoalHours) * 100)
  const deepBonus = inputs.deepMinutes >= 90 ? 5 : 0
  const remBonus = inputs.remMinutes >= 90 ? 5 : 0
  return clamp(base + deepBonus + remBonus)
}

/**
 * Nutrition score (0–100)
 * Mean absolute % error across 4 macros (calories, protein×2 weight, carbs, fat).
 * score = 100 − mean(|actual − target| / target × 100), clamped to [0,100].
 * Protein counts double (higher weight per plan algorithm).
 */
export function computeNutritionScore(inputs: Pick<ScoringInputs,
  'calories' | 'proteinG' | 'carbsG' | 'fatG' |
  'calorieGoal' | 'proteinGoalG' | 'carbsGoalG' | 'fatGoalG'>
): number {
  function pctError(actual: number, goal: number): number {
    if (goal === 0) return 0
    return Math.abs(actual - goal) / goal * 100
  }
  const errors = [
    pctError(inputs.calories, inputs.calorieGoal),
    pctError(inputs.proteinG, inputs.proteinGoalG),  // weight 1
    pctError(inputs.proteinG, inputs.proteinGoalG),  // weight 2 (protein counted twice)
    pctError(inputs.carbsG, inputs.carbsGoalG),
    pctError(inputs.fatG, inputs.fatGoalG),
  ]
  const meanError = errors.reduce((s, e) => s + e, 0) / errors.length
  return clamp(100 - meanError)
}

/**
 * Activity score (0–100)
 * 50% steps vs goal + 50% active cal vs goal.
 */
export function computeActivityScore(inputs: Pick<ScoringInputs,
  'steps' | 'activeCal' | 'stepsGoal' | 'activeCalGoal'>
): number {
  const stepsPct = clamp((inputs.steps / inputs.stepsGoal) * 100)
  const calPct = clamp((inputs.activeCal / inputs.activeCalGoal) * 100)
  return clamp(0.5 * stepsPct + 0.5 * calPct)
}

/**
 * Workout score (0–100)
 * 0 if no session logged.
 * Base 60 for logging any session.
 * +20 if volume ≥ trailing average (effort maintained).
 * +10 per new PR (capped at +20 total for PRs).
 */
export function computeWorkoutScore(inputs: Pick<ScoringInputs,
  'workoutLogged' | 'newPRsToday' | 'sessionVolumeKg' | 'trailingAvgVolumeKg'>
): number {
  if (!inputs.workoutLogged) return 0
  const base = 60
  const volumeBonus = inputs.trailingAvgVolumeKg > 0 &&
    inputs.sessionVolumeKg >= inputs.trailingAvgVolumeKg ? 20 : 0
  const prBonus = clamp(inputs.newPRsToday * 10, 0, 20)
  return clamp(base + volumeBonus + prBonus)
}

/**
 * Recovery score (0–100)
 * 60% water vs goal + 40% supplements taken vs goal.
 */
export function computeRecoveryScore(inputs: Pick<ScoringInputs,
  'waterMl' | 'waterGoalMl' | 'supplementsTaken' | 'supplementsGoal'>
): number {
  const waterPct = clamp((inputs.waterMl / inputs.waterGoalMl) * 100)
  const suppPct = inputs.supplementsGoal > 0
    ? clamp((inputs.supplementsTaken / inputs.supplementsGoal) * 100)
    : 100
  return clamp(0.6 * waterPct + 0.4 * suppPct)
}

/**
 * Weighted composite score.
 * Weights: sleep 25%, nutrition 30%, activity 20%, workout 15%, recovery 10%.
 */
export function computeDailyScore(inputs: ScoringInputs): ScoreComponents {
  const sleepScore     = computeSleepScore(inputs)
  const nutritionScore = computeNutritionScore(inputs)
  const activityScore  = computeActivityScore(inputs)
  const workoutScore   = computeWorkoutScore(inputs)
  const recoveryScore  = computeRecoveryScore(inputs)

  const totalScore = clamp(
    sleepScore     * 0.25 +
    nutritionScore * 0.30 +
    activityScore  * 0.20 +
    workoutScore   * 0.15 +
    recoveryScore  * 0.10
  )

  return {
    sleepScore:     Math.round(sleepScore),
    nutritionScore: Math.round(nutritionScore),
    activityScore:  Math.round(activityScore),
    workoutScore:   Math.round(workoutScore),
    recoveryScore:  Math.round(recoveryScore),
    totalScore:     Math.round(totalScore),
  }
}
