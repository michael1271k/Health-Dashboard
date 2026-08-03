/**
 * Epley formula: estimated 1RM from weight and reps.
 * Returns weight as-is for 1 rep. Rounded to 1 decimal place.
 *
 * NULL ON UNLOADED WORK. `weight × (1 + reps/30)` is 0 for every bodyweight set,
 * and 0 is not "no estimate" — it is a number, and the app printed it: the
 * session report showed "1RM 0" beside a Reverse Crunch 0 kg × 17, the PR
 * history chart plotted a flat zero series for the movement, and the per-session
 * e1RM trend read 0 → 0 forever, so real rep progress on core work looked like
 * no progress at all. A bodyweight lift has no one-rep max to estimate, so the
 * honest answer is the absence of one and every caller already null-checks.
 *
 * Guards negatives for the same reason: nothing downstream should have to decide
 * what a −12 kg e1RM means.
 */
export function epley1RM(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || weight <= 0) return null
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}
