/**
 * Rep windows read from the ACTIVE PROGRAM, not hardcoded.
 *
 * The double-progression badge used a single global `REP_CEILING = 12`, so Calf
 * Press logged at 15/14/13 "cleared the ceiling" and prompted +2.5 kg — even
 * though its programmed window is 10–15 (Legs A) / 14–18 (Legs B). Every
 * exercise in `programs.ts` already carries its window as a `reps` string; this
 * module is the one place that parses it.
 *
 * The progression rule itself is the program's own (PROGRESSION_RULES):
 *   "Increase load only when ALL work sets hit the ceiling at RPE ≤ 8.5 in TWO
 *    CONSECUTIVE sessions — smallest increment, reps reset to floor."
 */
import { PROGRAMS, getActiveProgramId, DEFAULT_PROGRAM_ID, type ProgramExercise } from '@/lib/programs'
import { canonicalExerciseName } from '@/lib/exercises/aliases'

/** Recommended jump once the ceiling is cleared twice. */
export const LOAD_STEP_KG = 2.5

export interface RepWindow { floor: number; ceiling: number }

/**
 * Parse a program `reps` string into a numeric window.
 * `'8–12'` / `'8-12'` → 8–12 · `'12–20'` → 12–20 · `'10'` → 10–10.
 * Timed holds (`'55s'`) return null — reps are not the progression axis there.
 */
export function parseRepWindow(reps: string): RepWindow | null {
  if (/s\s*$/i.test(reps.trim())) return null          // '55s' — timed, not rep-driven
  const nums = reps.match(/\d+/g)
  if (!nums?.length) return null
  const floor = Number(nums[0])
  const ceiling = Number(nums[nums.length - 1])
  if (!Number.isFinite(floor) || !Number.isFinite(ceiling) || ceiling < floor) return null
  return { floor, ceiling }
}

function normalize(name: string): string {
  return canonicalExerciseName(name).toLowerCase().trim()
}

/**
 * The programmed rep window for an exercise.
 *
 * `dayKey` disambiguates exercises that appear on more than one day with
 * DIFFERENT windows — Calf Press is 10–15 on Legs A and 14–18 on Legs B. When
 * the day is unknown we fall back to the STRICTEST (highest) ceiling across the
 * program, so an ambiguous match can only ever under-trigger the badge, never
 * over-trigger it. Returns null for exercises not in the program (free choices)
 * and for timed holds.
 */
export function repWindowFor(
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): RepWindow | null {
  const program = PROGRAMS[programId] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  const target = normalize(exerciseName)
  const match = (ex: ProgramExercise) => normalize(ex.name) === target

  if (dayKey) {
    const onDay = program.days.find((d) => d.key === dayKey)?.exercises.find(match)
    if (onDay) return parseRepWindow(onDay.reps)
  }

  const windows = program.days
    .flatMap((d) => d.exercises)
    .filter(match)
    .map((ex) => parseRepWindow(ex.reps))
    .filter((w): w is RepWindow => w != null)
  if (!windows.length) return null
  // Strictest = highest ceiling; keep the matching floor.
  return windows.reduce((best, w) => (w.ceiling > best.ceiling ? w : best))
}

export interface WorkingSet { weightKg: number; reps: number }

/**
 * Did this session earn a load increase? Every working set must reach the
 * ceiling AT ONE CONSISTENT LOAD — a session that hit the ceiling only by
 * dropping weight has not outgrown the load.
 */
export function clearedCeiling(sets: WorkingSet[], ceiling: number): boolean {
  if (!sets.length) return false
  if (!sets.every((s) => s.reps >= ceiling)) return false
  if (new Set(sets.map((s) => s.weightKg)).size !== 1) return false
  return sets[0].weightKg > 0
}

export type ProgressionState = 'ready' | 'one-more' | 'no'

export interface ProgressionVerdict {
  state: ProgressionState
  /** The ceiling actually applied (null when the exercise isn't programmed). */
  ceiling: number | null
  /** Suggested new load, only when `state === 'ready'`. */
  suggestKg: number | null
}

/**
 * Double progression across the last TWO sessions, newest LAST.
 *
 *  · both cleared → `ready`   (add load)
 *  · newest cleared, previous did not → `one-more` (one more clean session)
 *  · otherwise → `no`
 */
export function progressionVerdict(
  sessions: WorkingSet[][],
  ceiling: number | null,
): ProgressionVerdict {
  if (ceiling == null || !sessions.length) return { state: 'no', ceiling, suggestKg: null }
  const latest = sessions[sessions.length - 1]
  const previous = sessions.length >= 2 ? sessions[sessions.length - 2] : null
  if (!clearedCeiling(latest, ceiling)) return { state: 'no', ceiling, suggestKg: null }
  if (!previous || !clearedCeiling(previous, ceiling)) {
    return { state: 'one-more', ceiling, suggestKg: null }
  }
  return {
    state: 'ready',
    ceiling,
    suggestKg: Math.round((latest[0].weightKg + LOAD_STEP_KG) * 10) / 10,
  }
}
