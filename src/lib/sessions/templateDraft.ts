/**
 * Program-day template → pre-seeded Command Center draft, pre-filled with each
 * exercise's previous numbers (Wk1 target as the cold-start fallback). Lifted
 * from the old workout-page "Live Session" seeding so /session can self-seed
 * from a ?template= query param. NOTE: useExerciseMemory is not era-aware —
 * seeded weights can disagree with the deck's era-scoped "Prev" chip (accepted).
 */
import { daySplitEnum, type ProgramDay } from '@/lib/programs'
import type { SessionDraft } from '@/lib/sessions/draft'

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

  const exercises = day.exercises.filter((e) => !e.bulkOnly).map((ex, i) => {
    const id = exMap?.get(ex.name)
    const prev = id ? memory?.get(id) : undefined
    const weightKg = prev?.weightKg ?? ex.wk1Kg ?? 20
    const reps = prev?.reps ?? (parseInt(ex.reps, 10) || 10)
    return {
      localId: `tpl-${i}-${Math.random().toString(36).slice(2, 8)}`,
      name: ex.name,
      muscleGroups: ex.muscles,
      sets: Array.from({ length: ex.sets }, () => ({ weightKg, reps })),
    }
  })

  return {
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
