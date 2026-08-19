/**
 * TARGET rest between sets — prescribed by the plan, adjustable by you.
 *
 * ── WHY A TARGET REPLACED THE STOPWATCH ──────────────────────────────────────
 * Helix used to answer "how long should I rest" by measuring: it stamped every
 * set tick, subtracted the two stamps and printed the gap. That number is
 * honest and it is the wrong question. A stopwatch reports what happened; a
 * lifter mid-session wants to know what the plan asks for, and the plan had
 * never carried a rest column at all — so the app measured the one thing it
 * could and left the actual prescription unwritten.
 *
 * Helix 5.1 writes it down. Every exercise on every day of the live plan now
 * carries `restSec` (see `ProgramExercise`), and this module is the one place
 * that resolves it, with the same day-disambiguation `repWindowFor` uses:
 * Calf Press rests 1:30 on Legs A and 1:45 on Legs B, and a lookup that only
 * knew the exercise name would have to pick one and be wrong half the time.
 *
 * ── AND WHY THE OVERRIDES ARE AN EXTERNAL STORE ──────────────────────────────
 * An edit made in the logger must be visible in the routine layout and vice
 * versa, in the same render. A bare module-level object cannot do that: React
 * does not watch plain variables, so the second surface would keep showing the
 * old target until something unrelated re-rendered it — the exact failure
 * `schedule/overrides.ts` documents and fixed with a version counter. So this
 * carries one too, and `useRestTargets()` is the subscription every component
 * reading a target during render must hold.
 *
 * Local-only, deliberately. A rest target is a preference about how you train
 * this block, not a record of training; it costs no DDL and syncs across tabs
 * through the same `storage` event the schedule cache uses.
 */
import { activeProgram, getActiveProgramId, type ProgramExercise } from '@/lib/programs'
import { canonicalExerciseName } from '@/lib/exercises/aliases'

/** The step the ± controls move in, and the grid every stored value snaps to. */
export const REST_STEP_SEC = 15
/** Nothing shorter than a breath, nothing longer than a set-up. */
export const REST_MIN_SEC = 15
export const REST_MAX_SEC = 300

const KEY = 'helix_rest_targets:v1'

type Store = Record<string, number>
let cache: Store | null = null
let version = 0
const listeners = new Set<() => void>()

function emit(): void {
  version += 1
  for (const l of listeners) l()
}

/** Subscribe to rest-target edits. Returns an unsubscribe. */
export function subscribeRestTargets(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Monotonic counter — changes exactly when a target changes. */
export function restTargetsVersion(): number {
  return version
}

function load(): Store {
  if (cache) return cache
  if (typeof window === 'undefined') { cache = {}; return cache }
  try { cache = (JSON.parse(window.localStorage.getItem(KEY) ?? '{}') ?? {}) as Store }
  catch { cache = {} }
  return cache
}

function normalize(name: string): string {
  return canonicalExerciseName(name).toLowerCase().trim()
}

/**
 * The key an override is stored under.
 *
 * It carries the DAY, because the target does: overriding Calf Press on Legs A
 * must not silently move Legs B's. An exercise with no known day gets a
 * day-less key, which is its own bucket rather than a guess at someone else's.
 */
export function restTargetKey(exerciseName: string, dayKey?: string | null, programId?: string): string {
  return `${programId ?? getActiveProgramId()}|${dayKey ?? '-'}|${normalize(exerciseName)}`
}

/** Clamp to the legal range and snap to the 15-second grid. */
export function clampRestSec(sec: number): number {
  const snapped = Math.round(sec / REST_STEP_SEC) * REST_STEP_SEC
  return Math.min(REST_MAX_SEC, Math.max(REST_MIN_SEC, snapped))
}

/**
 * The PLAN's rest target for an exercise, ignoring any override.
 *
 * Same day-disambiguation as `repWindowFor`: the day wins when it is known.
 * With an unknown day we take the LONGEST programmed rest across the plan —
 * an ambiguous match can then only ever prescribe too much rest, which costs
 * time, rather than too little, which costs the set.
 */
export function programRestSec(
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): number | null {
  const program = activeProgram(programId)
  const target = normalize(exerciseName)
  const match = (ex: ProgramExercise) => normalize(ex.name) === target

  if (dayKey) {
    const onDay = program.days.find((d) => d.key === dayKey)?.exercises.find(match)
    if (onDay?.restSec != null) return onDay.restSec
  }
  const all = program.days
    .flatMap((d) => d.exercises)
    .filter(match)
    .map((ex) => ex.restSec)
    .filter((s): s is number => typeof s === 'number')
  return all.length ? Math.max(...all) : null
}

/**
 * The rest target in force: your edit if you made one, else the plan's, else
 * null for a movement the plan says nothing about.
 */
export function restTargetFor(
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): number | null {
  const override = load()[restTargetKey(exerciseName, dayKey, programId)]
  if (typeof override === 'number' && override > 0) return override
  return programRestSec(exerciseName, dayKey, programId)
}

/** Did the user move this one off the plan's number? */
export function hasRestOverride(
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): boolean {
  return typeof load()[restTargetKey(exerciseName, dayKey, programId)] === 'number'
}

/**
 * Store an edit, or `null` to fall back to the plan.
 *
 * Writing the plan's own number stores nothing: an "override" identical to the
 * prescription is not an override, and keeping it would freeze this exercise at
 * today's value the next time the plan's rest times are revised.
 */
export function setRestTarget(
  exerciseName: string,
  sec: number | null,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): void {
  const key = restTargetKey(exerciseName, dayKey, programId)
  const store = load()
  const before = store[key]
  if (sec == null || sec === programRestSec(exerciseName, dayKey, programId)) {
    if (before === undefined) return
    delete store[key]
  } else {
    const next = clampRestSec(sec)
    if (before === next) return
    store[key] = next
  }
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* ignore */ }
  }
  emit()
}

/** "2:00", "1:45", "45s" — how a target reads on a chip. */
export function formatRestTarget(sec: number): string {
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

// Another tab edited a target. `storage` fires only in the OTHER documents,
// which is exactly right: the writing tab has already emitted.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    try { cache = (JSON.parse(e.newValue ?? '{}') ?? {}) as Store }
    catch { cache = {} }
    emit()
  })
}
