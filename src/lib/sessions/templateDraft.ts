/**
 * Program-day template → pre-seeded Command Center draft.
 *
 * Seeding priority, highest first:
 *   1. The exercise's LAST REAL SESSION in the same era — set 1 seeds from set 1,
 *      set 2 from set 2, and so on.
 *   2. The explicit per-set seed (seedTemplates.ts), which also defines cardio
 *      and the deck's structure.
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
  sets: Array<{ weightKg: number; reps: number }>
}

/**
 * Fill `count` slots from the previous session's set list. Slot i takes set i;
 * if last time had fewer sets, the remaining slots repeat the final set (the
 * honest read of "you're adding a set at the load you finished on").
 */
function seedFromHistory(prev: ExerciseHistoryEntry, count: number): DraftSet[] {
  return Array.from({ length: count }, (_, i) => {
    const s = prev.sets[i] ?? prev.sets[prev.sets.length - 1]
    return { weightKg: s.weightKg, reps: s.reps }
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

  if (seed) {
    for (const ex of seed.exercises) {
      const prev = historyFor(ex.name)
      const sets = prev
        ? seedFromHistory(prev, ex.sets.length)
        : ex.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps }))
      exercises.push({
        localId: localId(), name: ex.name, muscleGroups: ex.muscles, sets,
        seededFrom: prev?.date,
      })
    }
  } else {
    for (const ex of day.exercises.filter((e) => !e.bulkOnly)) {
      const prev = historyFor(ex.name)
      const sets = prev
        ? seedFromHistory(prev, ex.sets)
        // Bodyweight / timed moves (wk1Kg null) seed at 0 kg, not a phantom 20 kg.
        : Array.from({ length: ex.sets }, () => ({
          weightKg: ex.wk1Kg ?? 0,
          reps: parseInt(ex.reps, 10) || 10,
        }))
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
