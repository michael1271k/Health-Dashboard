/**
 * The arithmetic behind a macro edit: change one figure, and the other three
 * stay a set of numbers that can be true at the same time.
 *
 * The golden source for `HelixCore/Nutrition/MacroMath.swift` — the native
 * `MacroEditSheet` is the caller; this twin exists so `npm run golden` pins
 * the rules and the Swift port replays them case for case.
 *
 * ── THE ONE RULE ─────────────────────────────────────────────────────────────
 * Calories are ALWAYS the Atwater sum of the macros on screen — 4 · protein +
 * 4 · carbohydrate + 9 · fat. Editing a MACRO recomputes the calories; editing
 * the CALORIES moves the macros until they add up. Protein is pinned through a
 * calorie edit; carbohydrate and fat absorb the difference in proportion to the
 * energy they already carry (`c·4 : f·9`). An untracked macro (`null`) is
 * skipped by the ratio and never handed a figure.
 */

import { atwaterKcal } from './levers'

export interface Macros {
  kcal: number
  protein: number | null
  carbs: number | null
  fat: number | null
}

export type MacroEdit =
  | { calories: number }
  | { protein: number }
  | { carbs: number }
  | { fat: number }

export function atwater(m: Macros): number {
  return atwaterKcal(m.protein ?? 0, m.carbs ?? 0, m.fat ?? 0)
}

/** Grams are whole numbers. */
const grams = (v: number): number => Math.max(0, Math.round(v))

export function adjustMacros(current: Macros, edited: MacroEdit): Macros {
  let next = { ...current }
  if ('protein' in edited) next.protein = grams(edited.protein)
  else if ('carbs' in edited) next.carbs = grams(edited.carbs)
  else if ('fat' in edited) next.fat = grams(edited.fat)
  else {
    const target = Math.max(0, Math.round(edited.calories))
    next = absorb(current, target)
    // Nothing tracked can move, so the macros cannot restate the figure.
    // Keep the figure rather than answering with a zero.
    if (current.carbs == null && current.fat == null) {
      next.kcal = target
      return next
    }
  }
  // Every other path ends here: the calories are the macros, restated.
  next.kcal = atwater(next)
  return next
}

/**
 * Move carbohydrate and fat until the day comes to `target` kcal.
 *
 * A loop, not two passes: whole grams cannot always restate a figure in one
 * pass (4 kcal per carbohydrate gram, 9 per fat gram), so the residual is fed
 * back in, at most four rounds. The two-pass version was path-dependent —
 * 327 kcal landed on 324 while 326 landed on 328. This one is idempotent and
 * monotonic, which is what a stepper under a finger needs.
 */
function absorb(current: Macros, target: number): Macros {
  const next = { ...current }
  if (current.carbs == null && current.fat == null) return next
  if (target === atwater(current)) return next

  for (let round = 0; round < 4; round++) {
    const delta = target - atwater(next)
    if (Math.abs(delta) < 1) break

    const carbEnergy = (next.carbs ?? 0) * 4
    const fatEnergy = (next.fat ?? 0) * 9
    const pool = carbEnergy + fatEnergy
    // A macro at zero has no share of a ratio and would be frozen there.
    // Carbohydrate is the buffer — the macro a lever moves first — so it takes
    // the whole difference whenever the ratio cannot speak.
    const carbShare = pool > 0 && (next.carbs ?? 0) > 0 && (next.fat ?? 0) > 0
      ? carbEnergy / pool
      : next.carbs != null ? 1 : 0

    const before = { ...next }
    if (next.carbs != null) next.carbs = grams((next.carbs ?? 0) + delta * carbShare / 4)
    if (next.fat != null) next.fat = grams((next.fat ?? 0) + delta * (1 - carbShare) / 9)
    // Clamped at the floor with nowhere left to go.
    if (next.carbs === before.carbs && next.fat === before.fat) break
  }
  return next
}
