/**
 * The stored per-day workout template — `routine_templates.payload`.
 *
 * ── WHY THIS TABLE EXISTS ────────────────────────────────────────────────────
 * There was no editable template. A deck was assembled from two code constants
 * (`programs.ts` for the plan, `seedTemplates.ts` for the per-set shape) plus a
 * query over the last matching session, and nothing the user did in the logger
 * ever wrote back. Two consequences, both reported:
 *
 *   · Reordering exercises mid-session did not survive to the next one. The new
 *     order reached `workout_sets.exercise_order`, but the SEED came from the
 *     constants, which had never heard of it.
 *   · The Settings screen listed `activeProgram().days[].exercises` — the plan
 *     as authored months ago, not the routine as it is actually run.
 *
 * So the template is now a row: written from the EXACT committed deck on every
 * commit and every edit, read back as the first seeding source. What you logged
 * last time is what opens next time, including the order you put it in.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────────
 * Not a log, and never a substitute for one. It holds no date, no session id in
 * the payload, no completion flags — `workout_sessions` + `workout_sets` remain
 * the sole record of what happened. This is the SHAPE of the day, and every set
 * it produces opens unchecked.
 *
 * Pure + framework-free, like `volume.ts`: the server writes it and the client
 * reads it, so neither may reach for React or Supabase from in here.
 */
import type { SessionDraft, DraftExercise, DraftSet } from '@/lib/sessions/draft'
import type { ProgramDay } from '@/lib/programs'
import { daySplitEnum } from '@/lib/programs'
import { canonicalExerciseName } from '@/lib/exercises/aliases'

/**
 * Mirrors `DraftSet`, minus the client-only fields (`done`, `linked`, and the
 * `rpeSeed*` bookkeeping).
 *
 * `rpe` USED TO BE EXCLUDED HERE, and that exclusion was load-bearing in the
 * worst way: a stored template short-circuits history entirely
 * (`templateDraft.ts` PRIORITY 1), so dropping the rating here meant per-set RPE
 * memory would have been dead on the common path — every templated day — while
 * appearing to work on the rare cold-start one.
 */
export interface TemplateSet {
  weightKg: number
  reps: number
  /** Last committed rating for this slot. Seeds the next deck; cleared again the
   *  moment the load or the reps go up. Warm-ups never carry one. */
  rpe?: number
  setType?: 'warmup' | 'failure' | 'dropset'
  /** A unilateral pair is TWO of these sharing `pairId`. Never flattened. */
  side?: 'L' | 'R'
  pairId?: string
}

export interface TemplateExercise {
  name: string
  /** Deck position — this is what makes drag-reorder persist. */
  order: number
  sets: TemplateSet[]
  /** Cardio blocks carry no sets; they hold distance/duration instead. */
  kind?: 'strength' | 'cardio'
  distanceKm?: number
  durationSec?: number
  /** Treadmill gradient, percent — see `DraftExercise.inclinePct`. */
  inclinePct?: number
  note?: string
}

export interface RoutineTemplate {
  /** Bumped only for a breaking payload change; readers tolerate what they know. */
  version: 1
  exercises: TemplateExercise[]
}

export const TEMPLATE_VERSION = 1 as const

/**
 * The committed set, as both `SaveWorkoutInput` and `SaveWorkoutPayload` shape
 * it. Structural on purpose: those two types disagree about how tightly
 * `dayKey` and `setType` are narrowed, and this builder cares about neither.
 */
export interface TemplateSourceSet {
  exerciseName: string
  weightKg: number
  reps: number
  rpe?: number | null
  setType?: string | null
  exerciseOrder?: number | null
  side?: string | null
  pairId?: string | null
}

/** A committed cardio block, as `buildCommitPayload` emits it. */
export interface TemplateSourceCardio {
  name: string
  distanceKm?: number
  durationSec?: number
  inclinePct?: number
  note?: string
  /** Position among ALL deck entries — this is what says warm-up vs finisher. */
  deckOrder?: number
}

const TEMPLATE_TAGS: readonly string[] = ['warmup', 'failure', 'dropset']

/**
 * Build the template from the sets that were just committed.
 *
 * Deliberately fed the COMMIT PAYLOAD rather than the draft: the payload is what
 * actually reached `workout_sets`, already filtered to ticked sets and already
 * renumbered. Building from the draft would let an unchecked row — a set you
 * chose not to do — into next week's template.
 *
 * Returns null when nothing was committed, so a failed or empty session cannot
 * blank a good template.
 */
export function payloadToTemplate(
  sets: readonly TemplateSourceSet[],
  cardio: readonly TemplateSourceCardio[] = [],
): RoutineTemplate | null {
  if (!sets.length) return null

  const byName = new Map<string, TemplateExercise>()
  for (const s of sets) {
    let ex = byName.get(s.exerciseName)
    if (!ex) {
      ex = { name: s.exerciseName, order: s.exerciseOrder ?? byName.size, sets: [] }
      byName.set(s.exerciseName, ex)
    }
    const set: TemplateSet = { weightKg: s.weightKg, reps: s.reps }
    // 'normal' is the absence of a modifier; storing it would make every
    // ordinary set carry a tag the deck then has to strip again. Anything
    // outside the known three is dropped rather than trusted into the payload.
    if (s.setType && TEMPLATE_TAGS.includes(s.setType)) {
      set.setType = s.setType as TemplateSet['setType']
    }
    // A warm-up is never rated, so a rating on one is stale data from some other
    // path — it must not seed next week's deck.
    if (s.rpe != null && Number.isFinite(s.rpe) && set.setType !== 'warmup') set.rpe = s.rpe
    // Only a genuine two-sided row keeps the pair — the same guard every other
    // reader of these two columns applies.
    if (s.pairId && (s.side === 'L' || s.side === 'R')) {
      set.side = s.side
      set.pairId = s.pairId
    }
    ex.sets.push(set)
  }

  const exercises = [...byName.values()].sort((a, b) => a.order - b.order)

  // Cardio slots back in at its real deck position. `exerciseOrder` counts
  // STRENGTH exercises only, so the two orders are not comparable — `deckOrder`
  // is the one number that distinguishes a warm-up from a finisher, and without
  // it every block would re-seed at the top.
  for (const c of [...cardio].sort((a, b) => (a.deckOrder ?? 0) - (b.deckOrder ?? 0))) {
    const at = Math.min(Math.max(c.deckOrder ?? exercises.length, 0), exercises.length)
    exercises.splice(at, 0, {
      name: c.name,
      order: at,
      kind: 'cardio',
      sets: [],
      ...(c.distanceKm != null ? { distanceKm: c.distanceKm } : {}),
      ...(c.durationSec != null ? { durationSec: c.durationSec } : {}),
      ...(c.inclinePct != null ? { inclinePct: c.inclinePct } : {}),
      ...(c.note ? { note: c.note } : {}),
    })
  }

  // Re-index so the stored order is dense 0..n-1 regardless of what the deck
  // happened to emit (a removed exercise leaves a hole in `exerciseOrder`).
  exercises.forEach((e, i) => { e.order = i })
  return { version: TEMPLATE_VERSION, exercises }
}

/** Defensive read: an unknown/garbled payload is treated as absent, never thrown. */
export function parseTemplate(value: unknown): RoutineTemplate | null {
  if (!value || typeof value !== 'object') return null
  const t = value as Partial<RoutineTemplate>
  if (!Array.isArray(t.exercises) || !t.exercises.length) return null
  const exercises = t.exercises
    .filter((e): e is TemplateExercise => !!e && typeof e.name === 'string')
    .map((e) => ({ ...e, sets: Array.isArray(e.sets) ? e.sets : [] }))
  return exercises.length ? { version: TEMPLATE_VERSION, exercises } : null
}

/**
 * Template → a fresh deck for `date`.
 *
 * Every set opens `done: false`: a template is a PLAN. `pairId` is regenerated
 * because the id only has to be unique within the session being logged, and
 * carrying a stored id into every future session makes pairs from different
 * days indistinguishable to anything that groups by it alone.
 */
export function templateToDraft(
  template: RoutineTemplate,
  day: ProgramDay,
  date: string,
  dayKey?: SessionDraft['dayKey'],
): SessionDraft {
  let i = 0
  const localId = () => `tpl-${i++}-${Math.random().toString(36).slice(2, 8)}`
  let p = 0
  const newPairId = () => `pair_${Date.now().toString(36)}_${p++}_${Math.random().toString(36).slice(2, 6)}`

  /**
   * ── THE MUSCLES HAVE TO COME WITH THE EXERCISE ─────────────────────────────
   * A template row stores a name, an order and sets. It does NOT store muscles,
   * and it never should — that is the program's property, not the log's.
   *
   * But this function is the PRIMARY seeding path (`buildTemplateDraft` prefers
   * a stored template over the program the moment one exists, i.e. from the
   * second session of any day onwards), and the drafts it produced carried no
   * `muscleGroups` at all. `resolveMovers` therefore fell back to matching the
   * NAME, and the name table does not know "Barbell Bench Press" or "Overhead
   * Press" — so the muscle distribution went blank for exactly the compound
   * lifts a chest or shoulder day is built on, and the figure showed a session
   * landing nowhere.
   *
   * The program day is already in hand for the split and the title. Reading the
   * muscles off it costs one map and fixes the figure at its source rather than
   * teaching the atlas to guess.
   */
  const byName = new Map<string, string[]>(
    day.exercises.map((e) => [canonicalExerciseName(e.name).toLowerCase(), e.muscles]),
  )
  const muscleGroupsFor = (name: string): string[] | undefined =>
    byName.get(canonicalExerciseName(name).toLowerCase())

  const exercises: DraftExercise[] = [...template.exercises]
    .sort((a, b) => a.order - b.order)
    .map((ex) => {
      if (ex.kind === 'cardio') {
        return {
          localId: localId(), name: ex.name, kind: 'cardio' as const,
          distanceKm: ex.distanceKm, durationSec: ex.durationSec, inclinePct: ex.inclinePct,
          note: ex.note, sets: [],
        }
      }
      const remap = new Map<string, string>()
      const sets: DraftSet[] = ex.sets.map((s) => {
        const set: DraftSet = { weightKg: s.weightKg, reps: s.reps, done: false }
        if (s.setType) set.setType = s.setType
        // Seed the remembered rating together with the numbers it was earned
        // against, so raising the load clears it instead of quietly claiming the
        // heavier set felt the same.
        if (s.rpe != null && s.setType !== 'warmup') {
          set.rpe = s.rpe
          set.rpeSeed = s.rpe
          set.rpeSeedWeightKg = s.weightKg
          set.rpeSeedReps = s.reps
        }
        if (s.pairId && (s.side === 'L' || s.side === 'R')) {
          let pid = remap.get(s.pairId)
          if (!pid) { pid = newPairId(); remap.set(s.pairId, pid) }
          set.pairId = pid
          set.side = s.side
        }
        return set
      })
      return { localId: localId(), name: ex.name, muscleGroups: muscleGroupsFor(ex.name), sets }
    })

  return {
    clientSessionId: `tpl-${date}-${day.key}-${Math.random().toString(36).slice(2, 8)}`,
    dayKey,
    splitDay: daySplitEnum(day.key),
    date,
    title: day.sub ? `${day.label} · ${day.sub}` : day.label,
    notes: '',
    startedAt: `${date}T${new Date().toISOString().slice(11)}`,
    exercises,
  }
}
