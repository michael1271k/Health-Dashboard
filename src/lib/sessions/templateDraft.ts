/**
 * Program-day template → pre-seeded Command Center draft.
 *
 * Seeding priority, highest first:
 *   1. The exercise's LAST REAL SESSION in the same era — reproduced EXACTLY:
 *      the same NUMBER of sets, each set's weight, reps, and failure tag. If last
 *      time was 2 sets, the deck opens with 2 sets — never the template's 3.
 *   2. The explicit per-set seed (seedTemplates.ts), which also defines cardio
 *      and the deck's structure (used only as a cold-start when there's no history).
 *   3. The program's `wk1Kg` cold start (bodyweight/timed moves seed at 0 kg).
 *
 * This used to read `useExerciseMemory`, which returned ONE set — whichever row
 * was newest by `created_at`, warm-ups included — and fanned that single value
 * across every set slot, ignoring the training era entirely. A deck of three
 * identical made-up rows is exactly the "arbitrary data" problem: the numbers
 * looked plausible but were never what was actually lifted.
 */
import { daySplitEnum, type ProgramDay } from '@/lib/programs'
import type { SessionDraft, DraftExercise, DraftSet } from '@/lib/sessions/draft'
import { SEED_TEMPLATES, WARMUP_CARDIO } from '@/lib/sessions/seedTemplates'

export const HELIX_DAY_KEYS = ['cb_a', 'legs_a', 'arms', 'cb_b', 'legs_b'] as const

/** Last session per exercise NAME — the shape `useExerciseSetHistory` returns. */
export interface ExerciseHistoryEntry {
  date: string
  sets: Array<{ weightKg: number; reps: number; setType?: 'failure' }>
}

/**
 * Reproduce the previous session EXACTLY: same number of sets, each with its
 * own weight, reps, and failure tag. No padding to a template count, no
 * fabricated extra sets — if last time was 2 sets, you get 2 sets.
 */
function seedFromHistory(prev: ExerciseHistoryEntry): DraftSet[] {
  return prev.sets.map((s) => {
    const set: DraftSet = { weightKg: s.weightKg, reps: s.reps }
    if (s.setType === 'failure') set.setType = 'failure'
    return set
  })
}

export function buildTemplateDraft(
  day: ProgramDay,
  date: string,
  history?: ReadonlyMap<string, ExerciseHistoryEntry>,
): SessionDraft {
  const dayKey = (HELIX_DAY_KEYS as readonly string[]).includes(day.key)
    ? (day.key as SessionDraft['dayKey']) : undefined

  let i = 0
  const localId = () => `tpl-${i++}-${Math.random().toString(36).slice(2, 8)}`
  const historyFor = (name: string): ExerciseHistoryEntry | undefined => {
    const h = history?.get(name)
    return h?.sets.length ? h : undefined
  }

  const seed = SEED_TEMPLATES[day.key]
  const exercises: DraftExercise[] = []

  // Every seeded deck opens with the standard Treadmill warm-up.
  exercises.push({
    localId: localId(), name: WARMUP_CARDIO.name, kind: 'cardio',
    distanceKm: WARMUP_CARDIO.distanceKm, durationSec: WARMUP_CARDIO.durationSec,
    note: WARMUP_CARDIO.note, sets: [],
  })

  // A template deck is a PLAN, not a log: every set opens UNCHECKED (done:false)
  // and only the ones you tick green are recorded on finish.
  const unchecked = (sets: DraftSet[]): DraftSet[] => sets.map((s) => ({ ...s, done: false }))

  if (seed) {
    for (const ex of seed.exercises) {
      const prev = historyFor(ex.name)
      const sets = unchecked(prev
        ? seedFromHistory(prev)
        : ex.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })))
      exercises.push({
        localId: localId(), name: ex.name, muscleGroups: ex.muscles, sets,
        seededFrom: prev?.date,
      })
    }
  } else {
    // `day` is phase-resolved (activeProgram) — cut-dropped lifts are already gone.
    for (const ex of day.exercises) {
      const prev = historyFor(ex.name)
      const sets = unchecked(prev
        ? seedFromHistory(prev)
        // Bodyweight / timed moves (wk1Kg null) seed at 0 kg, not a phantom 20 kg.
        : Array.from({ length: ex.sets }, () => ({
          weightKg: ex.wk1Kg ?? 0,
          reps: parseInt(ex.reps, 10) || 10,
        })))
      exercises.push({
        localId: localId(), name: ex.name, muscleGroups: ex.muscles, sets,
        seededFrom: prev?.date,
      })
    }
  }

  return {
    // Stable idempotency key for THIS logging attempt: a retry of the same
    // template deck dedupes instead of duplicating; two separate sessions get
    // distinct ids (random suffix).
    clientSessionId: `tpl-${date}-${day.key}-${Math.random().toString(36).slice(2, 8)}`,
    dayKey,
    splitDay: daySplitEnum(day.key),
    date,
    title: day.sub ? `${day.label} · ${day.sub}` : day.label,
    notes: '',
    // The chosen date + the current wall-clock time (endedAt derives from this
    // + duration at commit, so a back-dated template still gets a sane window).
    startedAt: `${date}T${new Date().toISOString().slice(11)}`,
    exercises,
  }
}
