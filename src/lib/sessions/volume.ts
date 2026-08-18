/**
 * Session volume — the ONE rule, shared by the live deck (draft), the write path
 * (saveSession) and the weekly export, so all three agree.
 *
 * ASYMMETRY RULE. A unilateral set is logged as two rows sharing a `pairId`, one
 * per side. When the sides differ — "L 5 kg × 10, R 5 kg × 14" — summing both
 * literally credits the strong side's extra reps as if the weak side had done
 * them, and the number drifts up week over week without the work being there.
 * So a pair is scored at the WEAKER side: min weight × min reps. The 5×10/5×14
 * example is 50 kg.
 *
 * ── AND IT IS SCORED ONCE, NOT TWICE (fixed 2026-08-18) ──────────────────────
 * This used to return `2 × min w × min reps`, on the reasoning that both arms
 * did the work so a SESSION TOTAL must count both. That reasoning is sound in
 * isolation and wrong in practice, because the same physical set gets logged
 * BOTH WAYS in this database. 2026-08-18's Single Arm Lateral Raise (Cable) is
 * the proof, in one exercise on one day:
 *
 *     sets 1–2   L 5 × 15 / R 5 × 14   split      →  2 × 5 × 14 = 140 kg
 *     sets 3–4   3.75 × 16, 3.75 × 15  unsided    →       60 + 56.25 kg
 *     sets 5–6   L 3.75 × 15 / R 3.75 × 15 split  →  2 × 3.75 × 15 = 112.5 kg
 *
 * Four physical sets of one arm-at-a-time raise, and the two that happened to
 * be split scored roughly double the two that were not. Splitting a set is a
 * bookkeeping choice about how carefully you record asymmetry; it must not be
 * a way to earn tonnage. `volumeCredits` already reached this conclusion for
 * the per-set PR axis on 2026-08-05 and explicitly left the session total
 * alone — this closes that gap, so BOTH now mean "the tonnage of the set as
 * performed".
 *
 * It also reconciles the total with Hevy, which counts a single-arm set once:
 * that day read 3700.5 kg here against 3574.2 kg there, and the 126.3 kg
 * difference is exactly the two doubled pairs above.
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
      // ONE set of work, scored at the weaker side — identical to what the same
      // set weighs when it is logged as a single unsided row.
      total += Math.min(left.weightKg, right.weightKg) * Math.min(left.reps, right.reps)
    } else {
      // A lone side (or a malformed 3+ bucket) — score each row as logged.
      for (const x of bucket) total += x.weightKg * x.reps
    }
  }

  // Quarter-kg microloads produce genuine QUARTER-kg volumes — 11.25 kg × 9 is
  // 101.25, and 1 dp turned that into 101.3. Two decimals is the smallest place
  // a real plate can reach, so this rounds float representation error away and
  // nothing else. The export prints whatever survives.
  return Math.round(total * 100) / 100
}
