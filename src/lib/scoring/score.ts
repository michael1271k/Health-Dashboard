import type { ScoringInputs, ScoreComponents, ScoringAlert } from './types'

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v))
}

// ─── Context penalty multiplier ───────────────────────────────────────────────
// In emergency contexts penalties are strongly relaxed; illness/travel moderate.
function penaltyMult(ctx: ScoringInputs['contextMode']): number {
  switch (ctx) {
    case 'emergency': return 0.35
    case 'illness':   return 0.55
    case 'travel':    return 0.70
    default:          return 1.0
  }
}

// ─── Sleep Score ──────────────────────────────────────────────────────────────
/**
 * Full credit within ±0.5h of goal.
 * Soft quadratic penalty outside the tolerance band.
 * Bonus: +5 deep ≥90min, +5 REM ≥90min (capped at 100).
 */
export function computeSleepScore(inputs: Pick<ScoringInputs,
  'sleepHours' | 'deepMinutes' | 'remMinutes' | 'sleepGoalHours' | 'contextMode'>
): number {
  if (!inputs.sleepGoalHours) return 100
  const pMult = penaltyMult(inputs.contextMode)
  const goal = inputs.sleepGoalHours
  const actual = inputs.sleepHours
  const diff = actual - goal
  const tol = 0.5                          // ±0.5h tolerance band

  let base: number
  if (diff >= -tol) {
    base = 100                             // at or above goal (within tolerance)
  } else {
    const deficit = -diff - tol            // hours below tolerance
    // Quadratic penalty: -10 per hour under (scaled by context)
    base = clamp(100 - (deficit * deficit * 18 + deficit * 8) * pMult)
  }

  const deepBonus = inputs.deepMinutes >= 90 ? 5 : 0
  const remBonus  = inputs.remMinutes  >= 90 ? 5 : 0
  return clamp(base + deepBonus + remBonus)
}

// ─── Nutrition Score (cut-aware) ──────────────────────────────────────────────
/**
 * Protein adherence weighted double.
 * Calories: over-eating penalized harder than under-eating on a cut.
 * Carbs + fat: single weight.
 */
export function computeNutritionScore(inputs: Pick<ScoringInputs,
  'calories' | 'proteinG' | 'carbsG' | 'fatG' |
  'calorieGoal' | 'proteinGoalG' | 'carbsGoalG' | 'fatGoalG' | 'contextMode'>
): number {
  const pMult = penaltyMult(inputs.contextMode)

  function pctError(actual: number, goal: number, asymmetric = false): number {
    const err = (actual - goal) / goal
    if (asymmetric && err > 0) return err * 1.5 * 100  // over-eating on a cut: harsher
    return Math.abs(err) * 100
  }

  // Only grade macros that have a target (>0). Bulk/Maintenance leave macros
  // null → graded on calories only. Calories are always graded.
  const errors: number[] = [pctError(inputs.calories, inputs.calorieGoal, true)]
  if (inputs.proteinGoalG > 0) {
    errors.push(pctError(inputs.proteinG, inputs.proteinGoalG))  // weight 1
    errors.push(pctError(inputs.proteinG, inputs.proteinGoalG))  // weight 2 (protein double)
  }
  if (inputs.carbsGoalG > 0) errors.push(pctError(inputs.carbsG, inputs.carbsGoalG))
  if (inputs.fatGoalG > 0)   errors.push(pctError(inputs.fatG, inputs.fatGoalG))

  const meanError = errors.reduce((s, e) => s + e, 0) / errors.length
  return clamp(100 - meanError * pMult)
}

// ─── Activity Score ───────────────────────────────────────────────────────────
/**
 * 50% steps vs goal + 50% active cal vs goal.
 * Diminishing returns above goal (each 10% over = +2%).
 */
export function computeActivityScore(inputs: Pick<ScoringInputs,
  'steps' | 'activeCal' | 'stepsGoal' | 'activeCalGoal'>
): number {
  function score(actual: number, goal: number): number {
    if (goal === 0) return 100
    const ratio = actual / goal
    if (ratio >= 1) return Math.min(100, 100 + (ratio - 1) * 20)
    return clamp(ratio * 100)
  }
  return clamp(0.5 * score(inputs.steps, inputs.stepsGoal) +
               0.5 * score(inputs.activeCal, inputs.activeCalGoal))
}

// ─── Workout Score ────────────────────────────────────────────────────────────
/**
 * Rest day → neutral 100 (not penalized — rest is part of the plan).
 * Training day, no session → 0.
 * Session logged: base 60 + volume bonus 20 + PR bonus up to 20.
 */
export function computeWorkoutScore(inputs: Pick<ScoringInputs,
  'workoutLogged' | 'isRestDay' | 'newPRsToday' | 'sessionVolumeKg' | 'trailingAvgVolumeKg'>
): number {
  if (inputs.isRestDay) return 100               // rest days always score perfect
  if (!inputs.workoutLogged) return 0
  const base = 60
  const volumeBonus = inputs.trailingAvgVolumeKg > 0 &&
    inputs.sessionVolumeKg >= inputs.trailingAvgVolumeKg ? 20 : 0
  const prBonus = clamp(inputs.newPRsToday * 10, 0, 20)
  return clamp(base + volumeBonus + prBonus)
}

// ─── Recovery Score ───────────────────────────────────────────────────────────
/**
 * 60% water vs goal + 30% supplements + 10% HR signal (if available).
 * HR: elevated resting HR > baseline + 5 bpm → penalty.
 */
export function computeRecoveryScore(inputs: Pick<ScoringInputs,
  'waterMl' | 'waterGoalMl' | 'supplementsTaken' | 'supplementsGoal' |
  'restingHR' | 'baselineHR' | 'contextMode'>
): number {
  const pMult = penaltyMult(inputs.contextMode)
  const waterPct = clamp((inputs.waterMl / (inputs.waterGoalMl || 1)) * 100)
  const suppPct = inputs.supplementsGoal > 0
    ? clamp((inputs.supplementsTaken / inputs.supplementsGoal) * 100)
    : 100

  let hrScore = 100
  if (inputs.restingHR != null && inputs.baselineHR != null && inputs.baselineHR > 0) {
    const delta = inputs.restingHR - inputs.baselineHR
    if (delta > 0) hrScore = clamp(100 - delta * 4 * pMult)
  }

  if (inputs.restingHR != null && inputs.baselineHR != null) {
    return clamp(waterPct * 0.60 + suppPct * 0.30 + hrScore * 0.10)
  }
  // No HR data — fall back to water/supplements ratio
  return clamp(waterPct * 0.60 + suppPct * 0.40)
}

// ─── Composite Score (smart, context-aware, adaptive re-weighting) ────────────
/**
 * Adaptive weights based on day type and data availability.
 * - Rest day: workout weight redistributed to sleep + recovery.
 * - Missing data: that component dropped and weights renormalized.
 * - Emergency: penalty multipliers on all sub-scores already applied.
 */
export function computeDailyScore(inputs: ScoringInputs): ScoreComponents {
  const sleepScore     = computeSleepScore(inputs)
  const nutritionScore = computeNutritionScore(inputs)
  const activityScore  = computeActivityScore(inputs)
  const workoutScore   = computeWorkoutScore(inputs)
  const recoveryScore  = computeRecoveryScore(inputs)

  // Base weights
  let w = {
    sleep:     0.25,
    nutrition: 0.30,
    activity:  0.20,
    workout:   0.15,
    recovery:  0.10,
  }

  // Adapt for rest day: redistribute workout weight to sleep + recovery
  if (inputs.isRestDay) {
    w = { sleep: 0.30, nutrition: 0.30, activity: 0.20, workout: 0, recovery: 0.20 }
  }

  // Drop components without data and renormalize
  const hasActivity = inputs.steps > 0 || inputs.activeCal > 0
  if (!hasActivity) {
    const freed = w.activity
    w.activity = 0
    const nonZeroKeys = Object.keys(w).filter((k) => w[k as keyof typeof w] > 0) as Array<keyof typeof w>
    const total = nonZeroKeys.reduce((s, k) => s + w[k], 0)
    for (const k of nonZeroKeys) w[k] = w[k] / total * (total + freed) // redistribute
  }

  const totalScore = clamp(
    sleepScore     * w.sleep +
    nutritionScore * w.nutrition +
    activityScore  * w.activity +
    workoutScore   * w.workout +
    recoveryScore  * w.recovery
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

// ─── Alert Engine ─────────────────────────────────────────────────────────────
/**
 * Returns an ordered array of actionable alerts.
 * Caller should display the top 2–3 on the dashboard.
 */
export function computeAlerts(inputs: ScoringInputs, battery: number): ScoringAlert[] {
  const alerts: ScoringAlert[] = []
  const ctx = inputs.contextMode ?? 'normal'

  // Emergency context: suppress training alerts
  if (ctx !== 'emergency') {
    // Low sleep on a training day
    if (!inputs.isRestDay && inputs.sleepHours < 6) {
      alerts.push({
        severity: 'danger',
        message: 'Recovery indicators are too low — do not train today.',
      })
    }

    // Elevated resting HR
    if (
      inputs.restingHR != null &&
      inputs.baselineHR != null &&
      inputs.restingHR > inputs.baselineHR + 7
    ) {
      alerts.push({
        severity: 'warn',
        message: 'Elevated resting HR — likely under-recovered. Consider a lighter session.',
      })
    }
  }

  // Battery critically low
  if (battery < 20) {
    alerts.push({ severity: 'danger', message: 'Energy reserves low — prioritize recovery and nutrition.' })
  }

  // Protein behind (useful any time of day, scaled by progress)
  const hour = new Date().getHours()
  if (hour >= 18 && inputs.proteinG < inputs.proteinGoalG * 0.70) {
    const remaining = Math.round(inputs.proteinGoalG - inputs.proteinG)
    alerts.push({
      severity: 'warn',
      message: `Protein is behind — eat ~${remaining}g more before bed.`,
    })
  }

  // Low sleep (general — not training-specific)
  if (inputs.sleepHours > 0 && inputs.sleepHours < 5.5 && ctx !== 'emergency') {
    alerts.push({
      severity: 'warn',
      message: `Only ${inputs.sleepHours.toFixed(1)}h sleep logged — aim for an earlier night tonight.`,
    })
  }

  return alerts
}
