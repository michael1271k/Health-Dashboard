/**
 * Calories and heart rate for a session that carries neither.
 *
 * ── THE RULE: A DERIVED NUMBER MUST ANNOUNCE ITSELF ──────────────────────────
 * Everything here produces an ESTIMATE, and every estimate is stamped
 * (`calories_estimated` / `avg_bpm_estimated`) so the UI can flag it and the
 * weekly export never presents a formula's output as an observation. That is the
 * whole reason this module is allowed to exist: the app's standing rule is that
 * a fabricated number sitting beside measured ones gets read as measured.
 *
 * It only ever fills a GAP. A session that carries a real figure keeps it — no
 * smoothing, no correction, no blending.
 *
 * ── CALORIES: YOUR OWN DATA FIRST, THE COMPENDIUM SECOND ─────────────────────
 * Preferred: the median kcal/min of your OWN recent sessions of the SAME split.
 * A leg day and an arms day cost different amounts, and your watch has already
 * measured that difference dozens of times — a population constant cannot
 * improve on your own median, and it drifts as you do.
 *
 * MEDIAN, not mean: one 900 kcal outlier (a session logged with the watch left
 * on through lunch) would drag a mean permanently.
 *
 * Fallback, until there are enough samples: the ACSM Compendium of Physical
 * Activities figure for vigorous resistance training, MET 6.0.
 *
 *     kcal/min = MET × 3.5 × bodyweight_kg / 200
 *
 * At 75 kg that is 7.88 kcal/min, so a 60-minute session ≈ 473 kcal. Scaling on
 * bodyweight matters on a cut: the same session genuinely costs less at 70 kg
 * than it did at 80, and a flat constant would keep crediting the old figure.
 *
 * ── HEART RATE: THE LAST COMPARABLE SESSION ──────────────────────────────────
 * There is no formula for an average heart rate — it is not derivable from load,
 * duration or tonnage. The only honest estimate is the last measured value for
 * the same kind of session, which is why this one is a carry-forward and not an
 * arithmetic model.
 *
 * Pure + framework-free, like `volume.ts`: the server calls it and the tests
 * exercise it without a database.
 */

/** ACSM Compendium: resistance training, vigorous effort. */
export const LIFTING_MET = 6.0

/** Below this many measured sessions, the compendium is the better guess. */
export const MIN_KCAL_SAMPLES = 5

/** How far back a sample may come from and still describe you. */
export const KCAL_SAMPLE_WINDOW_DAYS = 90

export interface KcalSample {
  /** Measured active calories for the session. */
  kcal: number
  /** Its duration in minutes. */
  durationMin: number
}

/** MET formula — the population fallback. Returns null without a bodyweight. */
export function metKcalPerMin(bodyweightKg: number | null | undefined): number | null {
  if (bodyweightKg == null || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return null
  return (LIFTING_MET * 3.5 * bodyweightKg) / 200
}

/** Median kcal/min across measured sessions, or null below the sample floor. */
export function medianKcalPerMin(samples: readonly KcalSample[]): number | null {
  const rates = samples
    .filter((s) => Number.isFinite(s.kcal) && Number.isFinite(s.durationMin)
      && s.kcal > 0 && s.durationMin > 0)
    .map((s) => s.kcal / s.durationMin)
    .sort((a, b) => a - b)
  if (rates.length < MIN_KCAL_SAMPLES) return null
  const mid = Math.floor(rates.length / 2)
  return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2
}

export interface CalorieEstimate {
  kcal: number
  /** Which rule produced it — for the log line, not for the user. */
  basis: 'personal-median' | 'met-formula'
}

/**
 * Estimated calories for a session, or null when neither rule can fire (no
 * duration, and no bodyweight to fall back on).
 */
export function estimateCalories(input: {
  durationMin: number | null | undefined
  samples: readonly KcalSample[]
  bodyweightKg: number | null | undefined
}): CalorieEstimate | null {
  const { durationMin, samples, bodyweightKg } = input
  if (durationMin == null || !Number.isFinite(durationMin) || durationMin <= 0) return null

  const personal = medianKcalPerMin(samples)
  if (personal != null) {
    return { kcal: Math.round(personal * durationMin), basis: 'personal-median' }
  }
  const met = metKcalPerMin(bodyweightKg)
  if (met != null) {
    return { kcal: Math.round(met * durationMin), basis: 'met-formula' }
  }
  return null
}

/**
 * Estimated average heart rate — the previous comparable session's, carried
 * forward. Null when there is nothing to carry.
 */
export function estimateAvgBpm(previousBpm: number | null | undefined): number | null {
  if (previousBpm == null || !Number.isFinite(previousBpm) || previousBpm <= 0) return null
  return Math.round(previousBpm)
}
