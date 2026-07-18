/**
 * Time-based movements record a HOLD in seconds, not reps — the deck + Nexus
 * label their "reps" field as "sec". Matched by name (planks, holds, carries).
 */
export function isTimedExercise(name: string | null | undefined): boolean {
  if (!name) return false
  return /\b(plank|hollow\s*hold|hold|dead\s*hang|wall\s*sit|l-?sit|carry)\b/i.test(name)
}
