import type { SessionDraft } from '@/lib/sessions/draft'
import { isSetCommitted } from '@/lib/sessions/draft'
import type { ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import { isWorkingSet } from '@/lib/training/setTags'

/**
 * The set you are walking towards, and what it cost you last time.
 *
 * ── WHY THIS IS A PURE FUNCTION AND NOT A HOOK ───────────────────────────────
 * Its only consumer is the Live Activity, which is unrenderable in this
 * environment — no simulator, no Lock Screen, no Dynamic Island. A hook would
 * put the one piece of this feature that CAN be reasoned about behind the one
 * part that cannot be run, so the selection rule lives here where a test can
 * hold it still. The Swift side draws strings; this decides what they say.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * The first set that has not been ticked green, in deck order, skipping cardio
 * blocks and warm-ups. Warm-ups are skipped because the number the card exists
 * to show is a number to BEAT, and a warm-up is not one — the same reason
 * `workingSets` exists.
 *
 * A unilateral pair counts as ONE set and reports the LEFT side's history, which
 * is how the deck already numbers and ticks it.
 *
 * Returns null once every set is done: at that point there is nothing to walk
 * towards, and the card should say so by falling back to the totals rather than
 * naming a set that does not exist.
 */
export interface NextSet {
  exercise: string
  /** Human set number among the exercise's own sets, 1-based. */
  setNumber: number
  /** How many sets this exercise has, so the card can say "of 4". */
  setTotal: number
  /** Last time's load for this set number, or null when there is no history. */
  lastWeightKg: number | null
  lastReps: number | null
  lastRpe: number | null
  /**
   * THIS set's own numbers — what is in the row you are standing in front of,
   * whether it was prefilled from the program or typed just now.
   *
   * The Lock Screen leads with these, not with `last*`. "LAST TIME 115 kg × 10"
   * was the largest thing on the card while the set you were about to do went
   * unnamed — the history is context for a decision, not the decision. Null
   * while a field is still blank; the card draws nothing rather than a zero.
   */
  weightKg: number | null
  reps: number | null
  rpe: number | null
}

export function findNextSet(
  draft: SessionDraft | null,
  history?: Map<string, ExerciseHistory>,
): NextSet | null {
  if (!draft) return null

  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue

    // Human numbering: a warm-up carries no ordinal (the badge shows `W`), and a
    // L/R pair is one set with one tick. Both rules are the deck's, reproduced
    // here rather than inferred from the index, because an index is not a set
    // number the moment either one is in play.
    // `isWorkingSet`, not `!== 'warmup'`: `previousFor` below strips ghosts from
    // LAST session's list, and if the numbering here still counted them this
    // side would call something "Set 3" that the other side had never counted —
    // the card would then quote the wrong historical set the moment either
    // session contained a ghost. Both halves of one comparison have to agree on
    // what a set is.
    let number = 0
    const seenPairs = new Set<string>()
    let total = 0
    for (const s of ex.sets) {
      if (!isWorkingSet(s.setType)) continue
      if (s.pairId) { if (seenPairs.has(s.pairId)) continue; seenPairs.add(s.pairId) }
      total += 1
    }
    if (total === 0) continue

    const counted = new Set<string>()
    for (const s of ex.sets) {
      if (!isWorkingSet(s.setType)) continue
      if (s.pairId) {
        if (counted.has(s.pairId)) continue
        counted.add(s.pairId)
      }
      number += 1
      if (isSetCommitted(s)) continue

      const prev = previousFor(history?.get(ex.name), number)
      return {
        exercise: ex.name,
        setNumber: number,
        setTotal: total,
        lastWeightKg: prev?.weightKg ?? null,
        lastReps: prev?.reps ?? null,
        lastRpe: prev?.rpe ?? null,
        weightKg: s.weightKg ?? null,
        reps: s.reps ?? null,
        rpe: s.rpe ?? null,
      }
    }
  }
  return null
}

/**
 * Last session's Nth working set, or undefined.
 *
 * Warm-ups are stripped on BOTH sides before matching, so "set 2" means the same
 * thing in each — otherwise a session that opened with a warm-up would line
 * today's second working set up against last week's first.
 *
 * Undefined when last time had fewer sets than today does. That is a real and
 * common case (the fourth set you are adding today), and it renders as nothing
 * rather than as the third set's numbers wearing the fourth's label.
 */
function previousFor(h: ExerciseHistory | undefined, setNumber: number) {
  if (!h?.sets) return undefined
  const working = h.sets.filter((s) => isWorkingSet(s.setType))
  // A pair is one set on the history side too — take the first row of each.
  const folded: typeof working = []
  const seen = new Set<string>()
  for (const s of working) {
    if (s.pairId) { if (seen.has(s.pairId)) continue; seen.add(s.pairId) }
    folded.push(s)
  }
  return folded[setNumber - 1]
}

/**
 * "3.75 kg × 16", "16 reps", or "" — the string the Lock Screen draws.
 *
 * Formatted HERE rather than in Swift. `3.75` must not render as `3.8` (quarter
 * plates are real loads) and unloaded work must not print "0 kg ×" (see
 * `unloaded-work-blind-spot`); both rules already exist once in the deck, and a
 * second implementation across a language boundary is a second thing that can
 * disagree with the first.
 */
export function formatLastTime(next: NextSet | null): string {
  if (!next || next.lastReps == null) return ''
  const w = next.lastWeightKg
  if (w == null || w <= 0) return `${next.lastReps} reps`
  const load = w % 1 === 0 ? w.toFixed(0) : (w * 10) % 1 === 0 ? w.toFixed(1) : w.toFixed(2)
  return `${load} kg × ${next.lastReps}`
}

/** "RPE 10", or "" when last time was never rated. */
export function formatLastRpe(next: NextSet | null): string {
  return next?.lastRpe == null ? '' : `RPE ${next.lastRpe}`
}

/**
 * The load on the set you are ON — "32.5 kg × 10", "10 reps", "32.5 kg" or "".
 *
 * Same rounding rule as `formatLastTime`, deliberately: the two sit one line
 * apart on the Lock Screen and on the expanded Island, so a load that renders
 * `3.75` above and `3.8` below would be the clearest possible bug.
 *
 * Partial rows are real and common — a weight is usually typed before the reps
 * — so weight-only and reps-only both have a rendering. Neither prints a zero
 * it does not have.
 */
export function formatLoad(next: NextSet | null): string {
  if (!next) return ''
  const { weightKg: w, reps } = next
  const loaded = w != null && w > 0
  if (!loaded && reps == null) return ''
  if (!loaded) return `${reps} reps`
  const load = w % 1 === 0 ? w.toFixed(0) : (w * 10) % 1 === 0 ? w.toFixed(1) : w.toFixed(2)
  return reps == null ? `${load} kg` : `${load} kg × ${reps}`
}

/** "RPE 8" for the set you are on, or "" while it is unrated. */
export function formatRpe(next: NextSet | null): string {
  return next?.rpe == null ? '' : `RPE ${next.rpe}`
}
