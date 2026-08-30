import type { ProgramPhase } from '@/lib/training/landmarks'
import { EMERALD, OXIDE, MUTED } from '@/lib/theme/palette'

/**
 * Is a body-composition change good, bad, or neither — given the phase you are
 * actually in?
 *
 * −0.3 kg of bodyweight is a win mid-cut and a failure mid-bulk. Painting it
 * green in both is how a number stops meaning anything. This is the one place
 * that judgement lives; every surface reads the verdict rather than deciding
 * for itself.
 *
 * PURE. No React, no clock, no storage — the phase is passed in.
 *
 * THREE DELIBERATE ASYMMETRIES
 *
 * 1. MUSCLE IS GREEN UP AND RED DOWN IN EVERY PHASE. Losing muscle on a cut is
 *    the single failure a cut can have, and no amount of phase context excuses
 *    it. There is no phase in which less contractile tissue is the goal.
 *
 * 2. FAT GAIN IN A BULK IS NEUTRAL, NOT GREEN. Some of it is the price of the
 *    surplus. Calling it a win trains the wrong behaviour; calling it a failure
 *    makes every honest bulk look broken. Grey is the truthful answer.
 *
 * 3. MAINTENANCE HAS A DEAD BAND. Day-to-day scale movement is mostly water and
 *    gut content. Without a band a flat week paints itself alternately red and
 *    green and the colour becomes noise.
 */

export type Metric = 'weight' | 'fat' | 'muscle' | 'water'
export type Verdict = 'good' | 'bad' | 'neutral'

/**
 * How much a metric must move before maintenance calls it a direction at all.
 * Below these it is water, not progress.
 */
export const MAINTENANCE_BAND: Record<Metric, number> = {
  weight: 0.5,
  fat: 0.3,
  muscle: 0.3,
  water: Infinity,   // water is never a verdict — see below
}

/** Anything smaller than this is measurement noise in any phase. */
const EPSILON = 0.01

export function deltaVerdict(
  metric: Metric,
  delta: number,
  phase: ProgramPhase,
  /**
   * Is the period being judged a maintenance / deload week?
   *
   * ── THIS USED TO BE A THIRD `phase` VALUE ──────────────────────────────────
   * `phase === 'maintenance'` — which meant the dead band only ever applied if
   * the user had switched their whole PROGRAMME to a maintenance phase, and a
   * maintenance week pulled from the lever (the only way it is ever taken) did
   * not reach it at all. The phase is a direction now, `cut` or `bulk`, and
   * this is the separate fact it always was: ask `isMaintenanceDate`.
   */
  maintenance = false,
): Verdict {
  if (!Number.isFinite(delta) || Math.abs(delta) < EPSILON) return 'neutral'

  // Body water tracks hydration, sodium and glycogen — it is information, not an
  // outcome, and there is no phase in which more or less of it is the goal.
  if (metric === 'water') return 'neutral'

  // Muscle: unconditional. The one metric no phase gets to reinterpret.
  if (metric === 'muscle') return delta > 0 ? 'good' : 'bad'

  if (maintenance) {
    return Math.abs(delta) < MAINTENANCE_BAND[metric]
      ? 'neutral'
      // Outside the band, maintenance judges like a cut: holding weight is the
      // goal, and drifting up is the way maintenance actually fails.
      : (delta < 0 ? 'good' : 'bad')
  }

  if (metric === 'fat') {
    // Losing fat is good in every phase — including a bulk, where it is a bonus.
    if (delta < 0) return 'good'
    return phase === 'bulk' ? 'neutral' : 'bad'
  }

  // Weight: the only metric whose direction genuinely flips with the phase.
  return phase === 'cut'
    ? (delta < 0 ? 'good' : 'bad')
    : (delta > 0 ? 'good' : 'bad')
}

/**
 * The colour a verdict is drawn in.
 *
 * Lives here rather than in each surface because the whole point of the verdict
 * is that one rule decides. Nine call sites were computing `delta <= 0 ? green :
 * red` inline — which is the CUT rule, hardcoded, and therefore wrong on a bulk
 * in a way nobody would notice until the colours stopped matching the plan.
 *
 * Neutral is MUTED and not a third hue: grey is the honest answer for "this
 * moved and it does not mean anything", and inventing an amber for it would
 * imply a warning nobody made.
 */
export function verdictColor(verdict: Verdict): string {
  switch (verdict) {
    case 'good': return EMERALD
    case 'bad': return OXIDE
    default: return MUTED
  }
}

/** The one call a surface should make: metric + delta + phase → a colour. */
export function deltaColor(
  metric: Metric,
  delta: number | null | undefined,
  phase: ProgramPhase,
  /** See `deltaVerdict` — a maintenance/deload period judges inside a dead band. */
  maintenance = false,
): string {
  if (delta == null) return MUTED
  return verdictColor(deltaVerdict(metric, delta, phase, maintenance))
}
