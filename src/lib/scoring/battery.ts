import type { ScoringInputs } from './types'

export interface BatteryState {
  morningCharge: number   // 0–100 (charge at wake, sleep-driven)
  currentPct: number      // 0–100 (time-of-day aware)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Phone-like battery — drain-only (v7).
 *
 * ── WHY v6 WAS REPLACED ──────────────────────────────────────────────────────
 * v6 could not describe a training day. On 2026-08-10 (`legs_a`, 13,072.5 kg) it
 * read 16% at 16:58 and finished at the floor, on a day that scored 98 overall
 * with a 100 sleep score. That was not a mistuned constant, it was arithmetic:
 *
 *     max charge                                        = 100
 *     max time drain      2.2 × 18                      =  39.6
 *     max activity drain                                =  14
 *     leg-day workout     (5 + 0.0022 × 13072) × 1.5    =  50.6
 *                                                         ─────
 *                                                         104.2
 *
 * The drain budget exceeded the charge budget, so a leg day hit the floor before
 * bedtime NO MATTER HOW WELL YOU SLEPT. The one reading that should be most
 * informative — how much is left after real training — was the one reading with
 * no dynamic range at all.
 *
 * Four further faults, all fixed here:
 *
 *   1. SPLIT_DRAIN charged the same fact twice. Legs already carry ~4× the
 *      tonnage of an arms day (legs_a 12.8 t vs arms 3.4 t), so multiplying the
 *      tonnage term by another 1.5 for being legs double-counted. DELETED.
 *   2. `session_rpe` is collected on every session and was never read. Aug 10
 *      was logged RPE 7 — a moderate day — and drained like a maximal one.
 *   3. Absolute tonnage is the wrong load proxy. 13,072 kg sounds enormous and
 *      is in fact a 1.03× TYPICAL leg day against its own 12,712 kg trailing
 *      average. What costs you is a session that is hard FOR YOU, not one that
 *      moves a lot of iron because the machine is loaded heavy.
 *   4. Time drain was linear, so hour 1 cost what hour 15 cost.
 *
 * ── THE MODEL ────────────────────────────────────────────────────────────────
 *   - Wake high (≈90–100 after good sleep, never below 55).
 *   - Only ever depletes: chronological time + activity + the workout. There is
 *     still NO recharge term, so eating breakfast can never make the battery
 *     jump (the old protein/water bug stays fixed).
 *   - The workout term is RELATIVE and RPE-aware, so a normal session for you
 *     reads as normal whatever its absolute tonnage.
 *   - The drain budget is CAPPED BELOW THE CHARGE BUDGET. That invariant is
 *     asserted in the test suite, because it is the exact rule v6 broke.
 *
 * ── KNOWN LIMIT ──────────────────────────────────────────────────────────────
 * Helix is not open during the workout (D8) — Hevy tracks live and the session
 * is transcribed afterwards. So the workout drain appears the moment you paste,
 * not the moment you trained. That is inherent to post-hoc logging and is not
 * modelled around: the day's end state is right, the intraday path is not.
 */
export const BATTERY = {
  floor: 5,
  wakeMin: 55,         // worst-sleep wake charge
  wakeRange: 45,       // + up to 45 for perfect sleep → 100
  timeMax: 35,         // full chronological cost of an 18h day, cosine-distributed
  activityCap: 12,
  workoutMax: 30,      // the HEAVIEST day's ceiling — see WORKOUT_MAX_BY_DAY
  defaultRpe: 0.7,     // when session_rpe is absent (74 legacy sessions carry none)
  relMin: 0.6,         // a session at ≤60% of normal still costs something
  relMax: 1.4,         // beyond 140% of normal, more tonnage stops adding drain
  maxAwake: 18,
} as const

/**
 * Sum of every drain term at maximum. Held strictly below 100 so that a
 * well-slept day can never floor, and a floor reading therefore MEANS something.
 * v6's equivalent figure was 104.2 — see the note above.
 *
 * Uses `workoutMax`, the ceiling across every day type, so the invariant is
 * checked against the worst case a leg day can produce.
 */
export const MAX_TOTAL_DRAIN = BATTERY.timeMax + BATTERY.activityCap + BATTERY.workoutMax

/**
 * The workout drain ceiling, PER PROGRAMME DAY.
 *
 * ── WHY THIS IS NOT SPLIT_DRAIN COMING BACK ──────────────────────────────────
 * v6 multiplied the tonnage term by 1.5 for legs. That was a double-count: the
 * term it multiplied was ABSOLUTE tonnage, and legs already carry ~4× an arms
 * day, so the same fact was charged twice — which is how the drain budget
 * reached 104.2 against a 100-point charge and a leg day floored by bedtime.
 *
 * v7 removed the multiplier AND changed what it would have multiplied: drain is
 * now driven by `relative = volume / trailingAvg(day_key)`, normalised against
 * that day type's own history. A typical leg day and a typical arms day both
 * read 1.0. The absolute-tonnage advantage that made the multiplier a
 * double-count is simply gone.
 *
 * That is what makes a per-day CEILING safe where a per-day MULTIPLIER was not.
 * A hard leg day can cost more than a hard arms day — which is true, and the
 * relative term alone cannot express it — while the worst case stays a fixed
 * 30, so `MAX_TOTAL_DRAIN` is unchanged at 77 and the invariant that v6 broke
 * still holds by construction.
 *
 * Keyed on `day_key` (the programme day), NOT `split_day`. `splitDay` still
 * does not drain — see the guard in `program.test.ts`.
 */
export const WORKOUT_MAX_BY_DAY: Readonly<Record<string, number>> = {
  legs_a: 30, legs_b: 30,   // hardest
  cb_a: 24, cb_b: 24,       // upper A / upper B
  arms: 18,                 // delts & arms — the easiest day
}

/**
 * Default 24, the upper-day figure, for a session with no programme day: the
 * 74 legacy Notion-era sessions and any PPL-era row. Assuming the middle is
 * better than assuming either extreme.
 */
export const WORKOUT_MAX_DEFAULT = 24

/**
 * What a maintenance/deload day may spend of its day's workout ceiling.
 *
 * ── WHY THE CEILING AND NOT THE DRAIN ────────────────────────────────────────
 * The relative term in `workoutDrain` already handles the volume: a session at
 * 68% of its own trailing average drains roughly 68% as much, so a deload week
 * costs less battery WITHOUT anything here. That part needs no help and gets
 * none — `battery.test.ts` pins it.
 *
 * What the relative term cannot express is that the ceiling itself has moved. A
 * deload legs day compared only against other legs days can still come out at
 * `relative = 1.4` on the one day of the week you pushed, and be charged the
 * full 30 for it, because "typical" was recomputed from six deloaded sessions.
 * The week's whole point is that its hardest day is not a hard day.
 *
 * A factor strictly below 1 is also the only shape that is safe here:
 * `MAX_TOTAL_DRAIN` is 77 against a 100 charge budget, and v6 broke precisely by
 * letting the worst case reach 104.2. This can only ever lower the worst case,
 * never raise it — `battery.test.ts` asserts that too.
 */
export const MAINTENANCE_DRAIN_FACTOR = 0.75

export function workoutMaxFor(dayKey?: string | null, maintenance = false): number {
  const base = (dayKey ? WORKOUT_MAX_BY_DAY[dayKey] : undefined) ?? WORKOUT_MAX_DEFAULT
  return maintenance ? base * MAINTENANCE_DRAIN_FACTOR : base
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
 * Chronological drain, as a raised cosine over the waking day rather than a line.
 *
 * A linear 2.2/hour charged the first hour of the morning exactly what it
 * charged the fifteenth, which is not how a day feels. This costs little before
 * hour 6, most between 8 and 14, and flattens out late — you are already tired
 * by then and the last hour of a long evening does not halve you again.
 *
 * `awake = 0 → 0` · `awake = maxAwake → timeMax`. Monotonic throughout.
 */
export function timeDrain(hoursAwake: number): number {
  const awake = clamp(hoursAwake, 0, BATTERY.maxAwake)
  return BATTERY.timeMax * (1 - Math.cos(Math.PI * awake / BATTERY.maxAwake)) / 2
}

/**
 * Workout drain — RELATIVE to your own normal for this session type, scaled by
 * how hard you said it was.
 *
 * `trailingAvgVolumeKg` is already computed per exact `day_key` (compute-score
 * scopes it to the same programme day, 6 sessions back), so "relative" compares
 * a legs_a against other legs_a days and never against an arms day. With no
 * history to compare to, a session is assumed typical rather than assumed huge.
 *
 * `sessionRpe` is the CR-10 the session was logged with. Absent, it defaults to
 * 0.7 — a normal hard-ish session — rather than to 0, because a session you
 * forgot to rate still happened.
 */
export function workoutDrain(
  sessionVolumeKg: number,
  trailingAvgVolumeKg: number,
  sessionRpe?: number | null,
  dayKey?: string | null,
  maintenance = false,
): number {
  if (!(sessionVolumeKg > 0)) return 0
  const relative = trailingAvgVolumeKg > 0 ? sessionVolumeKg / trailingAvgVolumeKg : 1
  const intensity = sessionRpe != null && sessionRpe > 0 ? clamp(sessionRpe / 10, 0, 1) : BATTERY.defaultRpe
  return workoutMaxFor(dayKey, maintenance) * intensity * clamp(relative, BATTERY.relMin, BATTERY.relMax) / BATTERY.relMax
}

/**
 * Current battery % — strict drain-only.
 *   currentPct = clamp(wakeCharge − timeDrain − activityDrain − workoutDrain, floor, 100)
 *   timeDrain     = timeMax × (1 − cos(π · awake/maxAwake)) / 2
 *   activityDrain = min(cap, 0.004×activeCal + 0.5×(steps/1000))
 *   workoutDrain  = workoutMax × (rpe/10) × clamp(vol/trailingAvg, 0.6, 1.4) / 1.4
 */
export function computeBattery(inputs: ScoringInputs, hoursAwake?: number): BatteryState {
  const wakeCharge = computeMorningCharge(computeSleepQuality(inputs))

  const awake = clamp(hoursAwake ?? inputs.hoursAwake ?? 8, 0, BATTERY.maxAwake)
  const time = timeDrain(awake)
  const activity = Math.min(BATTERY.activityCap, 0.004 * inputs.activeCal + 0.5 * (inputs.steps / 1000))
  const workout = workoutDrain(
    inputs.sessionVolumeKg, inputs.trailingAvgVolumeKg, inputs.sessionRpe, inputs.sessionDayKey,
    inputs.isMaintenance,
  )

  const currentPct = clamp(wakeCharge - time - activity - workout, BATTERY.floor, 100)
  return { morningCharge: wakeCharge, currentPct: Math.round(currentPct) }
}
