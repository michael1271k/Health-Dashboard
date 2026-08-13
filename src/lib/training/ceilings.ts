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
/**
 * The sets that count as WORK for a ceiling verdict.
 *
 * The `weightKg > 0` filter exists to drop rows carrying no load on an exercise
 * that HAS one (unfilled placeholders, a machine logged empty). Applied
 * unconditionally it also deleted every set of every exercise that is unloaded
 * by nature — Reverse Crunch, Hanging Knee Raise — so `working` came back empty
 * and double progression silently never fired on core work at all. Nothing was
 * wrong on screen; the cue simply never appeared.
 *
 * So the filter is conditional: strip the zero rows only when some set in the
 * exercise actually carried load. For loaded lifts this is byte-identical to the
 * old behaviour; for bodyweight work every set is a working set at one load (0),
 * which is exactly the single-rung case the ladder already handles.
 */
export function workLoads(sets: WorkingSet[]): WorkingSet[] {
  return sets.some((s) => s.weightKg > 0) ? sets.filter((s) => s.weightKg > 0) : sets
}

export function ladderVerdict(sets: WorkingSet[], ceiling: number): LadderVerdict {
  const working = workLoads(sets)
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

/**
 * The TOP RUNG's own verdict: at least two sets at the heaviest load, every one
 * of them at the ceiling. Lighter rungs are ignored.
 *
 * This answers the MIXED-LOAD question — "is the weight I am chasing actually
 * being handled?" — which is the only question `levelUpCue` can act on, because
 * a level-up cue exists precisely when there are two loads to talk about.
 * `topLoadCleared` cannot answer it: it now refuses every mixed-load session by
 * construction, so routing `levelUpCue` through it would return null for the one
 * input shape that produces a cue.
 *
 * Private on purpose. It is a rung-local fact, not a progression verdict, and
 * exporting it invites exactly the confusion between the two that this split
 * exists to prevent.
 */
function topRungCleared(sets: WorkingSet[], ceiling: number): boolean {
  const working = workLoads(sets)
  if (!working.length) return false
  const top = Math.max(...working.map((s) => s.weightKg))
  const atTop = working.filter((s) => s.weightKg === top)
  return atTop.length >= 2 && atTop.every((s) => s.reps >= ceiling)
}

/**
 * Did the session earn a progression?
 *
 * The rule: **ONE load across every working set, at least two sets of it, and
 * every one of them at the ceiling.**
 *
 * This was briefly "at least two sets at the ceiling", on the reasoning that one
 * fatigued closing set shouldn't block progression forever. It produced exactly
 * the false positives it was meant to avoid:
 *
 *   Leg Press  2026-07-20  72.5×12, 72.5×12, 72.5×11 (to failure) → "cleared"
 *   Lat Pulldown 2026-07-19  47×12, 47×12, 47×9 (to failure)      → "cleared"
 *
 * Both sessions ENDED with the lifter unable to hold the ceiling at that load —
 * which is the plainest possible evidence the load is not consolidated. Two
 * sessions of that in a row read as "ready to progress", and they were not. The
 * program's own wording is unambiguous ("increase load only when ALL work sets
 * hit the ceiling"), so that is the rule again.
 *
 * IT NOW ALSO REQUIRES A CONSTANT LOAD. Ignoring the lighter rungs was not
 * enough: `35×12, 35×12, 30×12` cleared on the strength of the two 35s, but the
 * session ended with the weight coming DOWN. Fading to a lighter load is the
 * same evidence as fading on reps — the load was not consolidated — and calling
 * it a completed progression overstates what happened. A mixed-load session that
 * is genuinely going well gets `levelUpCue` instead, which says the useful thing:
 * bring the light sets up to the load you are already handling.
 *
 * One thing it still does NOT require: a specific set COUNT beyond two. Two sets
 * is the floor for a capability; the programme decides the rest.
 */
export function topLoadCleared(sets: WorkingSet[], ceiling: number): boolean {
  const working = workLoads(sets)
  // One set is not a capability, and a lone set is trivially "one load".
  if (working.length < 2) return false
  if (new Set(working.map((s) => s.weightKg)).size !== 1) return false
  return working.every((s) => s.reps >= ceiling)
}

/**
 * Mixed loads where the top rung is doing the work but a lighter rung is not.
 *
 * The correct next move here is NOT to add weight — it is to bring the light
 * sets up to the load you are already handling, at the bottom of the rep window
 * (the floor is what a new load should be earned at). Returns null when there
 * is only one load, or when the light load has already caught up.
 */
export interface LevelUpCue {
  fromKg: number
  toKg: number
  /** Rep target at the new load — the window FLOOR. */
  atReps: number
}

export function levelUpCue(sets: WorkingSet[], window: RepWindow): LevelUpCue | null {
  const working = sets.filter((s) => s.weightKg > 0)
  if (!working.length) return null
  const loads = [...new Set(working.map((s) => s.weightKg))].sort((a, b) => a - b)
  if (loads.length < 2) return null
  const lightest = loads[0]
  const top = loads[loads.length - 1]
  // Only worth saying once the top load is actually being handled well. This is
  // deliberately `topRungCleared`, not `topLoadCleared` — every input that can
  // produce a cue spans two loads, which `topLoadCleared` now rejects outright.
  if (!topRungCleared(working, window.ceiling)) return null
  return { fromKg: lightest, toKg: top, atReps: window.floor }
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
 *
 * "Cleared" is `topLoadCleared`: two sets at the ceiling on the heaviest load.
 *
 * A ladder COLLAPSE no longer counts as cleared. It used to, on the reasoning
 * that a mid-session load increase shouldn't break the chain — but the effect
 * was that any session touching a lighter load could satisfy the gate, which is
 * exactly how "Ready to progress" kept appearing on lifts that were nowhere
 * near ready. Mixed loads get `levelUpCue` instead: bring the light sets up to
 * the load you are already handling. Adding weight on top of a load you have
 * not consolidated is the wrong move regardless of what the lighter sets did.
 */
export function progressionVerdict(
  sessions: WorkingSet[][],
  ceiling: number | null,
): ProgressionVerdict {
  if (ceiling == null || !sessions.length) return { state: 'no', ceiling, suggestKg: null }

  const cleared = (sets: WorkingSet[]): boolean => topLoadCleared(sets, ceiling)
  /** Progression is measured from the load actually being handled. */
  const topLoad = (sets: WorkingSet[]): number => {
    const working = sets.filter((s) => s.weightKg > 0)
    return working.length ? Math.max(...working.map((s) => s.weightKg)) : 0
  }

  const latest = sessions[sessions.length - 1]
  const previous = sessions.length >= 2 ? sessions[sessions.length - 2] : null
  if (!cleared(latest)) return { state: 'no', ceiling, suggestKg: null }
  if (!previous || !cleared(previous)) {
    return { state: 'one-more', ceiling, suggestKg: null }
  }
  // A bodyweight movement has no load to add — a `ready` verdict there means
  // "extend past the rep ceiling", and suggesting 2.5 kg (0 + one step) would be
  // an instruction you cannot follow on a Hanging Knee Raise.
  const top = topLoad(latest)
  return {
    state: 'ready',
    ceiling,
    suggestKg: top > 0 ? Math.round((top + LOAD_STEP_KG) * 10) / 10 : null,
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
