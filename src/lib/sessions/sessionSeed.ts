/**
 * The session seed — what a day's deck opens with, and where every number in it
 * came from.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * The phone seeded every row from `ProgramExercise.wk1Kg` — a load chosen in
 * July — and printed `"<wk1Kg>kg × <floor>"` as the Previous column
 * (`LoggerModel.seedRows`). After six months of training that is not a seed, it
 * is a number with the shape of one. The web seeded better but from a different
 * order of sources, so the two clients opened the same day differently.
 *
 * This is the ONE rule, pure, with a golden vector: `session-seed.json`.
 *
 * ── THE TIERS, HIGHEST FIRST ─────────────────────────────────────────────────
 *   1. HISTORY — the newest qualifying session that logged this movement (see
 *      `sessionsForSeed` for what qualifies), reproduced set for set.
 *   2. TEMPLATE — `routine_templates.payload`, the shape of the last deck
 *      committed for this day. It carries no date, so it is a shape and not a
 *      memory: consulted only when history has nothing.
 *   3. PROGRAM — `wk1Kg` at the rep floor. The cold start, and the only tier
 *      reachable by a movement nobody has ever logged.
 *
 * ── AND WHY HISTORY IS MATCHED BY NAME, NEVER BY `exercise_id` ───────────────
 * Web-logged sets carry the catalogue's uuid in `exercise_id`; the phone writes
 * `"helix5-<slug>"` (`LoggerModel.exerciseId`, `ExerciseSlug.id`). The Sept 6
 * Upper A session was logged on the web, so ANY seed that indexes history by id
 * finds zero rows for it and silently falls through to the cold start — which
 * looks exactly like "this movement is new" and is not. The id is resolved to a
 * display name by the caller (`PrRecorder.nameResolver` on the phone, the
 * `exercises` join on the web) and canonicalised in here.
 *
 * Pure and framework-free. THE PHONE reads it (`SessionSeedBuilder`, through
 * `AppDatabase.sessionSeed`); the web still seeds through `templateDraft.ts`,
 * which now follows the same tier ORDER but reproduces the previous session
 * 1:1 rather than fitting it to the program's set count. So this file is the
 * definition and the vector, and on the web it is the specification rather than
 * the code path — see `templateDraft.ts` for exactly where the two differ.
 */
import { activeProgram, eraForDate, type ProgramExercise, type ProgramPhase } from '@/lib/programs'
import { canonicalExerciseName } from '@/lib/exercises/aliases'
import { parseRepWindow } from '@/lib/training/ceilings'
import { isWorkingSet } from '@/lib/training/setTags'
import { resolveSeededRpe, type RpeSeed } from '@/lib/training/rpeMemory'
import type { RoutineTemplate, TemplateExercise } from '@/lib/sessions/routineTemplate'

/** A candidate previous session. One row of `workout_sessions`, narrowed. */
export interface SeedSession {
  id: string
  dayKey: string | null
  /** The session's logical day, ISO. */
  date: string
  /** Any string that sorts chronologically — `started_at` does. */
  startedAt: string
  /**
   * Was this session logged under the maintenance lever?
   *
   * Resolved by the CALLER (`leverForDate` / `Levers.leverForDate`), not in
   * here: the answer depends on `user_goals.active_lever` and
   * `maintenance_until`, which are rows, and a pure rule that reads rows is a
   * rule that cannot be put in a vector.
   */
  maintenance: boolean
}

/** One logged set of a candidate session, already name-resolved. */
export interface SeedSet {
  sessionId: string
  /** The stored display name — canonicalised in here. NEVER an id. */
  exerciseName: string
  /** Performed order within the session (`set_number` / `set_index`). */
  order: number
  weightKg: number
  reps: number
  rpe?: number | null
  setType?: string | null
  side?: string | null
  pairId?: string | null
}

/** A `.ready` progression verdict for one movement on this day. */
export interface SeedProgression {
  /** Display name; canonicalised on the way in, like every other name here. */
  name: string
  /** The load the verdict recommends. Null (a bodyweight `ready`) does nothing. */
  suggestKg: number | null
}

export type SeedSource = 'history' | 'template' | 'program'

export interface SeedRow {
  /** The only two kinds a seed can produce. A failure or a drop set is
   *  something you decide in the moment, never something proposed for you. */
  kind: 'normal' | 'warmup'
  weightKg: number | null
  reps: number | null
  /** The remembered rating, or null when there is none to carry. */
  rpe: number | null
  /** True when a rating was DROPPED because the seeded work is harder — the
   *  "rate this" pip. See `resolveSeededRpe`. */
  rpeStale: boolean
  /** The set this row is seeded from, pre-formatted: `"47kg × 12"`. Null when
   *  nothing was logged, which is the only honest answer for a cold start. */
  previous: string | null
  /** This row carries a progression bump — the chip. */
  progressed: boolean
}

export interface SeedExercise {
  /** Canonical name, as the program spells it. */
  name: string
  source: SeedSource
  /** The date the rows came from; null for the template and program tiers. */
  seededFrom: string | null
  rows: SeedRow[]
}

export interface SessionSeed {
  dayKey: string
  exercises: SeedExercise[]
}

export interface SeedInput {
  dayKey: string
  /** Today, ISO. The era anchor — never a clock read in here. */
  today: string
  phase: ProgramPhase
  sessions: readonly SeedSession[]
  sets: readonly SeedSet[]
  template?: RoutineTemplate | null
  ready?: readonly SeedProgression[]
  programId?: string
}

const canon = (name: string): string => canonicalExerciseName(name).trim().toLowerCase()

/**
 * The sessions a seed — and the progression verdict — may look at, newest first.
 *
 * ── THE THREE FILTERS ────────────────────────────────────────────────────────
 * `day_key` — the rep ceiling and the set count come from the ROUTINE DAY, not
 * from the movement: Leg Press is 8–12 on Legs A and 12–15 on Legs B. Pooling
 * them seeds a three-set day from a two-set one, which is 2026-08-27's blank
 * set 3 (`useExerciseSetHistory`). A session with no `day_key` cannot be
 * attributed to a routine and is dropped, never pooled.
 *
 * `era` — a session from the previous program is not comparable, and a new
 * block must not inherit the old one's loads.
 *
 * `maintenance` — decision 6. A maintenance week is deliberately lighter, so
 * seeding the week after one from it hands you a target below what you were
 * lifting a fortnight ago and calls it Previous. Skipped outright rather than
 * kind-matched: the phone seeds a training day, and the alternative — seed a
 * maintenance week from maintenance weeks — needs a second one to exist before
 * it can answer at all. (The web's `historyFromRows` kind-matches and labels a
 * cross-kind answer; on every deficit week the two rules agree exactly.)
 *
 * `ProgressionQueue` reads the same list, so the verdict and the number it
 * pre-fills can never be about different sessions.
 */
export function sessionsForSeed(
  sessions: readonly SeedSession[],
  dayKey: string,
  today: string,
): SeedSession[] {
  const era = eraForDate(today)
  return sessions
    .filter((s) => s.dayKey === dayKey && !s.maintenance && eraForDate(s.date) === era)
    .slice()
    .sort((a, b) => (
      b.date.localeCompare(a.date)
      || b.startedAt.localeCompare(a.startedAt)
      || a.id.localeCompare(b.id)
    ))
}

/** `"47kg × 12"` — the previous column, as the row prints it. */
export function previousLabel(weightKg: number, reps: number): string {
  return `${formatKg(weightKg)}kg × ${reps}`
}

/** `47`, `49.5`, `13.75` — never `49.50`, never `13.8`. Mirrors `OnyxFormat.kg`. */
function formatKg(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * One session's rows for one movement, pairs collapsed, in performed order.
 *
 * A genuine L/R pair is TWO rows sharing a `pair_id`, and it is ONE set of work
 * at the weaker side — `min(weight) × min(reps)`, the rule `sessionVolumeKg`
 * scores it by, so a set logged split seeds exactly what the same set seeds
 * logged unsided. A lone side, or a bucket that is not exactly one L and one R,
 * is left as the rows it is: inventing a partner for it would be inventing
 * work.
 *
 * ── ONE DIVERGENCE FROM `sessionVolumeKg`, AND IT IS DELIBERATE ──────────────
 * That function's comment says a malformed 3+ bucket is scored "each row as
 * logged", and its code does not: `if (left && right)` takes the fold branch
 * for two Ls and an R, credits `min` of the first pair it finds, and silently
 * drops the third row's tonnage. This requires `bucket.length === 2`, so it
 * does what that comment describes. The two therefore agree on every
 * well-formed pair — which is all the live data has — and differ only on the
 * malformed case both of them warn about. Fixing it there would move stored
 * tonnage and needs its own recompute, so it is reported, not done here.
 *
 * `ghost` rows are dropped — a set deliberately not performed is not evidence.
 */
export function collapsePairs(sets: readonly SeedSet[]): SeedSet[] {
  const sorted = [...sets]
    .filter((s) => s.setType !== 'ghost')
    .sort((a, b) => a.order - b.order)

  const buckets = new Map<string, SeedSet[]>()
  for (const s of sorted) {
    if (pairKey(s)) buckets.set(s.pairId as string, [...(buckets.get(s.pairId as string) ?? []), s])
  }

  const done = new Set<string>()
  const out: SeedSet[] = []
  for (const s of sorted) {
    const id = pairKey(s)
    if (!id) { out.push(s); continue }
    const bucket = buckets.get(id) ?? []
    const left = bucket.find((x) => x.side === 'L')
    const right = bucket.find((x) => x.side === 'R')
    if (bucket.length !== 2 || !left || !right) { out.push(s); continue }
    if (done.has(id)) continue
    done.add(id)
    const weaker = weakerSide(left, right)
    out.push({
      ...s,
      weightKg: Math.min(left.weightKg, right.weightKg),
      reps: Math.min(left.reps, right.reps),
      // The collapsed row is one set, not half of two.
      side: null,
      pairId: null,
      // The set is graded at the weaker side, so that is the rating that
      // describes it.
      rpe: weaker.rpe ?? null,
    })
  }
  return out
}

/** The pair id of a genuine two-sided row — a `pair_id` with no side, or a side
 *  with no `pair_id`, is an ordinary set. */
function pairKey(s: SeedSet): string | null {
  return s.pairId && (s.side === 'L' || s.side === 'R') ? s.pairId : null
}

function weakerSide(left: SeedSet, right: SeedSet): SeedSet {
  if (left.weightKg !== right.weightKg) return left.weightKg < right.weightKg ? left : right
  return left.reps <= right.reps ? left : right
}

/** The RPE seed a source row leaves behind. Warm-ups are never rated. */
function seedOf(s: { weightKg: number; reps: number; rpe?: number | null; setType?: string | null }): RpeSeed | undefined {
  if (s.rpe == null || !Number.isFinite(s.rpe)) return undefined
  if (!isWorkingSet(s.setType)) return undefined
  return { rpe: s.rpe, weightKg: s.weightKg, reps: s.reps }
}

/** A seeded row, with the rating resolved against the numbers it opens on. */
function row(
  kind: 'normal' | 'warmup',
  weightKg: number | null,
  reps: number | null,
  seed: RpeSeed | undefined,
  previous: string | null,
  progressed: boolean,
): SeedRow {
  const resolved = resolveSeededRpe(seed, { weightKg: weightKg ?? 0, reps: reps ?? 0 })
  return {
    kind,
    weightKg,
    reps,
    rpe: resolved.rpe ?? null,
    rpeStale: resolved.stale,
    previous,
    progressed,
  }
}

/**
 * Build one day's seed.
 *
 * The DECK is the program's — its exercises, in its order, at its working-set
 * count for the phase. History supplies the numbers, never the shape: a session
 * where you did four sets instead of three does not silently reprogram the day.
 * (The template does carry order, and on the web it still does — see
 * `templateDraft.ts`. The phone's deck is the program.)
 *
 * `activeProgram(id, phase)` is already phase-resolved: `sets` holds the phase's
 * count and a dropped lift is already gone, so nothing in here re-applies
 * `cutSets`.
 */
export function buildSessionSeed(input: SeedInput): SessionSeed {
  const { dayKey, today, phase, sessions, sets, template = null, ready = [], programId } = input
  const day = activeProgram(programId, phase).days.find((d) => d.key === dayKey)
  if (!day) return { dayKey, exercises: [] }

  const ordered = sessionsForSeed(sessions, dayKey, today)
  const known = new Set(ordered.map((s) => s.id))

  // (session, canonical name) → its rows. Only sessions that qualified.
  const bySession = new Map<string, Map<string, SeedSet[]>>()
  for (const s of sets) {
    if (!known.has(s.sessionId)) continue
    const perSession = bySession.get(s.sessionId) ?? new Map<string, SeedSet[]>()
    const key = canon(s.exerciseName)
    perSession.set(key, [...(perSession.get(key) ?? []), s])
    bySession.set(s.sessionId, perSession)
  }

  const templateByName = new Map((template?.exercises ?? []).map((e) => [canon(e.name), e] as const))
  const readyByName = new Map(ready.map((r) => [canon(r.name), r] as const))

  return {
    dayKey,
    exercises: day.exercises.map((ex) => seedExercise(ex, ordered, bySession, templateByName, readyByName)),
  }
}

function seedExercise(
  ex: ProgramExercise,
  ordered: readonly SeedSession[],
  bySession: Map<string, Map<string, SeedSet[]>>,
  templateByName: Map<string, TemplateExercise>,
  readyByName: Map<string, SeedProgression>,
): SeedExercise {
  const name = canonicalExerciseName(ex.name)
  const key = canon(ex.name)
  const prescribed = ex.sets
  const floor = parseRepWindow(ex.reps)?.floor ?? null
  const bump = readyByName.get(key)?.suggestKg ?? null

  // ── TIER 1: the newest qualifying session that logged THIS movement ────────
  // Newest-first over the whole qualifying list rather than "the last session"
  // alone: a lift you skipped last week has not become a new movement, and
  // falling back to `wk1Kg` for it would say that it had.
  for (const session of ordered) {
    const raw = bySession.get(session.id)?.get(key)
    if (!raw?.length) continue
    const rows = collapsePairs(raw)
    const warmups = rows.filter((s) => s.setType === 'warmup')
    const working = rows.filter((s) => isWorkingSet(s.setType))
    // ── A SESSION WITH NO WORKING SETS IS NOT EVIDENCE ABOUT THE DECK ───────
    // You warmed up and stopped. Committing to the history tier on that would
    // return the warm-up and NOTHING else — `workingRows` has no row to repeat,
    // so it produces none — and the day would open with zero of the sets the
    // program prescribes, having silently refused to fall through to the
    // template or the cold start. Walk back to a session that actually lifted.
    if (!working.length) continue
    return {
      name,
      source: 'history',
      seededFrom: session.date,
      rows: [
        // Warm-ups are carried, in the order they were performed. A warm-up you
        // did last time is a warm-up you will do again, and it is not one of
        // the sets the program counts — `prescribed` is working sets only.
        ...warmups.map((w) => row('warmup', w.weightKg, w.reps, undefined, previousLabel(w.weightKg, w.reps), false)),
        ...workingRows(working, prescribed, floor, bump),
      ],
    }
  }

  // ── TIER 2: the stored template ───────────────────────────────────────────
  const tpl = templateByName.get(key)
  const tplRows = (tpl?.sets ?? [])
    .filter((s) => s.setType !== 'ghost')
    .map((s) => {
      const working = isWorkingSet(s.setType)
      const bumped = bump != null && working
      return row(
        s.setType === 'warmup' ? 'warmup' : 'normal',
        bumped ? bump : s.weightKg,
        bumped ? (floor ?? s.reps) : s.reps,
        seedOf({ weightKg: s.weightKg, reps: s.reps, rpe: s.rpe ?? null, setType: s.setType ?? null }),
        // A template is a shape, not a memory — it carries no date, so there is
        // no session for a Previous column to be about.
        null,
        bumped,
      )
    })
  if (tplRows.length) return { name, source: 'template', seededFrom: null, rows: tplRows }

  // ── TIER 3: the program's cold start ──────────────────────────────────────
  return {
    name,
    source: 'program',
    seededFrom: null,
    rows: Array.from({ length: prescribed }, () => row(
      'normal',
      // ── A MISSING SEED LOAD IS NULL, NOT ZERO ────────────────────────────
      // `wk1Kg` is null for a bodyweight or timed movement, and null there
      // means "the program does not prescribe a load", which is not the same
      // claim as "0 kg". The distinction is load-bearing on the phone: a nil
      // load renders as an empty stepper waiting for a number, while 0 renders
      // as a bodyweight set that has already been decided — and `Epley`,
      // double progression and every "0 kg × 17" label turn on the same
      // difference. Each client coerces at its own boundary (the web's
      // `DraftSet.weightKg` is not nullable, so `templateDraft` writes 0 there).
      bump ?? ex.wk1Kg ?? null,
      floor,
      undefined,
      null,
      bump != null,
    )),
  }
}

/**
 * The working rows, filled by INDEX against the program's count.
 *
 * Short history (you did two sets, the program asks for three) repeats the last
 * known LOAD at the rep FLOOR — the honest proposal for a set with no
 * precedent, and what `addSet` already does in the logger. Long history (you did
 * four, the program asks for three) is truncated: the deck is the plan, and a
 * fourth set is added in the moment, not proposed.
 *
 * A `ready` verdict rewrites every working row to the suggested load at the
 * floor, which is what makes the rating go stale and the chip appear.
 */
function workingRows(
  history: readonly SeedSet[],
  prescribed: number,
  floor: number | null,
  bump: number | null,
): SeedRow[] {
  const out: SeedRow[] = []
  for (let i = 0; i < prescribed; i += 1) {
    const src = history[i] ?? history[history.length - 1]
    if (!src) break
    const carried = i >= history.length
    out.push(row(
      'normal',
      bump ?? src.weightKg,
      // A timed hold has no rep floor to fall back to; repeat what was held.
      bump != null || carried ? (floor ?? src.reps) : src.reps,
      seedOf(src),
      previousLabel(src.weightKg, src.reps),
      bump != null,
    ))
  }
  return out
}
