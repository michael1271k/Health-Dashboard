/**
 * How the logger's "Previous" column (and the deck seed) fetches last-time
 * numbers for an exercise:
 *   - 'any'          → the last time you did this lift in ANY routine (default).
 *   - 'same_routine' → the last time you did it in the SAME routine (day_key),
 *     so e.g. an Incline Press on "Upper A" only pulls from previous Upper A days.
 * Mirrored to user_goals.previous_source; read synchronously from localStorage.
 */
export type PreviousSource = 'any' | 'same_routine'

const KEY = 'helix_prev_source'

export function getPreviousSource(): PreviousSource {
  if (typeof window === 'undefined') return 'any'
  return window.localStorage.getItem(KEY) === 'same_routine' ? 'same_routine' : 'any'
}

export function setPreviousSource(v: PreviousSource): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, v)
}
