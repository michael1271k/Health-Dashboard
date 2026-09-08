import { READINESS, zSignal, type ZSignal } from './readiness'

/**
 * STRESS INDEX v1 — a report-only index over the signals readiness already has.
 *
 * ── WHAT IT IS, AND WHAT IT IS NOT ───────────────────────────────────────────
 * Daily `S ∈ [10, 90]`, 50 = your normal, in the readiness v9 grammar: personal
 * z-scores against your own baseline, SWC-gated, clamped ±2, missing terms
 * neutral, answered terms renormalised, load never negative. It is a TILE, a
 * TRENDS series and an export line (decision 2, 2026-09-06). It is NOT a
 * battery input: `Battery.breakdown` does not read it and never will — the
 * budget stays 93 and `InvariantTests` asserts it on both sides.
 *
 * ── THE FOUR TERMS ───────────────────────────────────────────────────────────
 *   z_auto  = mean of answered { −hrvZ, rhrZ }         Plews 2013 / Buchheit 2014
 *   z_sleep = mean of answered { fragZ, onset }        Ohayon 2017 (fragmentation), Hooper 1995 (onset)
 *   z_self  = clamp(fatigue day mean − 3, ±2)          Hooper 1995 — ALL slots, not the latest
 *   z_load  = clamp(½(max(0, strainZ) + 2·max(0, min(ACWR, 2) − 1.3)/0.7), 0, 2)   Foster 1998
 *   S       = clamp(50 + 20 · Σ wᵢ zᵢ / Σ wᵢ over ANSWERED terms, 10, 90)
 *   w       = { auto .35, sleep .25, self .25, load .15 }
 *
 * ── COLLINEARITY, STATED PLAINLY ─────────────────────────────────────────────
 * Three of the four terms are built from the same scalars the battery reads
 * (`hrvZ`, `rhrZ`, `acwr`, `strainZ`, `sleepOnsetTrouble`, fatigue). The index
 * WILL co-move with `BatteryStackSeries` by construction; that is why it uses
 * the load drain's own INPUTS (ACWR, strain z) rather than the drain value, so
 * two surfaces cannot disagree about the same fact. `docs/STRESS_MODEL.md` says
 * this at length. The two terms the battery does not see — fragmentation and
 * the day's whole fatigue curve — are the reason the index exists at all.
 *
 * ── NO SECOND SMOOTHING ──────────────────────────────────────────────────────
 * The z inputs are already 7-day rolling means against a 42-day baseline. The
 * sparkline draws S itself.
 */
export const STRESS = {
  version: 1,
  /** Term weights. Renormalised over the answered terms. */
  weights: { auto: 0.35, sleep: 0.25, self: 0.25, load: 0.15 },
  /** `S = center + scale · composite`. */
  center: 50,
  scale: 20,
  /** The reachable range, and the clamp. */
  min: 10,
  max: 90,
  /** The 1–5 fatigue scale's midpoint — "Worn" — reads as z = 0. */
  fatigueNeutral: 3,
  /**
   * Bands on the reachable range: Calm < 30 · Baseline 30–50 · Elevated 50–62 ·
   * High 62–75 · Overreached > 75. Each `upTo` is the band's INCLUSIVE ceiling
   * (Calm's is exclusive: 30 is already Baseline), so 50 — your normal — reads
   * Baseline, never Elevated. `stressBand` is the one place the edges are read.
   */
  bands: [
    { key: 'calm', label: 'Calm', upTo: 30 },
    { key: 'baseline', label: 'Baseline', upTo: 50 },
    { key: 'elevated', label: 'Elevated', upTo: 62 },
    { key: 'high', label: 'High', upTo: 75 },
    { key: 'overreached', label: 'Overreached', upTo: Infinity },
  ],
} as const

export type StressBand = (typeof STRESS.bands)[number]['key']
export type StressTermKey = keyof typeof STRESS.weights

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v)

// ─────────────────────────────────────────────────────────────────────────────
// Fragmentation — the one series readiness does not already carry
// ─────────────────────────────────────────────────────────────────────────────

/** A night as the fragmentation series needs it. */
export interface FragmentationNight {
  awakeMin: number | null | undefined
  asleepMin: number | null | undefined
  deepMin?: number | null
  remMin?: number | null
}

/**
 * `awake / asleep` for one night, or null when the row cannot claim one: no
 * night, nothing asleep, or a DURATION-ONLY row (awake = deep = rem = 0), whose
 * zero awake minutes are an absence of stage data, not a perfectly still night.
 */
export function fragmentationRatio(n: FragmentationNight): number | null {
  if (!finite(n.asleepMin) || n.asleepMin <= 0 || !finite(n.awakeMin) || n.awakeMin < 0) return null
  const deep = finite(n.deepMin) ? n.deepMin : 0
  const rem = finite(n.remMin) ? n.remMin : 0
  if (n.awakeMin === 0 && deep === 0 && rem === 0) return null
  return n.awakeMin / n.asleepMin
}

/**
 * The fragmentation z: `awake / asleep` per night through the same z-signal
 * the HRV and resting HR use (rolling 7 vs the 42 before, SWC 0.5 SD, ±2).
 * Series are oldest → newest, `null` for a night with no ratio. Raw, not
 * logged: the ratio is already a proportion.
 */
export function fragmentationZ(
  awakeMin: ReadonlyArray<number | null | undefined>,
  asleepMin: ReadonlyArray<number | null | undefined>,
): ZSignal {
  const n = Math.min(awakeMin.length, asleepMin.length)
  const ratios: Array<number | null> = []
  for (let i = 0; i < n; i++) {
    const a = awakeMin[i]
    const s = asleepMin[i]
    // The history builder has already nulled awake on a duration-only night.
    ratios.push(finite(s) && s > 0 && finite(a) && a >= 0 ? a / s : null)
  }
  return zSignal(ratios, { log: false })
}

// ─────────────────────────────────────────────────────────────────────────────
// The index
// ─────────────────────────────────────────────────────────────────────────────

export interface StressInputs {
  /** From `Readiness.signals`. Positive HRV z is GOOD; positive RHR z is BAD. */
  hrvZ?: number | null
  rhrZ?: number | null
  /** `fragmentationZ(...).z`. */
  fragZ?: number | null
  /** `daily_logs.sleep_onset_trouble`. Null only when the column was unreadable. */
  sleepOnsetTrouble?: boolean | null
  /** Mean of the DAY's fatigue slots, 1 (Fresh) … 5 (Empty). Null when none logged. */
  fatigueDayMean?: number | null
  /** From `Readiness.signals.load`. */
  acwr?: number | null
  strainZ?: number | null
}

/** One term: its z, whether anything answered it, and the pieces it was built from. */
export interface StressTerm {
  /** Null when no input answered the term — the term is then neutral (excluded). */
  z: number | null
  weight: number
  /** How many of the term's inputs were present. */
  answered: number
}

export interface StressBreakdown {
  version: number
  terms: {
    auto: StressTerm & { hrv: number | null; rhr: number | null }
    sleep: StressTerm & { frag: number | null; onset: number | null }
    self: StressTerm & { fatigueDayMean: number | null }
    load: StressTerm & { acwrTerm: number; strainTerm: number }
  }
  /** Σ wᵢ over the answered terms. 0 when nothing answered. */
  weightSum: number
  /** Σ wᵢ zᵢ / Σ wᵢ. Null when nothing answered. */
  composite: number | null
  /** `round(clamp(50 + 20·composite, 10, 90))`. Null when nothing answered. */
  index: number | null
  band: StressBand | null
}

/** Which band a reading falls in — see `STRESS.bands` for the edge rule. */
export function stressBand(index: number): StressBand {
  const [calm, ...rest] = STRESS.bands
  if (index < calm.upTo) return calm.key
  for (const b of rest) if (index <= b.upTo) return b.key
  return 'overreached'
}

export function stressBandLabel(band: StressBand | null): string | null {
  return STRESS.bands.find((b) => b.key === band)?.label ?? null
}

function meanOfAnswered(values: Array<number | null>): { z: number | null; answered: number } {
  const xs = values.filter(finite)
  return { z: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, answered: xs.length }
}

/** The load term's two pieces, each ≥ 0 — a light week de-stresses nothing. */
export function stressLoadParts(acwr: number | null | undefined, strainZ: number | null | undefined): { acwrTerm: number; strainTerm: number; answered: number } {
  const acwrTerm = finite(acwr)
    ? 2 * Math.max(0, Math.min(acwr, READINESS.acwrSaturation) - READINESS.acwrOnset) / (READINESS.acwrSaturation - READINESS.acwrOnset)
    : 0
  const strainTerm = finite(strainZ) ? Math.max(0, strainZ) : 0
  return { acwrTerm, strainTerm, answered: (finite(acwr) ? 1 : 0) + (finite(strainZ) ? 1 : 0) }
}

/** Every term behind one reading — what the tile's breakdown sheet draws. */
export function stressBreakdown(inputs: StressInputs): StressBreakdown {
  const w = STRESS.weights

  const hrv = finite(inputs.hrvZ) ? -inputs.hrvZ : null
  const rhr = finite(inputs.rhrZ) ? inputs.rhrZ : null
  const auto = meanOfAnswered([hrv, rhr])

  const frag = finite(inputs.fragZ) ? clamp(inputs.fragZ, -READINESS.zClamp, READINESS.zClamp) : null
  // One-sided by design: a calm night does not de-stress.
  const onset = inputs.sleepOnsetTrouble == null ? null : (inputs.sleepOnsetTrouble ? 1 : 0)
  const sleep = meanOfAnswered([frag, onset])

  const selfZ = finite(inputs.fatigueDayMean)
    ? clamp(inputs.fatigueDayMean - STRESS.fatigueNeutral, -READINESS.zClamp, READINESS.zClamp)
    : null

  const load = stressLoadParts(inputs.acwr, inputs.strainZ)
  const loadZ = load.answered ? clamp(0.5 * (load.strainTerm + load.acwrTerm), 0, READINESS.zClamp) : null

  const terms: StressBreakdown['terms'] = {
    auto: { z: auto.z, weight: w.auto, answered: auto.answered, hrv, rhr },
    sleep: { z: sleep.z, weight: w.sleep, answered: sleep.answered, frag, onset },
    self: { z: selfZ, weight: w.self, answered: selfZ == null ? 0 : 1, fatigueDayMean: finite(inputs.fatigueDayMean) ? inputs.fatigueDayMean : null },
    load: { z: loadZ, weight: w.load, answered: load.answered, acwrTerm: load.acwrTerm, strainTerm: load.strainTerm },
  }

  let weightSum = 0
  let weighted = 0
  for (const t of Object.values(terms)) {
    if (t.z == null) continue
    weightSum += t.weight
    weighted += t.weight * t.z
  }
  const composite = weightSum > 0 ? weighted / weightSum : null
  const index = composite == null ? null : Math.round(clamp(STRESS.center + STRESS.scale * composite, STRESS.min, STRESS.max))
  return { version: STRESS.version, terms, weightSum, composite, index, band: index == null ? null : stressBand(index) }
}

/** The one number. See `stressBreakdown` for the rest. */
export function stressIndex(inputs: StressInputs): number | null {
  return stressBreakdown(inputs).index
}
