/**
 * How one logged set reads, everywhere. Pure — no React, no clock, no
 * localStorage, so the session report, the live deck, the intel cards and the
 * weekly export all render the same set the same way.
 *
 * THE PROBLEM THIS EXISTS TO FIX. Every surface hand-rolled
 * `${weight}${unit} × ${reps}`, which is right for a loaded lift and nonsense
 * for everything else: a Reverse Crunch read "0kg × 17" and a Side Plank read
 * "0kg × 58". Both state a load that does not exist and bury the number that
 * matters behind it. The rule is not "hide the zero" — it is that an unloaded
 * set's record IS its rep count or its duration, so that is what gets rendered.
 *
 *   loaded          60kg × 12
 *   unloaded reps   17 reps
 *   timed hold      58 sec
 *
 * `timed` decides reps-vs-seconds and comes from `isTimedExercise(name)`.
 * Callers that already know a movement is timed pass it; the weight test alone
 * cannot tell a 58-second plank from 58 crunches.
 */

export interface SetFormatOptions {
  /** Time-based hold — `reps` carries SECONDS. */
  timed?: boolean
  /** Unit suffix for loaded sets. Defaults to `kg` (the storage unit). */
  unit?: string
  /** kg → the reader's unit. Defaults to identity, i.e. raw kg. */
  toDisplay?: (kg: number) => number | null
  /**
   * Long form for unloaded sets: `17 reps` / `58 sec`. Off gives the bare
   * number, for places where a column header already says which it is.
   */
  bare?: boolean
}

/** True when the set carries no external load and reps/seconds are the record. */
export function isUnloadedSet(weightKg: number | null | undefined): boolean {
  return weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0
}

/** One set as text: `60kg × 12` · `17 reps` · `58 sec`. */
export function formatSet(
  weightKg: number | null | undefined,
  reps: number | null | undefined,
  opts: SetFormatOptions = {},
): string {
  const { timed = false, unit = 'kg', toDisplay, bare = false } = opts
  const n = reps ?? 0

  if (timed) return bare ? `${n}s` : `${n} sec`
  if (isUnloadedSet(weightKg)) return bare ? `${n}` : `${n} rep${n === 1 ? '' : 's'}`

  const w = toDisplay ? toDisplay(weightKg as number) : weightKg
  return `${w}${unit} × ${n}`
}

/**
 * The load half only — `60kg`, or the unit-free label for unloaded work.
 * For headers and axis ticks that pair a load with something other than reps.
 */
export function formatLoad(
  weightKg: number | null | undefined,
  opts: Pick<SetFormatOptions, 'unit' | 'toDisplay'> = {},
): string {
  if (isUnloadedSet(weightKg)) return 'bodyweight'
  const { unit = 'kg', toDisplay } = opts
  const w = toDisplay ? toDisplay(weightKg as number) : weightKg
  return `${w}${unit}`
}

/**
 * The rep half only, with its unit word — `12 reps` / `58 sec`.
 * Used where the load is rendered separately (the deck's set editor columns).
 */
export function formatReps(reps: number | null | undefined, timed = false): string {
  const n = reps ?? 0
  return timed ? `${n} sec` : `${n} rep${n === 1 ? '' : 's'}`
}
