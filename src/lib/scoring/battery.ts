import type { ScoringInputs } from './types'

export interface BatteryState {
  morningCharge: number   // 0–100 (charge at wake, sleep-driven)
  currentPct: number      // 0–100 (time-of-day aware)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Phone-like battery model. Calibration intent:
 *   - Wake high (≈90–100% after good sleep, never below 55%).
 *   - Drain steadily with hours awake (chronological), plus activity + workout.
 *   - Floored so it never reads ~0% at breakfast (the old 16h-flat-drain bug).
 */
export const BATTERY = {
  floor: 5,
  wakeMin: 55,         // worst-sleep wake charge
  wakeRange: 45,       // + up to 45 for perfect sleep → 100
  drainPerHour: 3.0,   // chronological drain (1h→3, 16h→48)
  activityCap: 15,
  // v5.1 calibration: a 75–80min lift ≈ 350–450 kcal ≈ ~10–13% drain
  // (flat 6 + 0.0015/kg → 4,000kg session = 12%). Zone-2 (Tue/Fri, 150–250 kcal)
  // flows through activityDrain via active_energy.
  workoutFlat: 6,
  workoutPerKg: 0.0015,
  maxAwake: 18,
} as const

/** Wake charge from sleep quality (0..1): 55 + 45·q, rounded. */
export function computeMorningCharge(sleepQuality: number): number {
  return Math.round(BATTERY.wakeMin + BATTERY.wakeRange * clamp(sleepQuality, 0, 1))
}

/** Recharge: hitting protein goal adds 6%, hitting water goal adds 4%. */
export function computeRecharge(inputs: Pick<ScoringInputs,
  'proteinG' | 'proteinGoalG' | 'waterMl' | 'waterGoalMl'>
): number {
  const proteinBonus = inputs.proteinG >= inputs.proteinGoalG ? 6 : 0
  const waterBonus = inputs.waterMl >= inputs.waterGoalMl ? 4 : 0
  return proteinBonus + waterBonus
}

/**
 * Sleep quality 0..1 — 70% sleep duration vs goal, 15% deep-sleep, 15% resting-HR
 * vs baseline (an elevated RHR drags quality down). Drives the wake charge.
 */
export function computeSleepQuality(inputs: ScoringInputs): number {
  const ratio = inputs.sleepGoalHours ? Math.min(1, inputs.sleepHours / inputs.sleepGoalHours) : 1
  const deepQ = inputs.deepMinutes >= 75 ? 1 : Math.max(0, inputs.deepMinutes / 75)
  let rhrQ = 1
  if (inputs.restingHR && inputs.baselineHR) {
    // +20 bpm over baseline → 0; at/below baseline → 1
    rhrQ = clamp(1 - (inputs.restingHR - inputs.baselineHR) / 20, 0, 1)
  }
  return clamp(0.7 * ratio + 0.15 * deepQ + 0.15 * rhrQ, 0, 1)
}

/**
 * Current battery %.
 *   currentPct = clamp(wakeCharge − timeDrain − activityDrain − workoutDrain + recharge, floor, 100)
 *   timeDrain     = drainPerHour × hoursAwake
 *   activityDrain = min(cap, 0.004×activeCal + 0.5×(steps/1000))
 *   workoutDrain  = sessionVolumeKg>0 ? flat + perKg×volume : 0
 */
export function computeBattery(inputs: ScoringInputs, hoursAwake?: number): BatteryState {
  const wakeCharge = computeMorningCharge(computeSleepQuality(inputs))

  const awake = clamp(hoursAwake ?? inputs.hoursAwake ?? 8, 0, BATTERY.maxAwake)
  const timeDrain = BATTERY.drainPerHour * awake
  const activityDrain = Math.min(BATTERY.activityCap, 0.004 * inputs.activeCal + 0.5 * (inputs.steps / 1000))
  const workoutDrain = inputs.sessionVolumeKg > 0
    ? BATTERY.workoutFlat + BATTERY.workoutPerKg * inputs.sessionVolumeKg
    : 0
  const recharge = computeRecharge(inputs)

  const currentPct = clamp(wakeCharge - timeDrain - activityDrain - workoutDrain + recharge, BATTERY.floor, 100)
  return { morningCharge: wakeCharge, currentPct: Math.round(currentPct) }
}
