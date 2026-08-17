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
 *
 * On a DECLARED EXCEPTION DAY, protein is the only thing graded — see the
 * branch below and `lib/nutrition/exceptionDay.ts` for why.
 */
export function computeNutritionScore(inputs: Pick<ScoringInputs,
  'calories' | 'proteinG' | 'carbsG' | 'fatG' |
  'calorieGoal' | 'proteinGoalG' | 'carbsGoalG' | 'fatGoalG' | 'contextMode' |
  'nutritionException'>
): number | null {
  if (inputs.calories <= 0) return null   // nothing logged → unknown
  const pMult = penaltyMult(inputs.contextMode)

  function pctError(actual: number, goal: number, asymmetric = false): number {
    const err = (actual - goal) / goal
    if (asymmetric && err > 0) return err * 1.5 * 100  // over-eating on a cut: harsher
    return Math.abs(err) * 100
  }

  // ── Declared exception: grade protein, and only protein ────────────────────
  // Calories, carbs and fat are what a night out moves, and the day was flagged
  // precisely to say that moving them was the plan. Protein is not forgiven:
  // it is the intake that defends lean mass in a deficit, it is achievable at
  // any calorie level, and dropping it too would leave nothing to grade — a
  // silent 100 for every flagged day, which is an excuse rather than a score.
  //
  // Protein's double weight collapses to identity as the only term, so it is
  // counted once here rather than duplicated to no effect.
  //
  // Nothing else in the app is forgiven. Intake still reaches the weekly
  // average, the deficit and the weight trend at full value.
  if (inputs.nutritionException) {
    // No protein target (Bulk/Maintenance leave macros null) → nothing this day
    // can be graded on, so it is unknown rather than perfect. The composite
    // drops null components and renormalizes.
    if (!(inputs.proteinGoalG > 0)) return null
    return clamp(100 - pctError(inputs.proteinG, inputs.proteinGoalG) * pMult)
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
  'steps' | 'activeCal' | 'stepsGoal' | 'activeCalGoal' | 'contextMode'>
): number | null {
  // ── ILLNESS AND EMERGENCY SUSPEND THE TARGET ────────────────────────────────
  // Not "relax it" — suspend it. Relaxing a step goal you were told not to chase
  // still scores 2,000 steps against 12,000 and lands the day's third-heaviest
  // component near 20, so a week of following the instruction reads as a week of
  // failing. Null drops the component out of the weighted mean entirely and the
  // remaining components renormalise, which is the existing machinery for "this
  // was not measured" and is exactly the right shape for "this was not asked".
  //
  // Travel is deliberately NOT here: an airport is one of the few places you
  // outwalk your goal by accident.
  const ctx = inputs.contextMode
  if (ctx === 'illness' || ctx === 'emergency') return null
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

// ─── Sleep as a recovery MULTIPLIER, not one term among three ─────────────────
/**
 * Sleep is the only input that GATES recovery rather than contributing to it.
 * You cannot recover from a night you did not have, however good the autonomic
 * readings look — a short night with a high HRV is reserve being spent, not
 * recovery banked.
 *
 * THE BUG THIS REPLACES (live, 2026-08-04): 3h58 of sleep, HRV 63.4 against a
 * ~58 baseline and RHR 59 against a ~65 baseline. Both cardiac terms scored a
 * flat 100 and carried 55% of the weight between them, so the sleep term could
 * not drag the total below 55 no matter how bad the night was. The stored
 * `recovery_score` was **81** on four hours' sleep.
 *
 * A weighted mean cannot express "this one input vetoes the others", so the
 * weighted mean stays (it is the right shape for HR vs HRV) and sleep is lifted
 * out of it into a multiplier applied to the result.
 *
 * Anchors are on the DEFICIT below a full-credit threshold rather than on raw
 * hours, so a 6h sleeper isn't permanently penalised for hitting their own goal.
 * The threshold is `goal − 1h`, bounded to 5…7h: a tolerance band, not a
 * second goal, and never a demand for more than 7h.
 */
const SLEEP_DEFICIT_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 1.00],  // at/above threshold — full credit
  [1, 0.85],  // 6h on an 8h goal — a short night, not a broken one
  [2, 0.66],  // 5h — the point the user named as "must tank"
  [3, 0.48],  // 4h
  [4, 0.34],  // 3h
  [5, 0.22],  // 2h
  [7, 0.10],  // ≤1h — a floor, not a zero: the HR data is still worth something
]

export function sleepRecoveryMultiplier(
  sleepHours: number,
  sleepGoalHours: number | undefined,
  contextMode: ScoringInputs['contextMode'],
): number {
  // No sleep data is UNKNOWN, not zero. Penalising a missing night would make
  // every un-synced morning look like a crisis.
  if (sleepHours <= 0) return 1

  const threshold = Math.min(7, Math.max(5, (sleepGoalHours || 8) - 1))
  const deficit = threshold - sleepHours
  if (deficit <= 0) return 1

  // Piecewise-linear through the anchors; flat at the floor beyond the last one.
  let mult = SLEEP_DEFICIT_ANCHORS[SLEEP_DEFICIT_ANCHORS.length - 1][1]
  for (let i = 1; i < SLEEP_DEFICIT_ANCHORS.length; i += 1) {
    const [d0, m0] = SLEEP_DEFICIT_ANCHORS[i - 1]
    const [d1, m1] = SLEEP_DEFICIT_ANCHORS[i]
    if (deficit <= d1) {
      mult = m0 + ((deficit - d0) / (d1 - d0)) * (m1 - m0)
      break
    }
  }

  // Illness / travel / emergency relax the gate toward 1, exactly as the
  // composite sleep cap does — a rough night while sick is expected, not a
  // failure to recover.
  const relax = penaltyMult(contextMode)
  return mult + (1 - relax) * (1 - mult)
}

// ─── Recovery Score (physiological — NOT logging adherence) ────────────────────
/**
 * Recovery reflects the body, not whether you logged water/supps.
 *
 *   base = 45% sleep quality (duration + deep) + 30% resting-HR vs baseline +
 *          25% HRV vs 7-day baseline (the gold-standard autonomic signal)
 *   score = base × sleepRecoveryMultiplier(...)
 *
 * Each base component is dropped if its data is missing and the rest
 * renormalized. Returns null when there is NO physiological data at all
 * (unknown ≠ 0). The multiplier is what makes a short night unsurvivable:
 * four hours caps the result at 48 even with a perfect base.
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
  const base = parts.reduce((s, p) => s + p.v * p.w, 0) / wSum
  return clamp(base * sleepRecoveryMultiplier(inputs.sleepHours, inputs.sleepGoalHours, inputs.contextMode))
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
