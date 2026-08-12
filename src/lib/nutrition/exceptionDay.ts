/**
 * A day that was ALLOWED to miss its calorie target.
 *
 * A dinner out on week six of a cut is not a lapse in discipline, but the
 * scorer cannot tell the difference: 3 200 kcal against a 1 900 goal is a 68%
 * overshoot, the cut asymmetry multiplies it by 1.5, and a planned evening
 * lands the day's largest score component (nutrition, weight 0.30) somewhere
 * near 18. Repeat that four times in a phase and the score stops describing
 * the phase — it describes your social life.
 *
 * So the deviation is DECLARED rather than inferred, and the declaration
 * changes exactly one thing.
 *
 * ── THE RULE: FORGIVE THE GRADE, NEVER THE ARITHMETIC ────────────────────────
 * An exception day is graded on protein alone (see `computeNutritionScore`).
 * It is NOT excluded from anything that adds numbers up: the week's average
 * intake, the TDEE deficit, and the weight trend all see the real figure,
 * because they describe physics and physics did not get the memo. The scale
 * next Tuesday will not care that the surplus was planned, and an export that
 * quietly dropped the day would hand the model a tidy cut that inexplicably
 * stalled.
 *
 * What is forgiven is the verdict. What happened is never edited.
 *
 * ── NULL MEANS NO EXCEPTION — NOTE THE INVERSION ─────────────────────────────
 * `lib/body/weighIn.ts` is the sibling of this module and looks almost
 * identical, but its default runs the other way: an unrecorded weigh-in skip
 * resolves to "As Planned", because skipping the scale IS the protocol. Here,
 * absence means an ordinary day. Adherence is the norm on a cut, so a day says
 * nothing unless you say something, and there is no default reason to resolve
 * to. Do not copy `weighInSkipReason`'s fallback into this file.
 *
 * Pure leaf, like its sibling: the writer (`ExceptionDayBanner`), the scorer,
 * the adherence readers and the weekly export must agree on one vocabulary and
 * one notion of "flagged", and none of them may hardcode a reason of its own.
 */

/**
 * The offered reasons, in rough order of expected frequency.
 *
 * There is deliberately no "Other"-with-free-text: the reason exists so that a
 * week-old row still explains itself in the export, and five words do that as
 * well as a sentence would. A free-text field would also let the vocabulary
 * drift past what the export knows how to print.
 */
export const NUTRITION_EXCEPTION_REASONS = [
  'Event', 'Refeed', 'Travel', 'Illness', 'Social',
] as const

export type NutritionExceptionReason = (typeof NUTRITION_EXCEPTION_REASONS)[number]

/**
 * The reason stored against a day, or null for an ordinary day.
 *
 * Whitespace-only is absent: a stored `" "` is not a reason, and printing it
 * would produce `[Exception: ]` in the export and a nameless highlight in the
 * UI. Anything non-empty is honoured even if it is not one of the presets —
 * a value written before the list changed must never silently stop counting.
 */
export function exceptionReason(stored: string | null | undefined): string | null {
  return stored?.trim() || null
}

/** Was this day declared an exception? */
export function isExceptionDay(stored: string | null | undefined): boolean {
  return exceptionReason(stored) !== null
}

/**
 * The export's tag for a day, or an empty string for an ordinary one.
 *
 * Returned as a suffix rather than a whole line so the day line keeps its real
 * numbers in front of it — the tag annotates the figures, it does not replace
 * them.
 */
export function exceptionTag(stored: string | null | undefined): string {
  const reason = exceptionReason(stored)
  return reason ? ` [Exception: ${reason}]` : ''
}

/**
 * ── ESTIMATED — THE OTHER AXIS, AND IT FORGIVES NOTHING ──────────────────────
 *
 * "I ate out and could not weigh it" is a statement about CONFIDENCE, not about
 * permission. It is orthogonal to the exception above and the two co-occur
 * constantly: a restaurant birthday is both a declared surplus AND a guess.
 * That is precisely why this is a second column and not a third enum member —
 * an enum would have forced the day to pick one of two true things to say.
 *
 * ── IT HAS NO SCORING COUNTERPART, AND ADDING ONE WOULD BE A BUG ─────────────
 * There is no `isEstimatedDay()` feeding `computeNutritionScore`, no branch in
 * `score.ts`, and no term in adherence, energy balance or any average. An
 * estimate is still your best knowledge of what you ate; grading it more gently
 * would mean the score improves when the measurement gets worse, which is an
 * incentive pointed the wrong way. Uncertainty is reported, never rewarded.
 *
 * So the whole module is one tag function. If a future change gives this flag a
 * numeric consequence anywhere, that change is wrong — see the test in
 * `exception-day.test.ts` that pins the score identical under both values.
 */
export function estimatedTag(estimated: boolean | null | undefined): string {
  return estimated ? ' [Estimated]' : ''
}
