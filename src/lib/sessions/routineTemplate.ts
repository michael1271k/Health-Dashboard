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

/** Mirrors `DraftSet`, minus the client-only fields (`done`, `linked`, `rpe`). */
export interface TemplateSet {
  weightKg: number
  reps: number
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
  setType?: string | null
  exerciseOrder?: number | null
  side?: string | null
  pairId?: string | null
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
export function payloadToTemplate(sets: readonly TemplateSourceSet[]): RoutineTemplate | null {
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
    // Only a genuine two-sided row keeps the pair — the same guard every other
    // reader of these two columns applies.
    if (s.pairId && (s.side === 'L' || s.side === 'R')) {
      set.side = s.side
      set.pairId = s.pairId
    }
    ex.sets.push(set)
  }

  const exercises = [...byName.values()].sort((a, b) => a.order - b.order)
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

  const exercises: DraftExercise[] = [...template.exercises]
    .sort((a, b) => a.order - b.order)
    .map((ex) => {
      if (ex.kind === 'cardio') {
        return {
          localId: localId(), name: ex.name, kind: 'cardio' as const,
          distanceKm: ex.distanceKm, durationSec: ex.durationSec, note: ex.note, sets: [],
        }
      }
      const remap = new Map<string, string>()
      const sets: DraftSet[] = ex.sets.map((s) => {
        const set: DraftSet = { weightKg: s.weightKg, reps: s.reps, done: false }
        if (s.setType) set.setType = s.setType
        if (s.pairId && (s.side === 'L' || s.side === 'R')) {
          let pid = remap.get(s.pairId)
          if (!pid) { pid = newPairId(); remap.set(s.pairId, pid) }
          set.pairId = pid
          set.side = s.side
        }
        return set
      })
      return { localId: localId(), name: ex.name, sets }
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
