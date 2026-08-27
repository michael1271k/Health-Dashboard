/**
 * Per-set RPE memory, and the session value derived from it.
 *
 * Framework-free on purpose: the draft store, the save path and the weekly
 * export all need this, and one of those runs on the server.
 *
 * THE PROBLEM THIS SOLVES. Last session's rating seeds this session's set, so
 * you only tap where the effort actually changed. But a seeded rating on a
 * HEAVIER set is a number you never gave — the deck would quietly report that
 * 62.5 kg felt exactly like 60 kg did. So the seed clears the moment the work
 * gets harder, in either axis.
 */
import { normalizeCr10 } from '@/lib/training/effort'
import { isWorkingSet } from './setTags'

/** What was remembered, and the work it was earned against. */
export interface RpeSeed {
  rpe: number
  weightKg: number
  reps: number
}

export interface ResolvedRpe {
  /** undefined = unrated. Never 0 — 0 would read as "no effort" rather than "not rated". */
  rpe: number | undefined
  /** true = cleared because the work got harder. Drives the "rate this" pip. */
  stale: boolean
}

/**
 * Decide whether a remembered rating survives the current numbers.
 *
 * Both branches of "harder" matter, because they are the two halves of double
 * progression: more load, or more reps at the same load. A 60 kg × 8 → 60 kg ×
 * 12 jump must not inherit last session's rating.
 *
 * Two rules that look like edge cases and are not:
 *
 * - **`weightKg === 0` is real data, not missing data.** Bodyweight and unloaded
 *   sets carry 0 on both sides of the comparison, so the load branch can never
 *   fire and the reps branch is the only one that can — which is exactly the
 *   behaviour those lifts need. Do NOT add a `weightKg > 0` guard; that is the
 *   same blind spot that once broke Epley, double progression and every
 *   "0 kg × 17" label.
 * - **A load DECREASE keeps the rating.** A deload week would otherwise wipe
 *   every remembered value in the program at once. The old rating is imperfect
 *   on a lighter set; it is not wrong the way an inherited rating on a heavier
 *   set is wrong.
 *
 * Restoration is symmetric — nudge the weight up and back down and the
 * remembered value returns. Forgiveness for a slip, with no confirmation step.
 */
export function resolveSeededRpe(
  seed: RpeSeed | undefined,
  current: { weightKg: number; reps: number },
): ResolvedRpe {
  if (!seed) return { rpe: undefined, stale: false }

  const loadIncreased = current.weightKg > seed.weightKg
  const repsHarder = current.weightKg === seed.weightKg && current.reps > seed.reps

  if (loadIncreased || repsHarder) return { rpe: undefined, stale: true }
  return { rpe: seed.rpe, stale: false }
}

/** The minimum a set has to look like to be weighted. Matches both `DraftSet`
 *  and a `workout_sets` row without either importing the other. */
export interface RatedSet {
  weightKg: number
  reps: number
  rpe?: number | null
  /** Structurally loose on purpose: the draft narrows this to three tags, the
   *  save payload adds `'normal'`, and a DB row is a bare string. Only 'warmup'
   *  is load-bearing here. */
  setType?: string | null
}

/**
 * session_rpe from the per-set ratings — volume-weighted, over working sets only.
 *
 * Weighted rather than maxed because `scoring/battery.ts` reads the result as an
 * intensity multiplier (`sessionRpe / 10`), and a max would over-drain a session
 * whose only hard set was a finisher. Warm-ups are excluded: rating them is not
 * asked for, and a 5 on a warm-up would drag the whole session down.
 *
 * An unloaded set has no tonnage to weight by, so it counts once rather than
 * vanishing from the mean — it still happened.
 *
 * Returns null when nothing is rated. Never a fabricated number: an unrated
 * session must stay unrated so `BATTERY.defaultRpe` can do its job.
 *
 * Note this weights each ROW, so an L/R pair contributes twice where
 * `sessionVolumeKg` would score it at the weaker side. As a weight rather than a
 * total that is proportional and harmless.
 */
export function deriveSessionRpe(sets: readonly RatedSet[]): number | null {
  let weighted = 0
  let totalWeight = 0

  for (const s of sets) {
    if (!isWorkingSet(s.setType)) continue
    if (s.rpe == null || !Number.isFinite(s.rpe)) continue
    const tonnage = s.weightKg * s.reps
    const w = tonnage > 0 ? tonnage : 1
    weighted += s.rpe * w
    totalWeight += w
  }

  if (totalWeight === 0) return null
  return normalizeCr10(weighted / totalWeight)
}
