import { EMBER, OXIDE, DROPSET, MUTED } from '@/lib/theme/palette'

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
  ghost: { label: 'G', full: 'Ghost set — logged, not counted', color: MUTED },
}

/**
 * Sets that are RECORDED but do not count as work.
 *
 * ── WHY GHOST EXISTS BESIDE WARM-UP ──────────────────────────────────────────
 * A warm-up is a set with a job: it precedes the work and its lightness is the
 * point. A GHOST is a set that happened and should not be counted — a rep you
 * restarted, a set on the wrong machine, a technique run, someone else's plates
 * left on the bar. Both are excluded from the same places, and until now the
 * only way to record one was to call it a warm-up, which then dragged the
 * routine's warm-up count and the export's `2W · 1F` composition with it.
 *
 * ── AND WHY ONE PREDICATE RATHER THAN A FOURTH LITERAL EVERYWHERE ────────────
 * "Not a working set" was written as `s.setType !== 'warmup'` in roughly twenty
 * places — the ledger, the coach, progression, the trends, the score, the
 * export, the Live Activity's next-set lookup. Adding a second excluded tag by
 * hand means finding all twenty and getting all twenty right, and the ones that
 * were missed would fail silently and in the worst direction: a ghost set would
 * quietly become a baseline, and the coach would pace you against a set you
 * explicitly said did not count.
 *
 * So the question gets a name. Every one of those sites asks it here now, and a
 * future tag is one line in this function.
 */
export function isWorkingSet(setType: string | null | undefined): boolean {
  return setType !== 'warmup' && setType !== 'ghost'
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
  for (const key of ['warmup', 'failure', 'dropset', 'ghost']) {
    const count = counts[key] ?? 0
    if (count > 0) out.push({ ...SET_TAGS[key], count })
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * SET QUALITY — how it went, as opposed to what it was
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A set's technique, when it was worth recording.
 *
 * ── WHY IT IS A SECOND AXIS AND NOT MORE SET TYPES ───────────────────────────
 * "Warm-up" and "form broke" are not alternatives. A warm-up can be sloppy; a
 * drop set is where form usually goes first. Folding quality into `set_type`
 * would force a choice between two facts that are both true, and would make
 * every existing consumer of `isWorkingSet` — twenty of them — have an opinion
 * about technique, which none of them should.
 *
 * So quality is its own nullable column and changes NO arithmetic anywhere. A
 * momentum-assisted set still counts its tonnage and can still set a record,
 * because it happened. What it changes is what you can find later: "how often
 * does my form break on the third set of rows" is a question the app could not
 * previously be asked.
 *
 * ── WHY NULL IS "CLEAN" ──────────────────────────────────────────────────────
 * Storing a default would make every set ever logged carry a claim about its
 * form that nobody made — 2,190 historical rows asserting they were clean when
 * the question was never put. Absence means "not reported", which is the truth.
 * Same rule as `weighin_skip_reason`, resolved on read.
 *
 * ── AND WHY A CLOSED VOCABULARY ──────────────────────────────────────────────
 * Free text cannot be counted, and counting is the entire point. A note saying
 * "swung the last few" and one saying "used a bit of body english" are the same
 * observation and would never group. Six values, chosen to be mutually
 * exclusive in practice: the DB CHECK constraint holds the same six.
 */
export interface SetQuality {
  /** Shown on the row, under the numbers. Kept to two words. */
  label: string
  /** The whole sentence, for `title` and the sheet's hint line. */
  full: string
}

export const SET_QUALITY: Record<string, SetQuality> = {
  momentum: {
    label: 'Momentum',
    full: 'Used body English to move the load',
  },
  partial_rom: {
    label: 'Short ROM',
    full: 'Cut the range short to finish the set',
  },
  form_breakdown: {
    label: 'Form broke',
    full: 'The last reps lost position',
  },
  needed_warmup: {
    label: 'Cold',
    full: 'The first reps were poor — needed a longer warm-up',
  },
  assisted: {
    label: 'Assisted',
    full: 'A spotter or the other arm helped',
  },
  cut_short: {
    label: 'Cut short',
    full: 'Stopped before the target for a reason other than failure',
  },
}

/** Render order — worst-to-mildest is meaningless here, so it is fixed and
 *  matches the DB CHECK, which is the list a reader can verify against. */
export const SET_QUALITY_KEYS = [
  'momentum', 'partial_rom', 'form_breakdown', 'needed_warmup', 'assisted', 'cut_short',
] as const

export type SetQualityKey = typeof SET_QUALITY_KEYS[number]

/** The quality for a stored value, or undefined for a clean (null) set. */
export function setQualityFor(quality: string | null | undefined): SetQuality | undefined {
  return quality ? SET_QUALITY[quality] : undefined
}

/** Guards a value arriving from the DB or a draft before it is written back. */
export function isSetQuality(v: string | null | undefined): v is SetQualityKey {
  return v != null && (SET_QUALITY_KEYS as readonly string[]).includes(v)
}
