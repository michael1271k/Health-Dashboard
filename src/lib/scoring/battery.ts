import type { ScoringInputs } from './types'

export interface BatteryState {
  morningCharge: number   // 0–100 (charge at wake, sleep-driven)
  currentPct: number      // 0–100 (time-of-day aware)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Phone-like battery — a strict DRAIN-ONLY model (v6). Calibration intent:
 *   - Wake high (≈90–100% after good sleep, never below 55%).
 *   - Only ever depletes through the day: chronological time + activity + the
 *     workout. There is NO recharge term, so eating breakfast can never make the
 *     battery "jump" (the old protein/water recharge bug).
 *   - The workout drain is HARDNESS-aware: heavy sessions (legs, high volume)
 *     drain far more than easy ones (arms, low volume). Base drains are lighter
 *     than v5 so the workout is the differentiator instead of flooring every day.
 */
export const BATTERY = {
  floor: 5,
  wakeMin: 55,         // worst-sleep wake charge
  wakeRange: 45,       // + up to 45 for perfect sleep → 100
  drainPerHour: 2.2,   // chronological drain (1h→2.2, 16h→35.2) — lighter than v5
  activityCap: 14,
  // Workout drain = (flat + perKg·volume) · splitFactor. A heavy ~9,000kg leg day
  // → (5 + 19.8)·1.5 ≈ 37; a light ~3,500kg arm day → (5 + 7.7)·1.0 ≈ 13.
  workoutFlat: 5,
  workoutPerKg: 0.0022,
  maxAwake: 18,
} as const

/**
 * Split-hardness multiplier on the workout drain. Legs/lower are the most
 * systemically taxing; upper a touch more than a single push/pull. Unknown or
 * accessory splits fall back to 1.0 (the volume term still differentiates them).
 */
export const SPLIT_DRAIN: Record<NonNullable<ScoringInputs['splitDay']>, number> = {
  legs: 1.5, lower: 1.4, upper: 1.1, push: 1.0, pull: 1.0,
}

/** Wake charge from sleep quality (0..1): 55 + 45·q, rounded. */
export function computeMorningCharge(sleepQuality: number): number {
  return Math.round(BATTERY.wakeMin + BATTERY.wakeRange * clamp(sleepQuality, 0, 1))
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
 * Current battery % — strict drain-only.
 *   currentPct = clamp(wakeCharge − timeDrain − activityDrain − workoutDrain, floor, 100)
 *   timeDrain     = drainPerHour × hoursAwake
 *   activityDrain = min(cap, 0.004×activeCal + 0.5×(steps/1000))
 *   workoutDrain  = sessionVolumeKg>0 ? (flat + perKg×volume) × splitFactor : 0
 */
export function computeBattery(inputs: ScoringInputs, hoursAwake?: number): BatteryState {
  const wakeCharge = computeMorningCharge(computeSleepQuality(inputs))

  const awake = clamp(hoursAwake ?? inputs.hoursAwake ?? 8, 0, BATTERY.maxAwake)
  const timeDrain = BATTERY.drainPerHour * awake
  const activityDrain = Math.min(BATTERY.activityCap, 0.004 * inputs.activeCal + 0.5 * (inputs.steps / 1000))
  const splitFactor = inputs.splitDay ? SPLIT_DRAIN[inputs.splitDay] : 1.0
  const workoutDrain = inputs.sessionVolumeKg > 0
    ? (BATTERY.workoutFlat + BATTERY.workoutPerKg * inputs.sessionVolumeKg) * splitFactor
    : 0

  const currentPct = clamp(wakeCharge - timeDrain - activityDrain - workoutDrain, BATTERY.floor, 100)
  return { morningCharge: wakeCharge, currentPct: Math.round(currentPct) }
}
