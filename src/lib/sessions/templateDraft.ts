/**
 * Program-day template → pre-seeded Command Center draft. When an explicit
 * per-set seed exists (seedTemplates.ts) it defines the structure (cardio +
 * per-set numbers); otherwise the program's wk1Kg targets are the cold start.
 * In BOTH cases real history wins: if useExerciseMemory has an exercise, its
 * last logged load overrides the seed numbers — the seed is only the fallback.
 * NOTE: useExerciseMemory is not era-aware — seeded weights can disagree with
 * the deck's era-scoped "Prev" chip (accepted).
 */
import { daySplitEnum, type ProgramDay } from '@/lib/programs'
import type { SessionDraft, DraftExercise } from '@/lib/sessions/draft'
import { SEED_TEMPLATES } from '@/lib/sessions/seedTemplates'

export const HELIX_DAY_KEYS = ['cb_a', 'legs_a', 'arms', 'cb_b', 'legs_b'] as const

export interface ExerciseMemoryEntry { weightKg: number; reps: number }

export function buildTemplateDraft(
  day: ProgramDay,
  date: string,
  exMap?: ReadonlyMap<string, string>,
  memory?: ReadonlyMap<string, ExerciseMemoryEntry>,
): SessionDraft {
  const dayKey = (HELIX_DAY_KEYS as readonly string[]).includes(day.key)
    ? (day.key as SessionDraft['dayKey']) : undefined

  let i = 0
  const localId = () => `tpl-${i++}-${Math.random().toString(36).slice(2, 8)}`
  const memoryFor = (name: string): ExerciseMemoryEntry | undefined => {
    const id = exMap?.get(name)
    return id ? memory?.get(id) : undefined
  }

  const seed = SEED_TEMPLATES[day.key]
  const exercises: DraftExercise[] = []

  if (seed) {
    if (seed.cardio) {
      exercises.push({
        localId: localId(), name: seed.cardio.name, kind: 'cardio',
        distanceKm: seed.cardio.distanceKm, durationSec: seed.cardio.durationSec, sets: [],
      })
    }
    for (const ex of seed.exercises) {
      const prev = memoryFor(ex.name)
      // Memory overrides the fallback numbers (keeping the seed's set count);
      // no history → the exact per-set seed.
      const sets = prev
        ? ex.sets.map(() => ({ weightKg: prev.weightKg, reps: prev.reps }))
        : ex.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps }))
      exercises.push({ localId: localId(), name: ex.name, muscleGroups: ex.muscles, sets })
    }
  } else {
    for (const ex of day.exercises.filter((e) => !e.bulkOnly)) {
      const prev = memoryFor(ex.name)
      // Bodyweight / timed moves (wk1Kg null) seed at 0 kg, not a phantom 20 kg.
      const weightKg = prev?.weightKg ?? ex.wk1Kg ?? 0
      const reps = prev?.reps ?? (parseInt(ex.reps, 10) || 10)
      exercises.push({
        localId: localId(), name: ex.name, muscleGroups: ex.muscles,
        sets: Array.from({ length: ex.sets }, () => ({ weightKg, reps })),
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
