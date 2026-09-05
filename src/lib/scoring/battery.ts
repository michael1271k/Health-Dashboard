import type { ScoringInputs } from './types'
import { READINESS } from './readiness'

export interface BatteryState {
  morningCharge: number   // 0–100 (charge at wake, sleep-driven)
  currentPct: number      // 0–100 (time-of-day aware)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Phone-like battery — drain-only (v7), v8's stages-share charge, and v9's
 * readiness signals on top. v9 changed WHAT the charge reads (HRV and resting
 * HR as z-scores against your own 42-day baseline rather than a 7-day mean)
 * and replaced ONE drain (v8's stress term) with TWO (training load, and a
 * Hooper-style wellness index) — the shape below is otherwise unchanged.
 * `docs/READINESS_MODEL.md` states the model with its citations.
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
 * ── WHY v8's STRESS DRAIN WAS REPLACED (v9) ──────────────────────────────────
 * v8 compared today's HRV and resting HR against a seven-day mean, twice: once
 * in the charge (as a quality term) and once in a "stress" drain. A single
 * night's HRV is noisy enough that Plews (2013) recommends never reading it
 * alone, and a seven-day mean as the baseline meant a bad week quietly became
 * the new normal. v9 reads a 7-day ROLLING mean against a 42-day baseline and
 * its SD (Buchheit 2014), with the smallest worthwhile change as a dead-band,
 * and reads each signal ONCE, in the charge. The drain budget that used to hold
 * stress now holds the two things v8 could not see at all: training load
 * (Foster's sRPE through Williams's EWMA ACWR, plus monotony/strain) and how
 * the athlete says they feel (Hooper 1995).
 *
 * ── THE MODEL ────────────────────────────────────────────────────────────────
 *   - Wake high (≈90–100 after good sleep, never below 55).
 *   - Only ever depletes: time + activity + workout + load + wellness. There is
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
  version: 9,
  floor: 5,
  wakeMin: 55,         // worst-sleep wake charge
  wakeRange: 45,       // + up to 45 for perfect sleep → 100
  timeMax: 35,         // full chronological cost of an 18h day, cosine-distributed
  activityCap: 12,
  workoutMax: 32,      // the HEAVIEST day's ceiling — see WORKOUT_MAX_BY_DAY
  loadCap: 8,          // v9 — ACWR past 1.3, and a strain above your own normal
  wellnessCap: 6,      // v9 — the Hooper-style index: fatigue, soreness, onset, short sleep
  restorativeShare: 0.45, // v8 — (deep + REM) / asleep at which the stages term saturates
  /** The charge a z-signal reads at exactly baseline, or when it has no opinion. */
  zNeutral: 0.75,
  /** Charge per baseline SD: +1 SD fills the term, −2 SD leaves a quarter. */
  zSlope: 0.25,
  defaultRpe: 0.7,     // when session_rpe is absent (legacy sessions carry none)
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
 * v9: 35 + 12 + 32 + 8 + 6 = 93. The stress cap (10) left with the term; the
 * two drains that replaced it are capped at 14 between them, and the onset
 * penalty that used to sit outside the budget is a wellness item now — so the
 * worst day on a perfect night ends at 7, two above the floor.
 */
export const MAX_TOTAL_DRAIN = BATTERY.timeMax + BATTERY.activityCap + BATTERY.workoutMax + BATTERY.loadCap + BATTERY.wellnessCap

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
 * `MAX_TOTAL_DRAIN` is 93 against a 100 charge budget, and v6 broke precisely by
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
 * Wake charge from sleep quality (0..1): 55 + 45·q, rounded.
 *
 * v8 took a further 3 off here for a night that was hard to fall into. v9
 * reads that flag as one of the four wellness items instead (see
 * `wellnessParts`), so it is charged once, in the drain that describes how the
 * athlete feels, rather than once here and again there.
 */
export function computeMorningCharge(sleepQuality: number): number {
  return Math.round(BATTERY.wakeMin + BATTERY.wakeRange * clamp(sleepQuality, 0, 1))
}

/**
 * A z-signal as a 0..1 charge term.
 *
 * Neutral is 0.75, not 0.5: a z of zero means "exactly your own normal", and
 * a normal night should charge nearly fully — the term exists to take charge
 * away when the signal is suppressed and to add a little when it is genuinely
 * good, not to withhold a quarter of the charge every ordinary morning. +1 SD
 * fills the term; −2 SD (the clamp) leaves a quarter of it. A missing z — thin
 * history, a flat baseline — reads as neutral, never as a penalty.
 */
export function zQuality(z: number | null | undefined): number {
  if (z == null || !Number.isFinite(z)) return BATTERY.zNeutral
  return clamp(BATTERY.zNeutral + BATTERY.zSlope * z, 0, 1)
}

/** The signals the wake charge reads. A subset of `ScoringInputs`, so the export can hand in a day. */
export type SleepSignals = Pick<ScoringInputs,
  'sleepHours' | 'deepMinutes' | 'remMinutes' | 'sleepGoalHours' | 'hrvZ' | 'rhrZ'>

/** `computeSleepQuality`, with the four terms it is built from. Each is 0..1. */
export interface SleepQualityParts {
  /** Duration vs goal, capped at 1. */
  ratio: number
  /** (deep + REM) / asleep, saturating at `restorativeShare` (45 %). */
  stagesQ: number
  /** `zQuality(hrvZ)`: 0.75 at baseline or unknown, 1 at +1 SD, 0.25 at −2 SD. */
  hrvQ: number
  /** `zQuality(−rhrZ)`: 0.75 at baseline or unknown, 1 at −1 SD, 0.25 at +2 SD. */
  rhrQ: number
  quality: number
}

/**
 * Sleep quality 0..1 (v9) — 45 % duration vs goal, 15 % restorative stages,
 * 25 % HRV z, 15 % resting-HR z. Drives the wake charge.
 *
 * ── WHAT CHANGED FROM v8 ─────────────────────────────────────────────────────
 * v8 read 55 % duration, 15 % stages, 15 % HRV vs a 7-day mean, 15 % RHR vs a
 * 7-day mean. HRV takes ten points off duration because it is the one
 * overnight signal that tracks the autonomic state the battery is trying to
 * describe, and because as a z-score against six weeks of your own readings it
 * finally means something a single-night ratio never did (Plews 2013).
 *
 * Every term degrades to its neutral value when its inputs are missing —
 * `hrvQ` and `rhrQ` to 0.75, `stagesQ` to 0 on a night with no minutes —
 * rather than to a penalty, because an unsynced reading is not a bad reading.
 */
export function sleepQualityParts(inputs: SleepSignals): SleepQualityParts {
  const ratio = inputs.sleepGoalHours ? Math.min(1, inputs.sleepHours / inputs.sleepGoalHours) : 1
  const asleepMin = inputs.sleepHours * 60
  const stagesQ = asleepMin > 0
    ? clamp((inputs.deepMinutes + inputs.remMinutes) / (BATTERY.restorativeShare * asleepMin), 0, 1)
    : 0
  const hrvQ = zQuality(inputs.hrvZ)
  // A HIGH resting HR is the bad direction, so the sign flips.
  const rhrQ = zQuality(inputs.rhrZ == null ? null : -inputs.rhrZ)
  const quality = clamp(0.45 * ratio + 0.15 * stagesQ + 0.25 * hrvQ + 0.15 * rhrQ, 0, 1)
  return { ratio, stagesQ, hrvQ, rhrQ, quality }
}

export function computeSleepQuality(inputs: SleepSignals): number {
  return sleepQualityParts(inputs).quality
}

/** The signals the wellness drain reads. */
export type WellnessSignals = Pick<ScoringInputs,
  'fatigueLevel' | 'domsSeverity' | 'sleepOnsetTrouble' | 'sleepHours' | 'sleepGoalHours'>

/**
 * The Hooper-style index, item by item. Each item is 0..1 where 1 is WORST,
 * and null when the question was not answered that day.
 */
export interface WellnessParts {
  /** (level − 1) / 4 — Fresh 0 … Empty 1. */
  fatigue: number | null
  /** Mean DOMS severity / 3 — none 0 … severe 1. */
  soreness: number | null
  /** 1 for a night that was hard to fall into, 0 otherwise — false IS an answer. Null only when the column was unreadable. */
  onset: number | null
  /** 1 − duration/goal — a full night 0, a near-empty one → 1. Null with no night at all. */
  sleep: number | null
  /** Mean of the answered items. Null when none was. */
  index: number | null
  /** `wellnessCap × index`; 0 when nothing was answered. */
  drain: number
}

/**
 * Wellness drain (v9, cap 6) — how the athlete SAYS they are, in the four
 * questions Hooper (1995) found track overtraining ahead of the physiology:
 * fatigue, muscle soreness, sleep, and (in place of Hooper's "stress") the
 * night that was hard to fall into.
 *
 * ── THE ITEMS ARE AVERAGED OVER THE ONES THAT WERE ANSWERED ──────────────────
 * Hooper's index is a sum over four items that are always answered. Here two
 * of them are optional self-reports, and a sum would read "did not open the
 * tracker" as "feels perfect". So the index is the MEAN of what was answered:
 * three complaints out of three answered is the same index as four out of
 * four, and a day with nothing answered has no index and drains nothing.
 *
 * Onset and sleep are (nearly) always answered: onset because the column is
 * NOT NULL and an unticked night is a "no", sleep whenever a night was
 * recorded. So on an ordinary logged day the index is a mean of three or
 * four, and the two optional complaints are diluted by the two that were
 * fine — which is the point. "Empty" on a full night that fell asleep easily
 * is one complaint out of three, not the whole story.
 *
 * ── SLEEP IS COUNTED HERE AND IN THE CHARGE, ON PURPOSE ──────────────────────
 * The duration ratio already drives 45 % of the wake charge. Hooper's sleep
 * item is not a second reading of the same fact but the same fact in a
 * different frame — a short night as a COMPLAINT, alongside the other three —
 * and it is worth at most a quarter of a six-point cap. The double count
 * approaches 1.5 points on a near-empty night; a night with no record at all
 * is not a short night but an unknown one, and contributes nothing here.
 */
export function wellnessParts(inputs: WellnessSignals): WellnessParts {
  const fatigue = inputs.fatigueLevel != null && Number.isFinite(inputs.fatigueLevel) && inputs.fatigueLevel >= 1
    ? clamp((inputs.fatigueLevel - 1) / 4, 0, 1)
    : null
  const soreness = inputs.domsSeverity != null && Number.isFinite(inputs.domsSeverity) && inputs.domsSeverity >= 0
    ? clamp(inputs.domsSeverity / 3, 0, 1)
    : null
  const onset = inputs.sleepOnsetTrouble == null ? null : (inputs.sleepOnsetTrouble ? 1 : 0)
  const sleep = inputs.sleepHours > 0 && inputs.sleepGoalHours > 0
    ? clamp(1 - Math.min(1, inputs.sleepHours / inputs.sleepGoalHours), 0, 1)
    : null
  const answered = [fatigue, soreness, onset, sleep].filter((v): v is number => v != null)
  const index = answered.length ? answered.reduce((a, b) => a + b, 0) / answered.length : null
  return { fatigue, soreness, onset, sleep, index, drain: index != null ? BATTERY.wellnessCap * index : 0 }
}

export function wellnessDrain(inputs: WellnessSignals): number {
  return wellnessParts(inputs).drain
}

/** The signals the load drain reads. */
export type LoadSignals = Pick<ScoringInputs, 'acwr' | 'strainZ'>

export interface LoadParts {
  /** 0 at or below an ACWR of 1.3, `loadCap × acwrShare` at 2.0 and beyond. */
  acwrTerm: number
  /** 0 at or below your own normal strain, `loadCap × (1 − acwrShare)` at +2 SD. */
  strainTerm: number
  /** The sum, capped at `loadCap`. */
  drain: number
}

/**
 * Load drain (v9, cap 8) — the training you have done that today's session
 * does not explain.
 *
 * The ACWR term reads the top of the "sweet spot": below 1.3 the acute load is
 * inside what the chronic load has prepared you for and nothing is charged;
 * from 1.3 to 2.0 the charge rises linearly and then saturates. The strain
 * term reads this week's Foster strain against your own rolling strains —
 * positive only. A LOW ratio or a light week is credited by nothing here,
 * because nothing recharges (see the header).
 */
export function loadParts(inputs: LoadSignals): LoadParts {
  const acwrCap = BATTERY.loadCap * READINESS.acwrShare
  const strainCap = BATTERY.loadCap - acwrCap
  const acwrTerm = inputs.acwr != null && Number.isFinite(inputs.acwr)
    ? acwrCap * clamp((inputs.acwr - READINESS.acwrOnset) / (READINESS.acwrSaturation - READINESS.acwrOnset), 0, 1)
    : 0
  const strainTerm = inputs.strainZ != null && Number.isFinite(inputs.strainZ)
    ? strainCap * clamp(inputs.strainZ / READINESS.zClamp, 0, 1)
    : 0
  return { acwrTerm, strainTerm, drain: Math.min(BATTERY.loadCap, acwrTerm + strainTerm) }
}

export function loadDrain(inputs: LoadSignals): number {
  return loadParts(inputs).drain
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
 * Every term behind one battery reading — what the future dashboard tile
 * draws and what the export's Derived block prints. `computeBattery` is this
 * with everything but the two numbers thrown away.
 */
export interface BatteryBreakdown {
  version: number
  hoursAwake: number
  charge: SleepQualityParts & { morningCharge: number }
  drains: {
    time: number
    activity: number
    workout: number
    load: number
    wellness: number
    /** The five, summed — before the floor and ceiling. */
    total: number
  }
  loadParts: LoadParts
  wellnessParts: WellnessParts
  currentPct: number
}

/**
 * Current battery % — strict drain-only (v9), term by term.
 *   currentPct    = clamp(wakeCharge − time − activity − workout − load − wellness, floor, 100)
 *   wakeCharge    = round(55 + 45·q), q = 0.45·ratio + 0.15·stages + 0.25·hrvQ + 0.15·rhrQ
 *   timeDrain     = timeMax × (1 − cos(π · awake/maxAwake)) / 2
 *   activityDrain = min(cap, 0.004×activeCal + 0.5×(steps/1000))
 *   workoutDrain  = workoutMax × (rpe/10) × clamp(vol/trailingAvg, relMin, 1.4) / 1.4
 *                   relMin = 0.6, or 0.35 on a maintenance day
 *   loadDrain     = min(8, 5·clamp((ACWR − 1.3)/0.7) + 3·clamp(strainZ/2))
 *   wellnessDrain = 6 × mean(fatigue, soreness, onset, short sleep — the answered ones)
 */
export function batteryBreakdown(inputs: ScoringInputs, hoursAwake?: number): BatteryBreakdown {
  const q = sleepQualityParts(inputs)
  const wakeCharge = computeMorningCharge(q.quality)

  const awake = clamp(hoursAwake ?? inputs.hoursAwake ?? 8, 0, BATTERY.maxAwake)
  const time = timeDrain(awake)
  const activity = Math.min(BATTERY.activityCap, 0.004 * inputs.activeCal + 0.5 * (inputs.steps / 1000))
  const workout = workoutDrain(
    inputs.sessionVolumeKg, inputs.trailingAvgVolumeKg, inputs.sessionRpe, inputs.sessionDayKey,
    inputs.isMaintenance,
  )
  const load = loadParts(inputs)
  const wellness = wellnessParts(inputs)
  const total = time + activity + workout + load.drain + wellness.drain

  const currentPct = clamp(wakeCharge - total, BATTERY.floor, 100)
  return {
    version: BATTERY.version,
    hoursAwake: awake,
    charge: { ...q, morningCharge: wakeCharge },
    drains: { time, activity, workout, load: load.drain, wellness: wellness.drain, total },
    loadParts: load,
    wellnessParts: wellness,
    currentPct: Math.round(currentPct),
  }
}

/** The two numbers the app stores. See `batteryBreakdown` for the rest. */
export function computeBattery(inputs: ScoringInputs, hoursAwake?: number): BatteryState {
  const b = batteryBreakdown(inputs, hoursAwake)
  return { morningCharge: b.charge.morningCharge, currentPct: b.currentPct }
}
