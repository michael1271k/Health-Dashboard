import type { ScoringInputs } from './types'

export interface BatteryState {
  morningCharge: number   // 0–100 (charge at wake, sleep-driven)
  currentPct: number      // 0–100 (time-of-day aware)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Phone-like battery — drain-only (v7), with v8's morning-charge and stress
 * terms on top. v8 changed WHAT the charge reads (stages share, HRV, onset) and
 * added ONE drain (stress, capped at 10) — the shape below is unchanged.
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
  workoutMax: 32,      // the HEAVIEST day's ceiling — see WORKOUT_MAX_BY_DAY
  stressCap: 10,       // v8 — RHR elevation + HRV suppression + the latest fatigue reading
  onsetPenalty: 3,     // v8 — a night you struggled to fall into starts the day 3 lower
  restorativeShare: 0.45, // v8 — (deep + REM) / asleep at which the stages term saturates
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
 *
 * v8: 35 + 12 + 32 + 10 = 89. The stress term arrived with its own cap and the
 * leg-day ceiling rose by two, and the sum is still under a full charge — even
 * a night with onset trouble (97 at best) leaves 8 points above the floor.
 */
export const MAX_TOTAL_DRAIN = BATTERY.timeMax + BATTERY.activityCap + BATTERY.workoutMax + BATTERY.stressCap

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
 * constant (32 since v8), so `MAX_TOTAL_DRAIN` is a sum of constants and the
 * invariant that v6 broke still holds by construction.
 *
 * Keyed on `day_key` (the programme day), NOT `split_day`. `splitDay` still
 * does not drain — see the guard in `program.test.ts`.
 */
export const WORKOUT_MAX_BY_DAY: Readonly<Record<string, number>> = {
  legs_a: 32, legs_b: 32,   // hardest — a third more than upper (v8)
  cb_a: 24, cb_b: 24,       // upper A / upper B
  arms: 16,                 // delts & arms — the easiest day
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
 * `MAX_TOTAL_DRAIN` is 89 against a 100 charge budget, and v6 broke precisely by
 * letting the worst case reach 104.2. This can only ever lower the worst case,
 * never raise it — `battery.test.ts` asserts that too.
 */
export const MAINTENANCE_DRAIN_FACTOR = 0.75

export function workoutMaxFor(dayKey?: string | null, maintenance = false): number {
  const base = (dayKey ? WORKOUT_MAX_BY_DAY[dayKey] : undefined) ?? WORKOUT_MAX_DEFAULT
  return maintenance ? base * MAINTENANCE_DRAIN_FACTOR : base
}

/**
 * The floor of the relative term, on a maintenance day.
 *
 * ── WHY THE NORMAL FLOOR IS WRONG ON A DELOAD ────────────────────────────────
 * `relMin` is 0.6, and its own comment says why: "a session at ≤60% of normal
 * still costs something". That is a statement about a NORMAL week, where a
 * short session usually means a session that was cut off — you still warmed up,
 * still travelled, still worked. The floor stops the model claiming a half
 * session was free.
 *
 * On a deload the same floor argues the opposite of the week's instruction. A
 * maintenance session at 45% of its own trailing average is charged as though
 * it were 60%, because the clamp will not go lower: the multiplier bottoms out
 * at `0.6/1.4 = 0.43` however light the week actually was, so the one variable
 * that is supposed to fall cannot fall past a point.
 *
 * 0.35 is the floor for those days. It is still a floor — a maintenance session
 * is not free either, and the fixed costs are the same ones — it simply sits
 * below the range a real deload occupies instead of inside it. On the worked
 * case (a legs day at 45% of normal, RPE 6) the drain goes 6.1 → 4.4.
 *
 * ── AND IT IS SAFE BY CONSTRUCTION ───────────────────────────────────────────
 * A LOWER floor can only ever lower a drain, so `MAX_TOTAL_DRAIN` is untouched
 * and the invariant v6 broke — the drain budget staying strictly under the
 * charge budget — still holds without needing to be rechecked. That is the same
 * argument `MAINTENANCE_DRAIN_FACTOR` makes for being a factor below 1.
 */
export const MAINTENANCE_REL_MIN = 0.35

/** The floor of the relative term for this kind of day. */
export function relMinFor(maintenance: boolean): number {
  return maintenance ? MAINTENANCE_REL_MIN : BATTERY.relMin
}

/**
 * Wake charge from sleep quality (0..1): 55 + 45·q, rounded — then minus 3 for
 * a night you struggled to fall into (`daily_logs.sleep_onset_trouble`, v8).
 *
 * The penalty is applied AFTER the rounding and OUTSIDE the clamp, so the worst
 * start is 52, not 55: the flag is a fact about the night that the stages and
 * the duration cannot see (a long night that took ninety minutes to begin is
 * still a long night), and folding it into `q` would have let a perfect
 * duration cancel it.
 */
export function computeMorningCharge(sleepQuality: number, onsetTrouble = false): number {
  return Math.round(BATTERY.wakeMin + BATTERY.wakeRange * clamp(sleepQuality, 0, 1))
    - (onsetTrouble ? BATTERY.onsetPenalty : 0)
}

/** The signals the wake charge reads. A subset of `ScoringInputs`, so the export can hand in a day. */
export type SleepSignals = Pick<ScoringInputs,
  'sleepHours' | 'deepMinutes' | 'remMinutes' | 'sleepGoalHours' | 'restingHR' | 'baselineHR' | 'hrvMs' | 'hrvBaseline'>

/** `computeSleepQuality`, with the four terms it is built from. Each is 0..1. */
export interface SleepQualityParts {
  /** Duration vs goal, capped at 1. */
  ratio: number
  /** (deep + REM) / asleep, saturating at `restorativeShare` (45 %). */
  stagesQ: number
  /** 0.5 at baseline; 1 at twice the baseline; 0 at zero. 0.5 when either side is missing. */
  hrvQ: number
  /** 1 at or below baseline; 0 at +20 bpm. 1 when either side is missing. */
  rhrQ: number
  quality: number
}

/**
 * Sleep quality 0..1 (v8) — 55 % duration vs goal, 15 % restorative stages,
 * 15 % HRV vs baseline, 15 % resting HR vs baseline. Drives the wake charge.
 *
 * ── WHAT CHANGED FROM v7 ─────────────────────────────────────────────────────
 * v7 read 70 % duration, 15 % deep minutes (75 min = 1), 15 % RHR. Deep alone
 * missed REM — a 5h30 night with 60 min deep scored the stages term as well as
 * a 9h one — and HRV, the one overnight signal the watch reports that actually
 * tracks recovery, was read by the recovery score and never by the battery.
 * The stages term is now a SHARE of the night (Apple's own ~45 % restorative
 * guide), so it cannot be bought with a long night alone, and HRV takes the
 * 15 points that came off duration.
 *
 * Every term degrades to its neutral value when its inputs are missing —
 * `hrvQ` to 0.5, `rhrQ` to 1, `stagesQ` to 0 on a night with no minutes —
 * rather than to a penalty, because an unsynced reading is not a bad reading.
 */
export function sleepQualityParts(inputs: SleepSignals): SleepQualityParts {
  const ratio = inputs.sleepGoalHours ? Math.min(1, inputs.sleepHours / inputs.sleepGoalHours) : 1
  const asleepMin = inputs.sleepHours * 60
  const stagesQ = asleepMin > 0
    ? clamp((inputs.deepMinutes + inputs.remMinutes) / (BATTERY.restorativeShare * asleepMin), 0, 1)
    : 0
  let hrvQ = 0.5
  if (inputs.hrvMs && inputs.hrvBaseline) {
    hrvQ = clamp(0.5 + (inputs.hrvMs - inputs.hrvBaseline) / (2 * inputs.hrvBaseline), 0, 1)
  }
  let rhrQ = 1
  if (inputs.restingHR && inputs.baselineHR) {
    // +20 bpm over baseline → 0; at/below baseline → 1
    rhrQ = clamp(1 - (inputs.restingHR - inputs.baselineHR) / 20, 0, 1)
  }
  const quality = clamp(0.55 * ratio + 0.15 * stagesQ + 0.15 * hrvQ + 0.15 * rhrQ, 0, 1)
  return { ratio, stagesQ, hrvQ, rhrQ, quality }
}

export function computeSleepQuality(inputs: SleepSignals): number {
  return sleepQualityParts(inputs).quality
}

/** The signals the stress drain reads. */
export type StressSignals = Pick<ScoringInputs, 'restingHR' | 'baselineHR' | 'hrvMs' | 'hrvBaseline' | 'fatigueLevel'>

export interface StressParts {
  /** 4 per 10 bpm over the resting-HR baseline. 0 at or below it, or unmeasured. */
  rhrTerm: number
  /** 3 at half the HRV baseline. 0 at or above it, or unmeasured. */
  hrvTerm: number
  /** 0..4 — Fresh / Fine / Worn / Heavy / Empty of the LATEST slot logged today. 0 unlogged. */
  fatigueTerm: number
  /** The sum, capped at `stressCap`. */
  drain: number
}

/**
 * Stress drain (v8, cap 10) — the day's physiological and felt load that no
 * session explains: an elevated resting HR, a suppressed HRV, and how the
 * athlete said they felt at the last reading of the day.
 *
 * ── THE FATIGUE TERM IS THE FIRST SELF-REPORT TO REACH A NUMBER ──────────────
 * `useFatigue` says the tracker "does NOT feed the score" and that stays true:
 * the DAY SCORE does not read it. The battery is a different object — it is
 * the one number that is supposed to describe how much is left, and "Empty"
 * is the wearer saying so in the only unit they actually feel. Four points at
 * most, against a 100-point charge, and only for the latest reading: a Fresh
 * morning that ended Heavy is Heavy.
 *
 * Every term is floored at zero. A LOW resting HR or a HIGH HRV is already
 * credited by the wake charge; it does not also recharge the battery, because
 * nothing does (see the header).
 */
export function stressParts(inputs: StressSignals): StressParts {
  const rhrTerm = inputs.restingHR && inputs.baselineHR
    ? 4 * Math.max(0, (inputs.restingHR - inputs.baselineHR) / 10)
    : 0
  const hrvTerm = inputs.hrvMs && inputs.hrvBaseline
    ? 3 * Math.max(0, ((inputs.hrvBaseline - inputs.hrvMs) / inputs.hrvBaseline) * 2)
    : 0
  const fatigueTerm = inputs.fatigueLevel != null && inputs.fatigueLevel >= 1
    ? clamp(inputs.fatigueLevel - 1, 0, 4)
    : 0
  return { rhrTerm, hrvTerm, fatigueTerm, drain: Math.min(BATTERY.stressCap, rhrTerm + hrvTerm + fatigueTerm) }
}

export function stressDrain(inputs: StressSignals): number {
  return stressParts(inputs).drain
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
 *
 * ── RPE IS NOT DISCOUNTED ON A DELOAD, AND THAT IS DELIBERATE ────────────────
 * `maintenance` lowers the ceiling (`workoutMaxFor`) and the relative floor
 * (`relMinFor`) and touches nothing else. It must never scale the effort term:
 * if you logged RPE 9 on a maintenance day then it WAS a nine, and a model that
 * quietly halved the one honest input the athlete supplies would be telling you
 * you are fresh on the day you are not. The week's lightness is expressed by
 * the two terms that describe the PLAN; the RPE describes what happened.
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
  return workoutMaxFor(dayKey, maintenance) * intensity
    * clamp(relative, relMinFor(maintenance), BATTERY.relMax) / BATTERY.relMax
}

/**
 * Current battery % — strict drain-only (v8).
 *   currentPct = clamp(wakeCharge − timeDrain − activityDrain − workoutDrain − stressDrain, floor, 100)
 *   wakeCharge    = round(55 + 45·q) − (onsetTrouble ? 3 : 0)
 *   timeDrain     = timeMax × (1 − cos(π · awake/maxAwake)) / 2
 *   activityDrain = min(cap, 0.004×activeCal + 0.5×(steps/1000))
 *   workoutDrain  = workoutMax × (rpe/10) × clamp(vol/trailingAvg, relMin, 1.4) / 1.4
 *                   relMin = 0.6, or 0.35 on a maintenance day
 *   stressDrain   = min(10, 4·rhrΔ/10 + 3·2·hrvΔ/base + (fatigue − 1))
 */
export function computeBattery(inputs: ScoringInputs, hoursAwake?: number): BatteryState {
  const wakeCharge = computeMorningCharge(computeSleepQuality(inputs), inputs.sleepOnsetTrouble === true)

  const awake = clamp(hoursAwake ?? inputs.hoursAwake ?? 8, 0, BATTERY.maxAwake)
  const time = timeDrain(awake)
  const activity = Math.min(BATTERY.activityCap, 0.004 * inputs.activeCal + 0.5 * (inputs.steps / 1000))
  const workout = workoutDrain(
    inputs.sessionVolumeKg, inputs.trailingAvgVolumeKg, inputs.sessionRpe, inputs.sessionDayKey,
    inputs.isMaintenance,
  )

  const stress = stressDrain(inputs)

  const currentPct = clamp(wakeCharge - time - activity - workout - stress, BATTERY.floor, 100)
  return { morningCharge: wakeCharge, currentPct: Math.round(currentPct) }
}
