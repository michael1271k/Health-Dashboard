/**
 * Movements trained ONE SIDE AT A TIME, so a set is two rows — an L and an R
 * sharing a `pairId`.
 *
 * Sibling of `isTimedExercise` and `isBodyweightExercise`, and matched the same
 * way: by name, because the exercise catalog is a name table with no laterality
 * column.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 * The logger's "Split L / R" button. It used to be gated by a regex spelled
 * inline in `ExerciseCard`:
 *
 *   /single[- ]?arm|one[- ]?arm|single[- ]?leg|per (side|arm)/i
 *
 * — four alternations covering three catalog entries, with no test, no home,
 * and no way to add the movements it misses (a Bulgarian split squat, a lunge,
 * a step-up are all unilateral and none of them say "single arm"). Splitting a
 * BILATERAL set is not a harmless mistake either: the pair is scored at its
 * weaker side for tonnage (`sessionVolumeKg`) and counts as ONE set of work, so
 * a barbell press split in half is logged as half a session.
 *
 * ── WHY "ALTERNATING" IS NOT HERE ────────────────────────────────────────────
 * An alternating curl is performed one arm at a time but logged as one set of N
 * total reps, which is the opposite of what a pair records. The rule is not
 * "does one limb move at a time" — it is "does this set produce two independent
 * loads worth tracking apart".
 */

/**
 * The tell-tales. Anchored loosely (these words are qualifiers, they can sit
 * anywhere in a name) but specifically enough that no bilateral movement in the
 * catalog contains one.
 */
const UNILATERAL_PATTERNS: RegExp[] = [
  // "Single Arm", "Single-Leg", "One Arm", "1-Arm"
  /\b(single|one|1)[-\s]?(arm|armed|leg|legged|side)\b/i,
  /\bunilateral\b/i,
  // Rep strings and free-typed names carry the qualifier as a suffix.
  /\bper\s+(side|arm|leg)\b/i,
  /\b(each|ea)\s+(side|arm|leg)\b/i,
  // Movements that are unilateral by definition and never say so.
  /\bbulgarian\b/i,
  /\bsplit\s+squats?\b/i,
  /\blunges?\b/i,
  /\bstep[-\s]?ups?\b/i,
  /\bpistol\s+squats?\b/i,
  /\bskater\s+squats?\b/i,
  /\bcopenhagen\b/i,
  /\bsuitcase\s+(carry|carries|deadlift)\b/i,
  /\bside\s+planks?\b/i,
]

/**
 * Names that contain a tell-tale but are performed with both limbs together.
 * Checked FIRST, so an explicit "double" always wins over a pattern match.
 */
const BILATERAL_OVERRIDES = /\b(double|two|both|2)[-\s]?(arm|armed|leg|legged|side|sided)\b/i

/** True when a set of this movement is one side at a time. */
export function isUnilateralExercise(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.trim()
  if (!n) return false
  if (BILATERAL_OVERRIDES.test(n)) return false
  return UNILATERAL_PATTERNS.some((re) => re.test(n))
}
