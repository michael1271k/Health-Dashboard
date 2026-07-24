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
 * Grades the SESSION YOU WERE ASKED TO DO, not your luck with records.
 *
 * The old model was `60 base + 20 if volume ≥ trailing avg + 10 per PR (max 20)`.
 * On a calorie deficit running double progression, PRs are rare by design — the
 * program's own rule adds load only after clearing the rep ceiling twice — so
 * the top 20 points were effectively unreachable and a flawless session was
 * permanently capped at 80. (Live data: 2026-07-24, Legs & Core B, 8 945 kg
 * across 19 sets, every prescribed lift logged → workout_score 80.)
 *
 * The replacement is a weighted mean of what a session can actually control:
 *
 *   completion 55  · you trained the day the program scheduled
 *   coverage   15  · share of the prescribed exercises actually logged
 *   volume     18  · vs the trailing average FOR THIS SESSION TYPE
 *   effort     12  · sets taken to failure + share of prescribed sets completed
 *   + PRs      ≤10 · a bonus on top, capped at 100 — never a gate
 *
 * Components with no data are DROPPED and the rest renormalized (the same rule
 * the composite uses), so an unknown plan or a first-of-its-type session is
 * never silently penalized for something it couldn't have supplied.
 */
export function computeWorkoutScore(inputs: Pick<ScoringInputs,
  'workoutLogged' | 'isRestDay' | 'newPRsToday' | 'sessionVolumeKg' | 'trailingAvgVolumeKg' |
  'contextMode' | 'isCurrentDay' | 'localHour' |
  'plannedExercises' | 'loggedExercises' | 'plannedSets' | 'sessionSets' | 'failureSets'>
): number | null {
  if (inputs.contextMode === 'travel') return null   // vacation — no training expectation
  if (inputs.isRestDay) return null                  // scheduled rest → neutral
  if (!inputs.workoutLogged) {
    const pending = inputs.isCurrentDay && (inputs.localHour ?? 24) < 21
    return pending ? null : 0                         // pending vs genuinely missed
  }

  const parts: Array<{ v: number; w: number }> = [
    { v: 100, w: 55 },   // completion — showing up and logging is most of the score
  ]

  // Coverage: did the session contain the work that was prescribed?
  if ((inputs.plannedExercises ?? 0) > 0 && inputs.loggedExercises != null) {
    const ratio = inputs.loggedExercises / (inputs.plannedExercises as number)
    parts.push({ v: clamp(Math.min(1, ratio) * 100), w: 15 })
  }

  // Volume vs this session type's own baseline. Graded on a band, not a cliff:
  // matching the average is full marks, and shortfalls scale down smoothly.
  if (inputs.trailingAvgVolumeKg > 0) {
    const ratio = inputs.sessionVolumeKg / inputs.trailingAvgVolumeKg
    const v = ratio >= 1 ? 100
      : ratio >= 0.9 ? 70 + (ratio - 0.9) * 300      // 0.90 → 70 … 1.00 → 100
      : ratio >= 0.75 ? 35 + (ratio - 0.75) * (35 / 0.15)  // 0.75 → 35 … 0.90 → 70
      : clamp((ratio / 0.75) * 35)                    // 0 → 0 … 0.75 → 35
    parts.push({ v: clamp(v), w: 18 })
  }

  // Effort: half from taking sets to failure, half from completing the
  // prescribed set count. Either half alone still earns real credit.
  const effort: number[] = []
  if (inputs.failureSets != null) effort.push(clamp(Math.min(1, inputs.failureSets / 2) * 100))
  if ((inputs.plannedSets ?? 0) > 0 && inputs.sessionSets != null) {
    effort.push(clamp(Math.min(1, inputs.sessionSets / (inputs.plannedSets as number)) * 100))
  }
  if (effort.length) {
    parts.push({ v: effort.reduce((s, x) => s + x, 0) / effort.length, w: 12 })
  }

  const wSum = parts.reduce((s, p) => s + p.w, 0)
  const earned = parts.reduce((s, p) => s + p.v * (p.w / wSum), 0)
  // PRs sit ON TOP of a complete session rather than being the only route to it.
  const prBonus = clamp(inputs.newPRsToday * 5, 0, 10)
  return clamp(earned + prBonus)
}

// ─── Hydration Score ──────────────────────────────────────────────────────────
/**
 * Water intake vs goal, capped at 100. Returns null (excluded from the composite)
 * when there is no water goal or nothing logged yet, so an unlogged morning is
 * never penalized — hydration only counts once the user starts drinking.
 */
export function computeHydrationScore(inputs: Pick<ScoringInputs,
  'waterMl' | 'waterGoalMl'>
): number | null {
  if (!inputs.waterGoalMl || inputs.waterGoalMl <= 0) return null
  if (inputs.waterMl <= 0) return null   // nothing logged → unknown
  return clamp((inputs.waterMl / inputs.waterGoalMl) * 100)
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
    hydration: computeHydrationScore(inputs),
  }
  const baseW: Record<string, number> = {
    sleep: 0.25, nutrition: 0.30, activity: 0.20, workout: 0.15, recovery: 0.10, hydration: 0.08,
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
  // Live current day with no sleep synced yet → the UI shows "Awaiting Sleep
  // Data" rather than a composite built only from nutrition/activity.
  const awaitingSleep = !!inputs.isCurrentDay && inputs.sleepHours <= 0
  return {
    sleepScore:     r(comps.sleep),
    nutritionScore: r(comps.nutrition),
    activityScore:  r(comps.activity),
    workoutScore:   r(comps.workout),
    recoveryScore:  r(comps.recovery),
    hydrationScore: r(comps.hydration),
    totalScore:     totalScore == null ? null : Math.round(totalScore),
    awaitingSleep,
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
