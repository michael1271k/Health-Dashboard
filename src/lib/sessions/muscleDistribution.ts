/**
 * Where the session you are logging is actually going — PURE, extracted from
 * the `MuscleDistribution` component so the credit arithmetic can be vectored.
 */
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { SECONDARY_SET_CREDIT, toLandmarkMuscle, type LandmarkMuscle } from '@/lib/training/landmarks'
import { isSetCommitted, type SessionDraft } from '@/lib/sessions/draft'

/**
 * Weighted set counts per landmark muscle for a draft, using the ONE credit rule.
 *
 * ── WARM-UPS COUNT HERE, AND ONLY HERE ───────────────────────────────────────
 * Everywhere else in Helix a warm-up is not a set: it wins no record, it does
 * not prove you cleared a rep ceiling, and it is excluded from the weekly volume
 * targets, which were calibrated on working sets.
 *
 * This figure is different, because it answers a different question. "Where did
 * this session land" is about what the body was asked to do, and two warm-up
 * sets of leg press are two sets of leg press as far as the quads are concerned.
 * It is also the number that gets compared against Hevy's own breakdown, and
 * Hevy counts them — reconciled set by set against a real session, where the
 * single excluded warm-up accounted for a third of the disagreement.
 *
 * The line that keeps this honest is in the sheet, which prints "physical sets"
 * beside "weighted sets" and now says warm-ups are in the count.
 */
export function draftMuscleSets(draft: SessionDraft | null): Partial<Record<LandmarkMuscle, number>> {
  const out: Partial<Record<LandmarkMuscle, number>> = {}
  if (!draft) return out

  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue
    // Every committed set, WARM-UPS INCLUDED — see the note above the export.
    // A GHOST is excluded, and it is the only exclusion: a warm-up is work you
    // performed, a ghost is work you marked as skipped. Without this the sheet
    // credits muscles for sets you told it you did not do.
    const sets = ex.sets.filter((s) => isSetCommitted(s) && s.setType !== 'ghost')
    if (!sets.length) continue
    // A unilateral pair is ONE set of work, exactly as it is for tonnage.
    const seen = new Set<string>()
    let count = 0
    for (const s of sets) {
      const key = s.pairId ?? `${count}-${s.side ?? ''}-${seen.size}`
      if (s.pairId && seen.has(key)) continue
      seen.add(key)
      count += 1
    }

    const movers = resolveMovers(ex.name, ex.muscleGroups)
    const credit = new Map<LandmarkMuscle, number>()
    const add = (tokens: readonly string[], weight: number) => {
      for (const token of tokens) {
        const m = toLandmarkMuscle(token)
        if (!m) continue
        credit.set(m, Math.max(credit.get(m) ?? 0, weight))
      }
    }
    add(movers.secondary, SECONDARY_SET_CREDIT)
    add(movers.primary, 1)          // last, so an overlap keeps FULL credit
    for (const [m, weight] of credit) out[m] = (out[m] ?? 0) + count * weight
  }
  return out
}

/**
 * PHYSICAL working sets in a draft — warm-ups excluded, a unilateral pair
 * counted once. The same rule `draftMuscleSets` counts with, before the
 * primary/secondary credit is applied.
 *
 * Exported so the sheet can print it beside the weighted totals: those numbers
 * sum well above the deck's set count by design, and without the physical
 * figure next to them the sheet reads as a second, disagreeing tally.
 */
export function draftPhysicalSets(draft: SessionDraft | null): number {
  if (!draft) return 0
  let total = 0
  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue
    const seen = new Set<string>()
    for (const s of ex.sets) {
      if (!isSetCommitted(s)) continue
      if (s.pairId) {
        if (seen.has(s.pairId)) continue
        seen.add(s.pairId)
      }
      total += 1
    }
  }
  return total
}
