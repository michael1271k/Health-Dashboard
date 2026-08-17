import { canonicalExerciseName } from '@/lib/exercises/aliases'
import type { ReportTargets, TargetExercise } from '@/lib/reports/fmtV2'

/**
 * Matching a report's exercise name to a catalog exercise.
 *
 * ── THE ALIAS TABLE IS THE ONLY RESOLVER ─────────────────────────────────────
 * A report writes movement names the way a person says them ("seated row",
 * "SA lateral raise"), and the catalog has one canonical row per movement. That
 * mapping already exists in `canonicalExerciseName` and this must never grow a
 * second one: catalog merges are a loud bug and catalog SPLITS are a silent one
 * (Seated Cable Row is two rows by grip on purpose), so a fuzzy matcher that
 * decided two names were "close enough" would quietly re-merge them in the one
 * place nobody looks — a chip on a card.
 *
 * Matching is therefore exact after canonicalisation and case folding, with a
 * single deliberate relaxation: punctuation and repeated whitespace are ignored,
 * because "Incline DB Press" and "Incline DB Press." are the same instruction.
 * Nothing here writes to the catalog.
 */

const fold = (name: string): string =>
  canonicalExerciseName(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The report's instruction for one exercise, or null if it named another. */
export function targetForExercise(
  targets: ReportTargets | null | undefined,
  exerciseName: string | null | undefined,
): TargetExercise | null {
  if (!targets || !exerciseName) return null
  const want = fold(exerciseName)
  if (!want) return null
  return targets.exercises.find((t) => fold(t.name) === want) ?? null
}

/** "49.5 kg × 8–10", "49.5 kg", "×8–10" — whatever the report actually gave. */
export function formatTarget(t: TargetExercise): string | null {
  const load = t.loadKg != null ? `${trimZero(t.loadKg)} kg` : null
  const reps = t.repsLow != null
    ? (t.repsHigh != null && t.repsHigh !== t.repsLow ? `${t.repsLow}–${t.repsHigh}` : `${t.repsLow}`)
    : null
  if (load && reps) return `${load} × ${reps}`
  if (load) return load
  return reps ? `× ${reps}` : null
}

const trimZero = (n: number): string =>
  Number.isInteger(n) ? `${n}` : `${Math.round(n * 100) / 100}`
