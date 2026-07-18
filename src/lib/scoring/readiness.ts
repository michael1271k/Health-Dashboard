import type { ScoreComponents, ReadinessResult } from './types'

/**
 * Readiness Coach:
 * Uses sleep score + battery + recovery score.
 * Weighted: sleep 40%, battery 40%, recovery 20%.
 * ≥70 → Train Hard, ≥45 → Train Light, <45 → Rest Today.
 */
export function computeReadiness(
  components: Pick<ScoreComponents, 'sleepScore' | 'recoveryScore'>,
  batteryPct: number,
): ReadinessResult {
  // Sleep/recovery may be null (no data) — fall back to battery so readiness
  // stays sensible rather than cratering to a false "Rest Today".
  const sleep = components.sleepScore ?? batteryPct
  const recovery = components.recoveryScore ?? batteryPct
  const readinessScore = sleep * 0.40 + batteryPct * 0.40 + recovery * 0.20

  if (readinessScore >= 70) {
    return {
      level: 'train_hard',
      label: 'Train Hard',
      color: '#34D399',
      reason: 'Sleep, battery, and recovery are all strong today.',
    }
  }
  if (readinessScore >= 45) {
    return {
      level: 'train_light',
      label: 'Train Light',
      color: '#FBBF24',
      reason: 'Moderate readiness — a lighter session will serve you well.',
    }
  }
  return {
    level: 'rest',
    label: 'Rest Today',
    color: '#FB7185',
    reason: 'Recovery indicators are low — prioritize rest and nutrition.',
  }
}
