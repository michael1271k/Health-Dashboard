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

/**
 * ── AND THE SECOND STORE: ONE SESSION, NOT THE BLOCK ─────────────────────────
 *
 * `KEY` above is the PLAN layer. Its key is `program|day|exercise`, which is a
 * statement about how you train this block — and every reader resolves it at
 * READ TIME. That is fine for the deck (you are training now) and quietly wrong
 * everywhere else: `useWeeklyLoop` prints the rest target for a session by
 * asking this store today, so nudging Calf Press from 1:30 to 1:45 in the
 * logger rewrote what LAST month's export says you rested for. One edit,
 * retroactive across every session of that exercise on that day — the same
 * shape of bug as grading a finished day against today's calorie target.
 *
 * A rest you change mid-workout is almost never a revision of the plan. It is
 * "the gym is busy", "my knee is complaining", "I have twenty minutes" — a fact
 * about TODAY. So it gets a date in the key and a store of its own, and the
 * plan layer is left to the one screen that is actually about the plan (the
 * routine layout, through `RestTargetControl`).
 *
 * ── WHY THE DATE IS THE SESSION ID ───────────────────────────────────────────
 * `save.ts` enforces strictly one session per calendar date, so a date IS a
 * session — and unlike a session id it exists before the commit, which is the
 * whole point: the override is made mid-draft and has to survive being written
 * before the row it belongs to.
 *
 * Local-only, like the plan layer, and for the same reason `useWeeklyLoop`
 * already documents: rest is a target, the export runs client-side, and this
 * needs no column and no migration.
 */
const SESSION_KEY = 'helix_rest_session:v1'

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

let sessionCache: Store | null = null

function readStore(key: string): Store {
  if (typeof window === 'undefined') return {}
  try { return (JSON.parse(window.localStorage.getItem(key) ?? '{}') ?? {}) as Store }
  catch { return {} }
}

function writeStore(key: string, store: Store): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, JSON.stringify(store)) } catch { /* ignore */ }
}

function load(): Store {
  if (cache) return cache
  cache = readStore(KEY)
  return cache
}

function loadSession(): Store {
  if (sessionCache) return sessionCache
  sessionCache = readStore(SESSION_KEY)
  return sessionCache
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
 * The key a SESSION override is stored under — the plan key with a date on it.
 *
 * The date leads, so a future "forget everything before X" sweep is a prefix
 * scan rather than a parse of every key.
 */
export function sessionRestKey(
  dateISO: string,
  exerciseName: string,
  dayKey?: string | null,
  programId?: string,
): string {
  return `${dateISO}|${restTargetKey(exerciseName, dayKey, programId)}`
}

/** This session's own rest target for a movement, or null when it has none. */
export function sessionRestTarget(
  dateISO: string,
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): number | null {
  const v = loadSession()[sessionRestKey(dateISO, exerciseName, dayKey, programId)]
  return typeof v === 'number' && v > 0 ? v : null
}

/** Was this movement's rest changed for this one session? */
export function hasSessionRestOverride(
  dateISO: string,
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): boolean {
  return sessionRestTarget(dateISO, exerciseName, dayKey, programId) != null
}

/**
 * Set (or clear, with `null`) the rest target for ONE session.
 *
 * Never touches the plan store, so the routine template is exactly as it was
 * before the edit — that is the entire distinction this layer exists to draw.
 * Writing the value that was already in force stores nothing: an override
 * identical to what it overrides is not an override, and keeping it would pin
 * this session to today's number if the plan is revised before the export runs.
 */
export function setSessionRestTarget(
  dateISO: string,
  exerciseName: string,
  sec: number | null,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): void {
  const key = sessionRestKey(dateISO, exerciseName, dayKey, programId)
  const store = loadSession()
  const before = store[key]
  // The layer BELOW this one — the plan override if there is one, else the
  // program. Matching it means "no opinion of my own", which is a delete.
  const beneath = planRestTargetFor(exerciseName, dayKey, programId)
  if (sec == null || clampRestSec(sec) === beneath) {
    if (before === undefined) return
    delete store[key]
  } else {
    const next = clampRestSec(sec)
    if (before === next) return
    store[key] = next
  }
  writeStore(SESSION_KEY, store)
  emit()
}

/**
 * The rest target the PLAN is on — your standing edit if you made one, else the
 * program's prescription. Knows nothing about any single session.
 *
 * This is what `restTargetFor` used to be, and it keeps that behaviour under a
 * name that says which layer it is, so the routine-layout screen (the one
 * surface that edits the block) can ask for it explicitly.
 */
export function planRestTargetFor(
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
): number | null {
  const override = load()[restTargetKey(exerciseName, dayKey, programId)]
  if (typeof override === 'number' && override > 0) return override
  return programRestSec(exerciseName, dayKey, programId)
}

/**
 * The rest target in force: this session's own if a date is given and it has
 * one, else the plan's edit, else the program's, else null for a movement the
 * plan says nothing about.
 *
 * ── THE DATE IS OPTIONAL, AND THAT IS THE MIGRATION ──────────────────────────
 * Every existing caller passes three arguments and keeps exactly the behaviour
 * it had. A caller that knows WHICH SESSION it is talking about passes a fourth
 * and gets the honest answer for that session — the deck (the draft's date),
 * the session report (the session's date) and the export (`started_at`). A
 * caller that genuinely means "the plan", like the routine layout, passes none
 * and is right to.
 */
export function restTargetFor(
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
  dateISO?: string | null,
): number | null {
  if (dateISO) {
    const own = sessionRestTarget(dateISO, exerciseName, dayKey, programId)
    if (own != null) return own
  }
  return planRestTargetFor(exerciseName, dayKey, programId)
}

/**
 * Did the user move this one off the plan's number?
 *
 * With a date, it answers about THIS SESSION — which is what the logger's chip
 * needs to know before it marks itself as edited.
 */
export function hasRestOverride(
  exerciseName: string,
  dayKey?: string | null,
  programId: string = getActiveProgramId(),
  dateISO?: string | null,
): boolean {
  if (dateISO && hasSessionRestOverride(dateISO, exerciseName, dayKey, programId)) return true
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
  writeStore(KEY, store)
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
    if (e.key !== KEY && e.key !== SESSION_KEY) return
    let next: Store
    try { next = (JSON.parse(e.newValue ?? '{}') ?? {}) as Store }
    catch { next = {} }
    if (e.key === KEY) cache = next
    else sessionCache = next
    emit()
  })
}
