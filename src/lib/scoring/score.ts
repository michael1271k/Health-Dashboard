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
): number | null {
  if (inputs.sleepHours <= 0) return null   // no sleep data → unknown, not a fake score
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
): number | null {
  if (inputs.calories <= 0) return null   // nothing logged → unknown
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
): number | null {
  if (inputs.steps <= 0 && inputs.activeCal <= 0) return null   // no activity data
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
 * Scientific & honest — never a fake full ring on a day off:
 *   Travel/vacation → null (no training expectation).
 *   Scheduled rest day → null (neutral, excluded from the composite).
 *   Training day, no session yet & early in the day → null ("Pending").
 *   Training day, no session & late/past → 0 (genuinely missed).
 *   Session logged → 60 base + up to 20 volume + up to 20 PR.
 */
export function computeWorkoutScore(inputs: Pick<ScoringInputs,
  'workoutLogged' | 'isRestDay' | 'newPRsToday' | 'sessionVolumeKg' | 'trailingAvgVolumeKg' |
  'contextMode' | 'isCurrentDay' | 'localHour'>
): number | null {
  if (inputs.contextMode === 'travel') return null   // vacation — no training expectation
  if (inputs.isRestDay) return null                  // scheduled rest → neutral
  if (!inputs.workoutLogged) {
    const pending = inputs.isCurrentDay && (inputs.localHour ?? 24) < 21
    return pending ? null : 0                         // pending vs genuinely missed
  }
  const base = 60
  const volumeBonus = inputs.trailingAvgVolumeKg > 0 &&
    inputs.sessionVolumeKg >= inputs.trailingAvgVolumeKg ? 20 : 0
  const prBonus = clamp(inputs.newPRsToday * 10, 0, 20)
  return clamp(base + volumeBonus + prBonus)
}

// ─── Recovery Score (physiological — NOT logging adherence) ────────────────────
/**
 * Recovery reflects the body, not whether you logged water/supps:
 *   45% sleep quality (duration + deep) + 30% resting-HR vs baseline +
 *   25% HRV vs 7-day baseline (the gold-standard recovery signal).
 * Each component is dropped if its data is missing and the rest renormalized.
 * Returns null when there is NO physiological data at all (unknown ≠ 0).
 */
export function computeRecoveryScore(inputs: Pick<ScoringInputs,
  'sleepHours' | 'deepMinutes' | 'sleepGoalHours' | 'restingHR' | 'baselineHR' | 'hrvMs' | 'hrvBaseline' | 'contextMode'>
): number | null {
  const pMult = penaltyMult(inputs.contextMode)
  const parts: Array<{ v: number; w: number }> = []

  if (inputs.sleepHours > 0) {
    const ratio = inputs.sleepGoalHours ? Math.min(1, inputs.sleepHours / inputs.sleepGoalHours) : 1
    const deepQ = inputs.deepMinutes >= 75 ? 1 : Math.max(0, inputs.deepMinutes / 75)
    parts.push({ v: clamp((0.8 * ratio + 0.2 * deepQ) * 100), w: 0.45 })
  }
  if (inputs.restingHR != null && inputs.baselineHR != null && inputs.baselineHR > 0) {
    const delta = inputs.restingHR - inputs.baselineHR
    parts.push({ v: clamp(100 - Math.max(0, delta) * 4 * pMult), w: 0.30 })
  }
  if (inputs.hrvMs != null && inputs.hrvBaseline != null && inputs.hrvBaseline > 0) {
    // HRV at/above baseline = fully recovered; each 10% below costs ~15 pts.
    const ratio = inputs.hrvMs / inputs.hrvBaseline
    parts.push({ v: clamp(100 - Math.max(0, 1 - ratio) * 150 * pMult), w: 0.25 })
  }

  if (!parts.length) return null   // no physiological signal → unknown
  const wSum = parts.reduce((s, p) => s + p.w, 0)
  return clamp(parts.reduce((s, p) => s + p.v * p.w, 0) / wSum)
}

// ─── Composite Score (smart, context-aware, adaptive re-weighting) ────────────
/**
 * Adaptive weights based on day type and data availability.
 * - Rest day: workout weight redistributed to sleep + recovery.
 * - Missing data: that component dropped and weights renormalized.
 * - Emergency: penalty multipliers on all sub-scores already applied.
 */
export function computeDailyScore(inputs: ScoringInputs): ScoreComponents {
  const comps: Record<string, number | null> = {
    sleep:     computeSleepScore(inputs),
    nutrition: computeNutritionScore(inputs),
    activity:  computeActivityScore(inputs),
    workout:   computeWorkoutScore(inputs),
    recovery:  computeRecoveryScore(inputs),
  }
  const baseW: Record<string, number> = {
    sleep: 0.25, nutrition: 0.30, activity: 0.20, workout: 0.15, recovery: 0.10,
  }

  // Composite = weighted mean over ONLY the components that have data (renormalized).
  const active = Object.keys(comps).filter((k) => comps[k] != null)
  const wSum = active.reduce((s, k) => s + baseW[k], 0)
  let totalScore = active.length
    ? clamp(active.reduce((s, k) => s + (comps[k] as number) * (baseW[k] / wSum), 0))
    : null

  // ─── SLEEP GATE ───────────────────────────────────────────────────────────
  // Sleep is foundational to recovery: a short night HARD-CAPS the whole day
  // regardless of how good the workout or macros were. A 3h night can never be
  // an 80. Only applies when sleep data exists (>0). Context multiplier softens
  // the cap for illness/travel/emergency (a rough night while sick is expected).
  if (totalScore != null && inputs.sleepHours > 0 && inputs.sleepHours < 6) {
    const s = inputs.sleepHours
    const rawCap = s >= 5 ? 45 + (s - 5) * 25      // 5h → 45 … 6h → 70 (cap lifts)
      : s >= 3 ? 25 + (s - 3) * 10                  // 3h → 25 … 5h → 45
      : (s / 3) * 25                                 // 0h → 0 … 3h → 25 (severe)
    // Relax the cap in non-normal contexts (emergency loosens most).
    const relax = penaltyMult(inputs.contextMode)               // 1.0 normal … 0.35 emergency
    const cap = clamp(rawCap + (1 - relax) * (100 - rawCap))    // normal: rawCap; emergency: near-100
    totalScore = Math.min(totalScore, cap)
  }

  const r = (v: number | null) => (v == null ? null : Math.round(v))
  return {
    sleepScore:     r(comps.sleep),
    nutritionScore: r(comps.nutrition),
    activityScore:  r(comps.activity),
    workoutScore:   r(comps.workout),
    recoveryScore:  r(comps.recovery),
    totalScore:     totalScore == null ? null : Math.round(totalScore),
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
