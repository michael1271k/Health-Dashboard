import { EMBER, OXIDE, DROPSET } from '@/lib/theme/palette'

/**
 * What a set WAS, in one letter — the vocabulary three surfaces share.
 *
 * ── WHY IT IS A LETTER ───────────────────────────────────────────────────────
 * "Warmup" is eight characters on the one row that has no spare width: set
 * number, load × reps, the previous session's set, effort and the tag all share
 * it, and the word pushed the numbers into a wrap on a phone. "Dropset" and
 * "Failure" are seven each — the same overflow. All three are single letters,
 * with the full word in the tooltip and in the weekly export, which is what a
 * coach actually reads.
 *
 * ── WHY IT LIVES HERE RATHER THAN IN A COMPONENT ─────────────────────────────
 * It was declared inside `ExerciseBreakdown`, so the live logger's `SetEditorRow`
 * carried a second copy and `SessionHero` — which needed exactly this to stop
 * its set-count string truncating — could not have one without importing the
 * whole ledger. Three renderings of one fact is how a warm-up ends up ember in
 * the deck and orange in the report.
 *
 * ── AND WHY WARM-UP IS EMBER RATHER THAN GREEN ───────────────────────────────
 * Ember is the documented set-type colour, and emerald already means "committed"
 * in the logger — a green warm-up chip on a green-ticked row says two things at
 * once.
 */
export interface SetTag {
  /** The single character shown in the badge. */
  label: string
  /** The whole word, for `title` and `aria-label`. */
  full: string
  color: string
}

export const SET_TAGS: Record<string, SetTag> = {
  warmup: { label: 'W', full: 'Warm-up', color: EMBER },
  failure: { label: 'F', full: 'Taken to failure', color: OXIDE },
  dropset: { label: 'D', full: 'Drop set', color: DROPSET },
}

/** The tag for a stored `set_type`, or undefined for a plain working set. */
export function setTagFor(setType: string | null | undefined): SetTag | undefined {
  return setType ? SET_TAGS[setType] : undefined
}

/**
 * A session's set composition as counted chips — `2W · 1F · 1D`.
 *
 * Returns only the kinds that actually occurred, in the fixed order above, so
 * the string is stable across sessions and short enough to sit under a headline
 * figure without an ellipsis. An empty array means every set was a plain
 * working set, which needs no annotation at all.
 */
export function setComposition(counts: Partial<Record<keyof typeof SET_TAGS | string, number>>):
Array<SetTag & { count: number }> {
  const out: Array<SetTag & { count: number }> = []
  for (const key of ['warmup', 'failure', 'dropset']) {
    const count = counts[key] ?? 0
    if (count > 0) out.push({ ...SET_TAGS[key], count })
  }
  return out
}
