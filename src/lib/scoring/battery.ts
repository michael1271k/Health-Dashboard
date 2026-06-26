import type { ScoringInputs } from './types'

export interface BatteryState {
  morningCharge: number   // 0–100
  currentPct: number      // 0–100 (time-of-day aware)
}

/**
 * Morning charge: 50 + 0.5 × sleepScore.
 * Great sleep (100) → 100% battery. Poor sleep (0) → 50%.
 * Clamped to [50, 100].
 */
export function computeMorningCharge(sleepScore: number): number {
  return Math.min(100, Math.max(50, 50 + 0.5 * sleepScore))
}

/**
 * Battery drain constants.
 */
export const DRAIN_CONSTANTS = {
  k1: 1.5,   // per hour awake
  k2: 0.5,   // per 1000 steps
  k3: 0.1,   // per kg of workout volume
}

/**
 * Recharge: hitting protein goal adds 3%, hitting water goal adds 2%.
 */
export function computeRecharge(inputs: Pick<ScoringInputs,
  'proteinG' | 'proteinGoalG' | 'waterMl' | 'waterGoalMl'>
): number {
  const proteinBonus = inputs.proteinG >= inputs.proteinGoalG ? 3 : 0
  const waterBonus   = inputs.waterMl >= inputs.waterGoalMl   ? 2 : 0
  return proteinBonus + waterBonus
}

/**
 * Current battery %.
 * batteryPct = clamp(morningCharge − drain + recharge, 0, 100)
 *
 * drain = k1 × hoursAwake + k2 × (steps/1000) + k3 × sessionVolumeKg
 */
export function computeBattery(
  inputs: ScoringInputs,
  hoursAwake: number,
): BatteryState {
  // Compute sleep score inline (avoids circular import) using same formula
  const sleepRatio = inputs.sleepGoalHours
    ? Math.min(1, inputs.sleepHours / inputs.sleepGoalHours)
    : 1
  const sleepScore = Math.min(100, sleepRatio * 100 +
    (inputs.deepMinutes >= 90 ? 5 : 0) +
    (inputs.remMinutes >= 90 ? 5 : 0))

  const morningCharge = computeMorningCharge(sleepScore)
  const drain =
    DRAIN_CONSTANTS.k1 * hoursAwake +
    DRAIN_CONSTANTS.k2 * (inputs.steps / 1000) +
    DRAIN_CONSTANTS.k3 * inputs.sessionVolumeKg

  const recharge = computeRecharge(inputs)
  const currentPct = Math.min(100, Math.max(0, morningCharge - drain + recharge))

  return {
    morningCharge: Math.round(morningCharge),
    currentPct: Math.round(currentPct),
  }
}
