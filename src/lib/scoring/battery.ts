import type { ScoringInputs } from './types'

export interface BatteryState {
  morningCharge: number   // 0–100
  currentPct: number      // 0–100 (time-of-day aware)
}

/**
 * Morning charge: 40 + 0.6 × sleepScore.
 * Perfect sleep (100) → 100%. Zero sleep → 40% (clamped).
 * Calibrated so a full training day lands at ~35%.
 */
export function computeMorningCharge(sleepScore: number): number {
  return Math.min(100, Math.max(40, 40 + 0.6 * sleepScore))
}

/**
 * Battery drain constants.
 * Calibration (perfect training day):
 *   charge=100, awake=16h, steps=10k, volume=4000kg
 *   drain = 2.0×16 + 0.6×10 + 0.008×4000 + 5 = 32+6+32+5 = 75
 *   recharge = 6+4 = 10  →  100 − 75 + 10 = 35% ✔
 *
 * Rest day check:
 *   charge=100, awake=14h, steps=5k, volume=0
 *   drain = 2.0×14 + 0.6×5 + 0 + 5 = 28+3+0+5 = 36
 *   recharge = 10  →  100 − 36 + 10 = 74% ✔
 */
export const DRAIN_CONSTANTS = {
  k1: 2.0,     // per hour awake
  k2: 0.6,     // per 1000 steps
  k3: 0.008,   // per kg of workout volume
  baseline: 5, // fixed baseline drain
}

/**
 * Recharge: hitting protein goal adds 6%, hitting water goal adds 4%.
 */
export function computeRecharge(inputs: Pick<ScoringInputs,
  'proteinG' | 'proteinGoalG' | 'waterMl' | 'waterGoalMl'>
): number {
  const proteinBonus = inputs.proteinG >= inputs.proteinGoalG ? 6 : 0
  const waterBonus   = inputs.waterMl  >= inputs.waterGoalMl  ? 4 : 0
  return proteinBonus + waterBonus
}

/**
 * Current battery %.
 * batteryPct = clamp(morningCharge − drain + recharge, 0, 100)
 * drain = k1 × hoursAwake + k2 × (steps/1000) + k3 × sessionVolumeKg + baseline
 */
export function computeBattery(
  inputs: ScoringInputs,
  hoursAwake?: number,
): BatteryState {
  // Compute sleep score inline (avoids circular import) using same formula
  const sleepRatio = inputs.sleepGoalHours
    ? Math.min(1, inputs.sleepHours / inputs.sleepGoalHours)
    : 1
  const sleepScore = Math.min(100, sleepRatio * 100 +
    (inputs.deepMinutes >= 90 ? 5 : 0) +
    (inputs.remMinutes  >= 90 ? 5 : 0))

  const morningCharge = computeMorningCharge(sleepScore)

  const awake = hoursAwake ?? inputs.hoursAwake ?? 16
  const drain =
    DRAIN_CONSTANTS.k1 * awake +
    DRAIN_CONSTANTS.k2 * (inputs.steps / 1000) +
    DRAIN_CONSTANTS.k3 * inputs.sessionVolumeKg +
    DRAIN_CONSTANTS.baseline

  const recharge = computeRecharge(inputs)
  const currentPct = Math.min(100, Math.max(0, morningCharge - drain + recharge))

  return {
    morningCharge: Math.round(morningCharge),
    currentPct:    Math.round(currentPct),
  }
}
