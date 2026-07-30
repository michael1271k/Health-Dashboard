/**
 * Session volume — the ONE rule, shared by the live deck (draft), the write path
 * (saveSession) and the weekly export, so all three agree.
 *
 * ASYMMETRY RULE. A unilateral set is logged as two rows sharing a `pairId`, one
 * per side. When the sides differ — "L 5 kg × 10, R 5 kg × 14" — summing both
 * literally credits the strong side's extra reps as if the weak side had done
 * them, and the number drifts up week over week without the work being there.
 * So a pair is scored at the WEAKER side, counted twice: 2 × (min weight × min
 * reps). The 5×10/5×14 example is 100 kg, not 120 kg.
 *
 * A side logged with no partner (only L committed) is scored on its own — it is
 * real work, just not a pair. Bilateral sets are plain weight × reps.
 *
 * Pure + framework-free: unit-testable and safe on the server.
 */

export interface VolumeSet {
  weightKg: number
  reps: number
  side?: 'L' | 'R' | null
  pairId?: string | null
}

/** Σ volume in kg, collapsing unilateral pairs to their weaker side. */
export function sessionVolumeKg(sets: readonly VolumeSet[]): number {
  // Preserve first-seen order so the arithmetic is deterministic.
  const pairs = new Map<string, VolumeSet[]>()
  let total = 0

  for (const s of sets) {
    const w = Number.isFinite(s.weightKg) ? s.weightKg : 0
    const r = Number.isFinite(s.reps) ? s.reps : 0
    // Only a genuine two-sided pair collapses; a pairId without a side (or a
    // side without a pairId) is just an ordinary set.
    if (s.pairId && (s.side === 'L' || s.side === 'R')) {
      const bucket = pairs.get(s.pairId) ?? []
      bucket.push({ weightKg: w, reps: r, side: s.side, pairId: s.pairId })
      pairs.set(s.pairId, bucket)
      continue
    }
    total += w * r
  }

  for (const bucket of pairs.values()) {
    const left = bucket.find((x) => x.side === 'L')
    const right = bucket.find((x) => x.side === 'R')
    if (left && right) {
      // The weaker side, counted once per limb.
      total += 2 * Math.min(left.weightKg, right.weightKg) * Math.min(left.reps, right.reps)
    } else {
      // A lone side (or a malformed 3+ bucket) — score each row as logged.
      for (const x of bucket) total += x.weightKg * x.reps
    }
  }

  // Quarter-kg microloads produce genuine half-kg volumes; keep 1 dp.
  return Math.round(total * 10) / 10
}
