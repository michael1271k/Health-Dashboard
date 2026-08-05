import type { ProgramPhase } from '@/lib/training/landmarks'

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

export function deltaVerdict(metric: Metric, delta: number, phase: ProgramPhase): Verdict {
  if (!Number.isFinite(delta) || Math.abs(delta) < EPSILON) return 'neutral'

  // Body water tracks hydration, sodium and glycogen — it is information, not an
  // outcome, and there is no phase in which more or less of it is the goal.
  if (metric === 'water') return 'neutral'

  // Muscle: unconditional. The one metric no phase gets to reinterpret.
  if (metric === 'muscle') return delta > 0 ? 'good' : 'bad'

  if (phase === 'maintenance') {
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
