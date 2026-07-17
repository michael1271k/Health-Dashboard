/**
 * Parsed Hevy workout → editable Command Center draft. Client-safe, pure.
 * Alias canonicalization, day-key inference (header text beats the weekday
 * schedule), stats mapping, cardio entries, and a synthetic dedupe id —
 * Hevy pastes have no natural session id, so we derive a deterministic one
 * from date + set count + volume to keep double-commits idempotent.
 */
import type { HevyWorkout } from '@/lib/hevy/parse'
import type { SessionDraft, DraftExercise } from '@/lib/sessions/draft'
import { canonicalExerciseName } from '@/lib/exercises/aliases'
import { PROGRAMS, DEFAULT_PROGRAM_ID, daySplitEnum, scheduleDayFor } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'

type DayKey = NonNullable<SessionDraft['dayKey']>

const DAY_KEY_GUESSES: Array<[RegExp, DayKey]> = [
  [/\bupper\s*a\b/i, 'cb_a'],
  [/\bupper\s*b\b/i, 'cb_b'],
  [/\blegs?\s*a\b/i, 'legs_a'],
  [/\blegs?\s*b\b/i, 'legs_b'],
  [/\bdelts?\b|\barms\b/i, 'arms'],
]

/** "upper b, Thursday 16 jul…" → 'cb_b'. Explicit text beats the weekday. */
export function guessDayKey(text: string): DayKey | null {
  for (const [re, key] of DAY_KEY_GUESSES) if (re.test(text)) return key
  return null
}

const isHelixDayKey = (k: string | undefined): k is DayKey =>
  k === 'cb_a' || k === 'legs_a' || k === 'arms' || k === 'cb_b' || k === 'legs_b'

export function hevyWorkoutToDraft(h: HevyWorkout, fallbackDate?: string): SessionDraft {
  const date = h.dateISO ?? fallbackDate ?? logicalTodayISO()
  const headerText = h.header.join(' ')

  const scheduled = scheduleDayFor(date, DEFAULT_PROGRAM_ID)
  const scheduledKey = scheduled !== 'rest' && isHelixDayKey(scheduled.dayKey) ? scheduled.dayKey : undefined
  const dayKey = guessDayKey(headerText) ?? scheduledKey

  const programDay = dayKey ? PROGRAMS[DEFAULT_PROGRAM_ID].days.find((d) => d.key === dayKey) : undefined
  const title = h.title
    ?? (programDay ? (programDay.sub ? `${programDay.label} · ${programDay.sub}` : programDay.label) : undefined)

  const exercises: DraftExercise[] = [
    ...h.exercises.map((ex, i): { position: number; ex: DraftExercise } => ({
      position: ex.position,
      ex: {
        localId: `hv-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: canonicalExerciseName(ex.name),
        rawName: ex.name,
        sets: ex.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps, rpe: s.rpe })),
      },
    })),
    ...h.cardio.map((c, i): { position: number; ex: DraftExercise } => ({
      position: c.position,
      ex: {
        localId: `hv-c${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: canonicalExerciseName(c.name),
        rawName: c.name,
        kind: 'cardio',
        distanceKm: c.distanceKm,
        durationSec: c.durationSec,
        sets: [],
      },
    })),
  ]
    .sort((a, b) => a.position - b.position)
    .map((x) => x.ex)

  const volumeKg = h.stats?.volumeKg
    ?? Math.round(h.exercises.reduce((v, ex) => v + ex.sets.reduce((s, x) => s + x.weightKg * x.reps, 0), 0))

  return {
    clientSessionId: `hevy-${date}-${h.setCount}-${Math.round(volumeKg)}`,
    dayKey,
    splitDay: dayKey ? daySplitEnum(dayKey) : (h.splitGuess ?? 'upper'),
    date,
    title,
    coachInsight: undefined,
    nextSessionFlag: undefined,
    stats: h.stats ? {
      duration_min: h.stats.durationMin ?? null,
      volume_kg: h.stats.volumeKg ?? null,
      sets_completed: h.stats.sets ?? h.setCount,
      prs: h.stats.records ?? null,
      avg_hr_bpm: h.stats.avgBpm ?? null,
      calories_kcal: h.stats.calories ?? null,
      volume_delta_pct_vs_prior: null,
    } : undefined,
    notes: h.notes ?? '',
    startedAt: `${date}T${h.timeHHMM ?? '17:00'}:00.000Z`,
    exercises,
    coachReport: { source: 'hevy', workout: h },
  }
}
