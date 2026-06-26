/**
 * Epley formula: estimated 1RM from weight and reps.
 * Returns weight as-is for 1 rep. Rounded to 1 decimal place.
 */
export function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}
