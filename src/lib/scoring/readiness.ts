import type { ScoreComponents, ReadinessResult } from './types'

/**
 * READINESS v9 — the signals behind the battery, and the coach that reads it.
 *
 * ── TWO THINGS LIVE HERE ─────────────────────────────────────────────────────
 * 1. `computeReadiness` — the coach's verdict (Train Hard / Light / Rest) over
 *    the sleep score, the battery and the recovery score. Unchanged since v1.
 * 2. The v9 SIGNALS — the arithmetic that turns 49 days of history into the
 *    four scalars the battery's charge and drains read (`hrvZ`, `rhrZ`,
 *    `acwr`, `strainZ`). `docs/READINESS_MODEL.md` states the model with its
 *    citations; this file is that document's executable half, and the Swift
 *    twin (`OnyxCore/Scoring/Readiness.swift`) replays it case for case
 *    through the `readiness-*` golden vectors.
 *
 * ── WHY SCALARS AND NOT SERIES ON `ScoringInputs` ────────────────────────────
 * The battery is a pure function of ONE day's inputs, and the golden vectors
 * export whole `ScoringInputs` objects by the hundred. Putting a 49-element
 * array on every one of them would bloat the fixtures without testing anything
 * the series functions below are not already tested on directly. So the data
 * layer (`computeForDate` on the web, `ScoringInputsBuilder` on the phone)
 * runs the history through `computeReadinessSignals` first and hands the
 * battery the answers.
 *
 * ── EVERY NULL IS A NULL FOR A REASON ────────────────────────────────────────
 * A z that cannot be computed (thin history, a flat baseline) is `null`, and
 * every reader treats `null` as NEUTRAL — the charge reads 0.75, the drains
 * read 0. It is never a zero standing in for "we don't know", because a zero
 * z is a claim ("exactly at baseline") and a missing one is not.
 */

export const READINESS = {
  /** The rolling window the z-signal compares. Plews 2013: 7-day averages. */
  rollingDays: 7,
  /** The baseline the rolling mean is compared against. Buchheit 2014. */
  baselineDays: 42,
  /** `rollingDays + baselineDays` — what the data layer fetches. */
  historyDays: 49,
  /** Fewer rolling readings than this and the signal has no opinion. */
  minRolling: 3,
  /** Fewer baseline readings than this and the signal has no opinion. */
  minBaseline: 14,
  /** Smallest worthwhile change = 0.5 × baseline SD (Hopkins; Buchheit 2014). */
  swcFactor: 0.5,
  /** A z beyond this is clamped: the model is not asked to tell −3 from −6. */
  zClamp: 2,
  /** EWMA λ = 2/(N+1): acute N = 7, chronic N = 28. Williams 2017. */
  acuteLambda: 2 / 8,
  chronicLambda: 2 / 29,
  /** Monotony and strain are read over the last seven days. Foster 1998. */
  monotonyDays: 7,
  /** Fewer prior rolling strains than this and strain z has no opinion. */
  minStrainHistory: 14,
  /**
   * Fewer days WITH load before the rolling window than this and the ACWR
   * has no opinion. A chronic average built on nothing but zeros cannot tell
   * six weeks off from six weeks of sessions that never synced, and the first
   * session after either would otherwise fire the full spike drain.
   */
  minLoadDays: 3,
  /**
   * CR-10 assumed for a lifting session that was not rated. The battery's own
   * `defaultRpe` (0.7) as a CR-10 — the two models must mean the same thing
   * by "unrated", or a session would drain as a 7 and load as a rest day.
   */
  defaultSessionRpe: 7,
  /** ACWR at which the load drain starts (the top of the "sweet spot"). */
  acwrOnset: 1.3,
  /** ACWR at which the load drain saturates. */
  acwrSaturation: 2.0,
  /** How much of the load cap the ACWR term may spend; strain gets the rest. */
  acwrShare: 5 / 8,
} as const

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function mean(xs: readonly number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** Sample standard deviation (n − 1). Null below two values. */
function sampleSd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs) as number
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

// ─────────────────────────────────────────────────────────────────────────────
// The z-signal — HRV and resting HR
// ─────────────────────────────────────────────────────────────────────────────

/** One series' reading: a rolling mean against the baseline before it. */
export interface ZSignal {
  /** Mean of the rolling window (ln-transformed when `log`). Null when too thin. */
  rolling: number | null
  baselineMean: number | null
  baselineSd: number | null
  /** Smallest worthwhile change, `swcFactor × baselineSd`. */
  swc: number | null
  /** `rolling − baselineMean`. */
  delta: number | null
  /**
   * The signal. 0 inside ±SWC (noise); otherwise `delta / baselineSd`, clamped
   * to ±`zClamp`. Null when either window is too thin or the baseline is flat.
   */
  z: number | null
  /** How many readings each window actually had. */
  n: { rolling: number; baseline: number }
}

export interface ZOptions {
  /** Take the natural log of each reading first (HRV). Non-positive → missing. */
  log: boolean
}

/**
 * `values` is oldest → newest, the last `rollingDays` entries being the window
 * and everything before them the baseline. Missing days are `null`; the data
 * layer pads the series to `historyDays` so the two windows sit where the
 * model expects them, but a shorter series is read the same way.
 */
export function zSignal(values: ReadonlyArray<number | null | undefined>, opts: ZOptions): ZSignal {
  const usable = (v: number | null | undefined): number | null => {
    if (v == null || !Number.isFinite(v)) return null
    if (!opts.log) return v
    return v > 0 ? Math.log(v) : null
  }
  const split = Math.max(0, values.length - READINESS.rollingDays)
  const baseline = values.slice(0, split).map(usable).filter((v): v is number => v != null)
  const rolling = values.slice(split).map(usable).filter((v): v is number => v != null)

  const n = { rolling: rolling.length, baseline: baseline.length }
  const rollingMean = rolling.length >= READINESS.minRolling ? mean(rolling) : null
  const baselineMean = baseline.length >= READINESS.minBaseline ? mean(baseline) : null
  const baselineSd = baseline.length >= READINESS.minBaseline ? sampleSd(baseline) : null
  const swc = baselineSd != null ? READINESS.swcFactor * baselineSd : null
  const delta = rollingMean != null && baselineMean != null ? rollingMean - baselineMean : null

  let z: number | null = null
  if (delta != null && baselineSd != null && swc != null && baselineSd > 0) {
    z = Math.abs(delta) < swc ? 0 : clamp(delta / baselineSd, -READINESS.zClamp, READINESS.zClamp)
  }
  return { rolling: rollingMean, baselineMean, baselineSd, swc, delta, z, n }
}

// ─────────────────────────────────────────────────────────────────────────────
// sRPE load — Foster 1998 / 2001
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadSession { date?: string; sessionRpe: number | null | undefined; durationMin: number | null | undefined }
export interface LoadCardio { date?: string; effort: number | null | undefined; durationMin: number | null | undefined }

/**
 * A lifting session's load: CR-10 × minutes. An unrated session is read at
 * the battery's default effort rather than as a rest day — a session you
 * forgot to rate still happened. No duration, no load.
 */
export function sessionLoad(s: LoadSession): number {
  const minutes = s.durationMin != null && Number.isFinite(s.durationMin) && s.durationMin > 0 ? s.durationMin : 0
  if (!minutes) return 0
  const rpe = s.sessionRpe != null && Number.isFinite(s.sessionRpe) && s.sessionRpe > 0
    ? clamp(s.sessionRpe, 0, 10)
    : READINESS.defaultSessionRpe
  return rpe * minutes
}

/**
 * A cardio bout's load: Borg CR-10 effort × minutes. An unrated bout carries
 * NO load: cardio effort is logged by hand and a missing one is a bout whose
 * intensity is genuinely unknown, not a forgotten rating on a session the
 * battery already charged for.
 */
export function cardioLoad(c: LoadCardio): number {
  const minutes = c.durationMin != null && Number.isFinite(c.durationMin) && c.durationMin > 0 ? c.durationMin : 0
  const effort = c.effort != null && Number.isFinite(c.effort) && c.effort > 0 ? clamp(c.effort, 0, 10) : 0
  return effort * minutes
}

/**
 * One load per date, in the order `dates` gives them. A date with nothing on
 * it is a REAL zero — a rest day is data, and it is exactly what monotony is
 * about — which is why the caller supplies the calendar rather than this
 * function inferring it from the rows.
 */
export function dailyLoads(
  dates: readonly string[],
  sessions: readonly LoadSession[],
  cardio: readonly LoadCardio[],
): number[] {
  const byDate = new Map<string, number>()
  for (const s of sessions) if (s.date) byDate.set(s.date, (byDate.get(s.date) ?? 0) + sessionLoad(s))
  for (const c of cardio) if (c.date) byDate.set(c.date, (byDate.get(c.date) ?? 0) + cardioLoad(c))
  return dates.map((d) => byDate.get(d) ?? 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// EWMA ACWR — Williams 2017; monotony and strain — Foster 1998
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadSignal {
  /** Today's load (the last entry). Null on an empty series. */
  today: number | null
  acute: number | null
  chronic: number | null
  /** `acute / chronic`. Null when there is no history or the chronic load is zero. */
  acwr: number | null
  /** Sum of the last seven daily loads. */
  weeklyLoad: number | null
  /** Mean over SD of the last seven daily loads. Null when the SD is zero. */
  monotony: number | null
  /** `weeklyLoad × monotony`. */
  strain: number | null
  /** This week's strain against the rolling strains before it, clamped ±2. */
  strainZ: number | null
}

/**
 * Exponentially weighted moving averages of a daily load series.
 *
 * Seeded with the mean of the first week rather than the first day: a series
 * that happens to open on a leg day would otherwise start the chronic average
 * three times too high, and with λ = 2/29 that seed is still 5 % of the answer
 * seven weeks later. Both averages then run from the eighth day.
 */
export function ewmaLoads(loads: readonly number[]): { acute: number | null; chronic: number | null } {
  if (!loads.length) return { acute: null, chronic: null }
  const seedN = Math.min(READINESS.monotonyDays, loads.length)
  const seed = mean(loads.slice(0, seedN)) as number
  let acute = seed
  let chronic = seed
  for (let i = seedN; i < loads.length; i++) {
    acute = loads[i] * READINESS.acuteLambda + (1 - READINESS.acuteLambda) * acute
    chronic = loads[i] * READINESS.chronicLambda + (1 - READINESS.chronicLambda) * chronic
  }
  return { acute, chronic }
}

/** Foster's week: the sum, the monotony and the strain of seven daily loads. */
function fosterWeek(week: readonly number[]): { weeklyLoad: number; monotony: number | null; strain: number | null } {
  const weeklyLoad = week.reduce((a, b) => a + b, 0)
  const sd = sampleSd(week)
  const m = mean(week) as number
  const monotony = sd != null && sd > 0 ? m / sd : null
  return { weeklyLoad, monotony, strain: monotony != null ? weeklyLoad * monotony : null }
}

/**
 * `loads` is oldest → newest, one per calendar day, today last. Rest days are
 * zeros, not gaps.
 */
export function loadSignal(loads: readonly number[]): LoadSignal {
  const n = loads.length
  const { acute, chronic } = ewmaLoads(loads)
  // The ratio needs a chronic side built on real sessions — see `minLoadDays`.
  const loadedDays = loads.slice(0, Math.max(0, n - READINESS.rollingDays)).filter((v) => v > 0).length
  const acwr = acute != null && chronic != null && chronic > 0 && loadedDays >= READINESS.minLoadDays
    ? acute / chronic
    : null

  if (n < READINESS.monotonyDays) {
    return { today: n ? loads[n - 1] : null, acute, chronic, acwr, weeklyLoad: null, monotony: null, strain: null, strainZ: null }
  }
  const thisWeek = fosterWeek(loads.slice(n - READINESS.monotonyDays))

  // Every rolling seven-day strain that ENDS before today, for the z.
  const prior: number[] = []
  for (let end = READINESS.monotonyDays; end < n; end++) {
    const s = fosterWeek(loads.slice(end - READINESS.monotonyDays, end)).strain
    if (s != null) prior.push(s)
  }
  let strainZ: number | null = null
  if (thisWeek.strain != null && prior.length >= READINESS.minStrainHistory) {
    const m = mean(prior) as number
    const sd = sampleSd(prior)
    if (sd != null && sd > 0) strainZ = clamp((thisWeek.strain - m) / sd, -READINESS.zClamp, READINESS.zClamp)
  }

  return {
    today: loads[n - 1], acute, chronic, acwr,
    weeklyLoad: thisWeek.weeklyLoad, monotony: thisWeek.monotony, strain: thisWeek.strain, strainZ,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The composite
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadinessHistory {
  /** SDNN ms per day, oldest → today. Null for a day with no reading. */
  hrv: ReadonlyArray<number | null | undefined>
  /** Resting HR bpm per day, oldest → today. */
  rhr: ReadonlyArray<number | null | undefined>
  /** sRPE load per day, oldest → today. Rest days are zeros. */
  loads: readonly number[]
  /**
   * The stress index's fragmentation series (Phase 3 E3), oldest → today.
   * `awakeMin` is null for a night with no row AND for a duration-only row
   * (awake = deep = rem = 0), whose zero is an absence of stage data rather
   * than a still night; `asleepMin` is null only for a night with no row.
   * Optional: the battery never reads them, and the `readiness-signals`
   * vectors predate them.
   */
  awakeMin?: ReadonlyArray<number | null | undefined>
  asleepMin?: ReadonlyArray<number | null | undefined>
}

export interface ReadinessSignals {
  hrv: ZSignal
  rhr: ZSignal
  load: LoadSignal
}

/** The three series through one door — what the data layer calls. */
export function computeReadinessSignals(history: ReadinessHistory): ReadinessSignals {
  return {
    hrv: zSignal(history.hrv, { log: true }),
    rhr: zSignal(history.rhr, { log: false }),
    load: loadSignal(history.loads),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The coach
// ─────────────────────────────────────────────────────────────────────────────

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
      color: '#3E9E7A',
      reason: 'Sleep, battery, and recovery are all strong today.',
    }
  }
  if (readinessScore >= 45) {
    return {
      level: 'train_light',
      label: 'Train Light',
      color: '#D4AF37',
      reason: 'Moderate readiness — a lighter session will serve you well.',
    }
  }
  return {
    level: 'rest',
    label: 'Rest Today',
    color: '#C4514E',
    reason: 'Recovery indicators are low — prioritize rest and nutrition.',
  }
}
