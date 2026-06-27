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
  const readinessScore =
    components.sleepScore  * 0.40 +
    batteryPct             * 0.40 +
    components.recoveryScore * 0.20

  if (readinessScore >= 70) {
    return {
      level: 'train_hard',
      label: 'Train Hard',
      color: '#19E3B1',
      reason: 'Sleep, battery, and recovery are all strong today.',
    }
  }
  if (readinessScore >= 45) {
    return {
      level: 'train_light',
      label: 'Train Light',
      color: '#FFB020',
      reason: 'Moderate readiness — a lighter session will serve you well.',
    }
  }
  return {
    level: 'rest',
    label: 'Rest Today',
    color: '#FF5470',
    reason: 'Recovery indicators are low — prioritize rest and nutrition.',
  }
}
