import { describe, it, expect } from 'vitest'
import { PROGRAMS } from '@/lib/programs'
import { buildTemplateDraft, withWarmupCardio } from '@/lib/sessions/templateDraft'
import { payloadToTemplate, type TemplateSourceSet } from '@/lib/sessions/routineTemplate'
import { WARMUP_CARDIO } from '@/lib/sessions/seedTemplates'
import type { SessionDraft } from '@/lib/sessions/draft'

/**
 * The Treadmill opener was pushed inside the SEED branch of `buildTemplateDraft`
 * only. That branch runs when a day has no stored `routine_templates` row — so
 * the moment a day had been logged once, the deck returned early through
 * `templateToDraft` and the warm-up silently stopped appearing. Legs B, the most
 * frequently committed day, therefore never opened with it.
 */

const legsB = PROGRAMS.apex51.days.find((d) => d.key === 'legs_b')!

const set = (o: Partial<TemplateSourceSet> & Pick<TemplateSourceSet, 'exerciseName'>): TemplateSourceSet =>
  ({ weightKg: 20, reps: 10, exerciseOrder: 0, ...o })

const STORED = payloadToTemplate([
  set({ exerciseName: 'Romanian Deadlift (Dumbbell)', exerciseOrder: 0, weightKg: 32.5, reps: 10 }),
  set({ exerciseName: 'Hip Thrust (Machine)', exerciseOrder: 1, weightKg: 30, reps: 12 }),
])!

const first = (d: SessionDraft) => d.exercises[0]

describe('buildTemplateDraft — the Treadmill opens every deck', () => {
  it('THE BUG: a day with a stored template still opens with the Treadmill', () => {
    const d = buildTemplateDraft(legsB, '2026-08-15', undefined, STORED)
    expect(first(d).kind).toBe('cardio')
    expect(first(d).name).toBe('Treadmill')
  })

  it('and still opens with it on the seed path', () => {
    const d = buildTemplateDraft(legsB, '2026-08-15')
    expect(first(d).kind).toBe('cardio')
  })

  it('carries the standard 0.37 km / 5 min block, editable in the deck', () => {
    const d = buildTemplateDraft(legsB, '2026-08-15', undefined, STORED)
    expect(first(d).distanceKm).toBe(WARMUP_CARDIO.distanceKm)
    expect(first(d).durationSec).toBe(WARMUP_CARDIO.durationSec)
    expect(first(d).note).toBe(WARMUP_CARDIO.note)
  })

  it('leaves the stored exercise ORDER intact behind it', () => {
    const d = buildTemplateDraft(legsB, '2026-08-15', undefined, STORED)
    expect(d.exercises.slice(1).map((e) => e.name)).toEqual([
      'Romanian Deadlift (Dumbbell)', 'Hip Thrust (Machine)',
    ])
  })

  it('carries no sets — cardio commits to cardio_logs, never workout_sets', () => {
    const d = buildTemplateDraft(legsB, '2026-08-15', undefined, STORED)
    expect(first(d).sets).toEqual([])
  })
})

describe('withWarmupCardio', () => {
  const draft = (exercises: SessionDraft['exercises']): SessionDraft => ({
    clientSessionId: 'x', splitDay: 'lower', date: '2026-08-15', title: 'T', notes: '',
    startedAt: '2026-08-15T09:00:00.000Z', exercises,
  })

  it('does not add a SECOND block to a deck that already has cardio', () => {
    const d = withWarmupCardio(draft([
      { localId: 'a', name: 'Treadmill', kind: 'cardio', sets: [] },
      { localId: 'b', name: 'Leg Press', sets: [] },
    ]))
    expect(d.exercises.filter((e) => e.kind === 'cardio')).toHaveLength(1)
  })

  it('guards on KIND, not name — a deck opening with a bike keeps its choice', () => {
    const d = withWarmupCardio(draft([
      { localId: 'a', name: 'Stationary Bike', kind: 'cardio', sets: [] },
    ]))
    expect(d.exercises).toHaveLength(1)
    expect(first(d).name).toBe('Stationary Bike')
  })

  it('finds cardio anywhere in the deck, not only at the head', () => {
    // A finisher added mid-session lands at the END (see `addCardio`).
    const d = withWarmupCardio(draft([
      { localId: 'a', name: 'Leg Press', sets: [] },
      { localId: 'b', name: 'Treadmill', kind: 'cardio', sets: [] },
    ]))
    expect(d.exercises).toHaveLength(2)
  })

  it('does not mutate or alias the input draft', () => {
    const input = draft([{ localId: 'a', name: 'Leg Press', sets: [] }])
    const out = withWarmupCardio(input)
    expect(out).not.toBe(input)
    expect(input.exercises).toHaveLength(1)
    expect(out.exercises).toHaveLength(2)
  })
})
