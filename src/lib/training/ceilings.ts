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
import { activeProgram, getActiveProgramId, type ProgramExercise } from '@/lib/programs'
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
  const program = activeProgram(programId)
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

/**
 * The programmed HOLD target in seconds for a timed movement (`'55s'` → 55), or
 * null when the exercise is rep-driven / not programmed. Same day-disambiguation
 * as {@link repWindowFor}; when the day is unknown we take the LONGEST target so
 * an ambiguous match can only under-trigger the "hold longer" cue.
 */
export function holdTargetFor(
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): number | null {
  const program = activeProgram(programId)
  const target = normalize(exerciseName)
  const match = (ex: ProgramExercise) => normalize(ex.name) === target
  const parseHold = (reps: string): number | null => {
    const m = /(\d+)\s*s\b/i.exec(reps)
    return m ? Number(m[1]) : null
  }
  if (dayKey) {
    const onDay = program.days.find((d) => d.key === dayKey)?.exercises.find(match)
    if (onDay) { const h = parseHold(onDay.reps); if (h != null) return h }
  }
  const holds = program.days
    .flatMap((d) => d.exercises)
    .filter(match)
    .map((ex) => parseHold(ex.reps))
    .filter((h): h is number => h != null)
  return holds.length ? Math.max(...holds) : null
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

/** One load used within an exercise, with the sets performed at it. */
export interface LoadRung {
  weightKg: number
  sets: WorkingSet[]
  /** Every set at THIS load reached the ceiling. */
  cleared: boolean
}

/** Sets grouped by load, lightest first. */
export function loadLadder(sets: WorkingSet[], ceiling: number): LoadRung[] {
  const byLoad = new Map<number, WorkingSet[]>()
  for (const s of sets) {
    const bucket = byLoad.get(s.weightKg) ?? []
    bucket.push(s)
    byLoad.set(s.weightKg, bucket)
  }
  return [...byLoad.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weightKg, rung]) => ({
      weightKg,
      sets: rung,
      cleared: rung.length > 0 && rung.every((s) => s.reps >= ceiling),
    }))
}

export type LadderState =
  /** One load, every set at the ceiling — the clean double-progression case. */
  | 'cleared'
  /** Mixed loads, but the LOWEST load cleared: it retires, the top load is the
   *  new baseline. */
  | 'collapse-ready'
  /** Mixed loads and the lowest load is short — the lighter weight must be
   *  earned before the heavier one can replace it. */
  | 'blocked'
  /** Nothing conclusive yet (no sets, or reps still under the ceiling). */
  | 'incomplete'

export interface LadderVerdict {
  state: LadderState
  /** The load that must clear first — always the LOWEST used. */
  bindingLoadKg: number | null
  /** The heaviest load used; what the exercise progresses toward. */
  topLoadKg: number | null
  ceiling: number
  /** Reps still owed at the binding load (0 when it has cleared). */
  repsOwed: number
}

/**
 * Ceiling verdict for an exercise whose sets may span SEVERAL loads.
 *
 * THE INVARIANT IS ORDER-INDEPENDENT. "20kg × 12 then drop to 18kg" and "start
 * at 18kg then go to 20kg" are the same situation described from two ends, and
 * they must produce the same verdict — otherwise the coach's advice depends on
 * the order you happened to touch the machine in, which is noise.
 *
 * So the rule is about the BINDING RUNG, not about direction:
 *
 *   Among the working sets, the LOWEST load used is binding. The ladder only
 *   collapses upward — retiring the lower load and promoting the higher one to
 *   baseline — when EVERY set at that binding load reached the ceiling.
 *
 * That is what stops a premature "Ceiling Cleared": hitting ceiling reps on a
 * lighter drop set proves nothing about the load you are actually chasing.
 */
export function ladderVerdict(sets: WorkingSet[], ceiling: number): LadderVerdict {
  const working = sets.filter((s) => s.weightKg > 0)
  if (!working.length) {
    return { state: 'incomplete', bindingLoadKg: null, topLoadKg: null, ceiling, repsOwed: 0 }
  }

  const rungs = loadLadder(working, ceiling)
  const binding = rungs[0]
  const top = rungs[rungs.length - 1]
  // Worst set at the binding load — that's what's still owed.
  const worst = Math.min(...binding.sets.map((s) => s.reps))
  const repsOwed = Math.max(0, ceiling - worst)

  const base = { bindingLoadKg: binding.weightKg, topLoadKg: top.weightKg, ceiling, repsOwed }

  if (rungs.length === 1) {
    return { ...base, state: binding.cleared ? 'cleared' : 'incomplete' }
  }
  return { ...base, state: binding.cleared ? 'collapse-ready' : 'blocked' }
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

  /**
   * A session counts as cleared when it is a clean single-load clear OR a
   * legitimate ladder collapse (the binding rung cleared, so the lower load has
   * been outgrown). Without the second case a genuine mid-session load increase
   * broke the two-session chain and the lifter was penalised for progressing.
   */
  const cleared = (sets: WorkingSet[]): boolean => {
    if (clearedCeiling(sets, ceiling)) return true
    return ladderVerdict(sets, ceiling).state === 'collapse-ready'
  }
  /** The load the session actually settles at — the TOP rung after a collapse. */
  const settledLoad = (sets: WorkingSet[]): number => {
    const v = ladderVerdict(sets, ceiling)
    return v.topLoadKg ?? sets[0]?.weightKg ?? 0
  }

  const latest = sessions[sessions.length - 1]
  const previous = sessions.length >= 2 ? sessions[sessions.length - 2] : null
  if (!cleared(latest)) return { state: 'no', ceiling, suggestKg: null }
  if (!previous || !cleared(previous)) {
    return { state: 'one-more', ceiling, suggestKg: null }
  }
  return {
    state: 'ready',
    ceiling,
    suggestKg: Math.round((settledLoad(latest) + LOAD_STEP_KG) * 10) / 10,
  }
}

/**
 * Double progression for a TIMED hold, where `reps` carries SECONDS. Progression
 * is "hold longer", never "add load", so a `ready` verdict suggests no kg. A
 * session clears when every working set met the target hold; two consecutive →
 * ready. `ceiling` echoes the target seconds for the UI to label the cue.
 */
export function timedProgressionVerdict(
  sessions: WorkingSet[][],
  targetSec: number | null,
): ProgressionVerdict {
  if (targetSec == null || !sessions.length) return { state: 'no', ceiling: targetSec, suggestKg: null }
  const cleared = (sets: WorkingSet[]) => sets.length > 0 && sets.every((s) => s.reps >= targetSec)
  const latest = sessions[sessions.length - 1]
  const previous = sessions.length >= 2 ? sessions[sessions.length - 2] : null
  if (!cleared(latest)) return { state: 'no', ceiling: targetSec, suggestKg: null }
  if (!previous || !cleared(previous)) return { state: 'one-more', ceiling: targetSec, suggestKg: null }
  return { state: 'ready', ceiling: targetSec, suggestKg: null }
}
