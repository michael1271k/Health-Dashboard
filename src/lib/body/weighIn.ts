/**
 * Why a day carries no weigh-in.
 *
 * A blank weight is ambiguous — "not weighed", "weighed and the sync dropped
 * it", or "deliberately not weighed". Only the last one is safe to drop from a
 * trend, so the reason is recorded rather than guessed.
 *
 * THE DEFAULT IS "As Planned", NOT "no reason recorded".
 *
 * The protocol is to skip the scale on any morning the bathroom hasn't happened
 * yet, because a retained-gut reading is noise dressed up as a data point.
 * Skipping is therefore the NORMAL case, and the export used to print
 * "[Skip: no reason recorded]" on every one of them — which reads like a lapse
 * in logging when it is in fact the protocol working. Absence of a stated reason
 * means the routine was followed; anything else is stated explicitly.
 *
 * This module is a pure leaf on purpose: the UI writer (`BodyPanel`) and the
 * reader (`weeklyExport`) must agree on the vocabulary and on the fallback, and
 * the export must never hardcode a reason of its own — change a day to "Travel"
 * and the export says Travel, with no second place to edit.
 */

/** What a weightless day means when nothing else was recorded. */
export const DEFAULT_WEIGH_IN_SKIP_REASON = 'As Planned'

/**
 * The offered reasons, in rough order of frequency. "As Planned" leads because
 * it is both the commonest and the implicit default — a chip row where the
 * default is invisible teaches you the default doesn't exist.
 */
export const WEIGH_IN_SKIP_REASONS = [
  DEFAULT_WEIGH_IN_SKIP_REASON, 'No BM', 'Travel', 'Forgot', 'Fasted', 'Sick',
] as const

export type WeighInSkipReason = (typeof WEIGH_IN_SKIP_REASONS)[number]

/**
 * The reason to DISPLAY for a weightless day: what was stored, or the default.
 *
 * Whitespace-only is treated as absent — a stored `" "` is not a reason, and
 * printing it would produce `[Skip: ]`.
 */
export function weighInSkipReason(stored: string | null | undefined): string {
  return stored?.trim() || DEFAULT_WEIGH_IN_SKIP_REASON
}

/** Is this stored value the default (including "nothing stored at all")? */
export function isDefaultSkipReason(stored: string | null | undefined): boolean {
  return weighInSkipReason(stored) === DEFAULT_WEIGH_IN_SKIP_REASON
}
