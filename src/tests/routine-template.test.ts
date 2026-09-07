import { describe, it, expect } from 'vitest'
import { PROGRAMS, activeProgram } from '@/lib/programs'
import { buildTemplateDraft } from '@/lib/sessions/templateDraft'
import {
  payloadToTemplate, templateToDraft, parseTemplate,
  type TemplateSourceSet, type RoutineTemplate,
} from '@/lib/sessions/routineTemplate'
import { countCommittedSets } from '@/lib/sessions/schema'

const cbB = PROGRAMS.onyx5.days.find((d) => d.key === 'cb_b')!

const set = (o: Partial<TemplateSourceSet> & Pick<TemplateSourceSet, 'exerciseName'>): TemplateSourceSet =>
  ({ weightKg: 20, reps: 10, exerciseOrder: 0, ...o })

/**
 * The template is the SHAPE of a training day, written from the exact deck that
 * was committed. It is what makes drag-reorder persist and what stops the deck
 * re-deriving a worse answer from history every week.
 */
describe('payloadToTemplate — built from what actually reached the database', () => {
  it('groups sets under their exercise and densifies the order', () => {
    // exerciseOrder arrives sparse when an exercise was removed mid-session.
    const t = payloadToTemplate([
      set({ exerciseName: 'Chest Press', exerciseOrder: 0, weightKg: 40, reps: 11 }),
      set({ exerciseName: 'Chest Press', exerciseOrder: 0, weightKg: 40, reps: 10 }),
      set({ exerciseName: 'Preacher Curl', exerciseOrder: 5, weightKg: 17.5, reps: 12 }),
    ])!
    expect(t.exercises.map((e) => e.name)).toEqual(['Chest Press', 'Preacher Curl'])
    expect(t.exercises.map((e) => e.order)).toEqual([0, 1])
    expect(t.exercises[0].sets).toHaveLength(2)
  })

  it('preserves the deck ORDER — this is what makes reordering stick', () => {
    const t = payloadToTemplate([
      set({ exerciseName: 'Preacher Curl', exerciseOrder: 0 }),
      set({ exerciseName: 'Chest Press', exerciseOrder: 1 }),
    ])!
    expect(t.exercises.map((e) => e.name)).toEqual(['Preacher Curl', 'Chest Press'])
  })

  it('keeps a unilateral pair intact', () => {
    const t = payloadToTemplate([
      set({ exerciseName: 'SA Triceps Pushdown', weightKg: 6.25, reps: 15 }),
      set({ exerciseName: 'SA Triceps Pushdown', weightKg: 6.25, reps: 15, side: 'L', pairId: 'p1' }),
      set({ exerciseName: 'SA Triceps Pushdown', weightKg: 6.25, reps: 13, side: 'R', pairId: 'p1', setType: 'failure' }),
    ])!
    const sets = t.exercises[0].sets
    expect(sets).toHaveLength(3)
    expect(countCommittedSets(sets)).toBe(2)
    expect(sets[2].setType).toBe('failure')   // the tag stays on the arm that earned it
  })

  it('drops the "normal" tag and anything it does not recognise', () => {
    const t = payloadToTemplate([
      set({ exerciseName: 'Row', setType: 'normal' }),
      set({ exerciseName: 'Row', setType: 'superset' }),
      set({ exerciseName: 'Row', setType: 'warmup' }),
    ])!
    expect(t.exercises[0].sets.map((s) => s.setType)).toEqual([undefined, undefined, 'warmup'])
  })

  it('ignores a side with no pairId, and a pairId with no side', () => {
    const t = payloadToTemplate([
      set({ exerciseName: 'Row', side: 'L' }),
      set({ exerciseName: 'Row', pairId: 'p1' }),
    ])!
    expect(t.exercises[0].sets.every((s) => s.pairId === undefined && s.side === undefined)).toBe(true)
  })

  it('returns null for an empty commit, so a bad session cannot blank a good template', () => {
    expect(payloadToTemplate([])).toBeNull()
  })
})

describe('templateToDraft — a template is a PLAN, never a log', () => {
  it('carries the program\'s muscles onto every exercise', () => {
    // The template stores a name, an order and sets — never muscles, which are
    // the program's property. But this is the PRIMARY seeding path from the
    // second session of any day onwards, and without them `resolveMovers` falls
    // back to matching the name. The name table does not know "Barbell Bench
    // Press", so the live muscle distribution went blank for exactly the
    // compounds a chest day is built on.
    const template = payloadToTemplate(
      cbB.exercises.slice(0, 2).map((ex, i) => ({
        exerciseName: ex.name, weightKg: 40, reps: 10, exerciseOrder: i,
      })),
      [],
    )!
    const d = templateToDraft(template, cbB, '2026-08-20', 'cb_b')
    for (const ex of d.exercises.filter((e) => e.kind !== 'cardio')) {
      const programmed = cbB.exercises.find((p) => p.name === ex.name)
      if (!programmed) continue
      expect(ex.muscleGroups, `${ex.name} lost its muscles`).toEqual(programmed.muscles)
    }
  })

  const template = payloadToTemplate([
    set({ exerciseName: 'Chest Press', exerciseOrder: 0, weightKg: 40, reps: 11 }),
    set({ exerciseName: 'SA Triceps Pushdown', exerciseOrder: 1, weightKg: 6.25, reps: 15, side: 'L', pairId: 'p1' }),
    set({ exerciseName: 'SA Triceps Pushdown', exerciseOrder: 1, weightKg: 6.25, reps: 13, side: 'R', pairId: 'p1' }),
  ])!

  it('opens every set unchecked', () => {
    const d = templateToDraft(template, cbB, '2026-08-20', 'cb_b')
    for (const ex of d.exercises) for (const s of ex.sets) expect(s.done).toBe(false)
  })

  it('rebuilds the pair as ONE set, not two', () => {
    const d = templateToDraft(template, cbB, '2026-08-20', 'cb_b')
    const push = d.exercises.find((e) => e.name === 'SA Triceps Pushdown')!
    expect(push.sets).toHaveLength(2)
    expect(countCommittedSets(push.sets)).toBe(1)
    expect(push.sets[0].pairId).toBe(push.sets[1].pairId)
  })

  it('regenerates the pairId — a stored id must not brand every future session', () => {
    const a = templateToDraft(template, cbB, '2026-08-20', 'cb_b')
    const b = templateToDraft(template, cbB, '2026-08-27', 'cb_b')
    const idOf = (d: typeof a) => d.exercises.find((e) => e.name === 'SA Triceps Pushdown')!.sets[0].pairId
    expect(idOf(a)).not.toBe('p1')
    expect(idOf(a)).not.toBe(idOf(b))
  })

  it('keeps each side its own numbers — the sides are independent', () => {
    // No `linked` flag exists to mirror them, so an asymmetry logged last week
    // opens as an asymmetry this week.
    const asym = templateToDraft(template, cbB, '2026-08-20', 'cb_b')
      .exercises.find((e) => e.name === 'SA Triceps Pushdown')!
    expect(asym.sets.map((s) => [s.side, s.weightKg, s.reps])).toEqual([
      ['L', 6.25, 15],
      ['R', 6.25, 13],
    ])
  })

  it('carries the order across the round trip', () => {
    const d = templateToDraft(template, cbB, '2026-08-20', 'cb_b')
    expect(d.exercises.map((e) => e.name)).toEqual(['Chest Press', 'SA Triceps Pushdown'])
  })

  it('gives each deck its own clientSessionId', () => {
    const a = templateToDraft(template, cbB, '2026-08-20', 'cb_b')
    const b = templateToDraft(template, cbB, '2026-08-20', 'cb_b')
    expect(a.clientSessionId).not.toBe(b.clientSessionId)
  })
})

describe('parseTemplate — an unreadable payload is ABSENT, never a throw', () => {
  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['no exercises key', { version: 1 }],
    ['an empty exercise list', { version: 1, exercises: [] }],
    ['exercises that are not objects', { version: 1, exercises: [null, 3] }],
  ])('%s → null', (_label, value) => {
    expect(parseTemplate(value)).toBeNull()
  })

  it('tolerates an exercise whose sets array is missing', () => {
    const t = parseTemplate({ version: 1, exercises: [{ name: 'Row', order: 0 }] }) as RoutineTemplate
    expect(t.exercises[0].sets).toEqual([])
  })

  it('round-trips a real payload through JSON, as the jsonb column does', () => {
    const t = payloadToTemplate([set({ exerciseName: 'Row', weightKg: 42.5, reps: 10 })])!
    expect(parseTemplate(JSON.parse(JSON.stringify(t)))).toEqual(t)
  })
})

/**
 * Cardio is a first-class deck entry, so the template has to carry it — and at
 * the right position. `exerciseOrder` counts STRENGTH exercises only (cardio
 * consumes no slot, so a 0 kg junk row never reaches workout_sets), which makes
 * the two orders incomparable; `deckOrder` is the one number that distinguishes
 * a warm-up from a finisher.
 */
describe('cardio blocks keep their place in the template', () => {
  const strength = [
    set({ exerciseName: 'Chest Press', exerciseOrder: 0 }),
    set({ exerciseName: 'Preacher Curl', exerciseOrder: 1 }),
  ]

  it('puts a warm-up first', () => {
    const t = payloadToTemplate(strength, [
      { name: 'Treadmill', distanceKm: 0.4, durationSec: 300, deckOrder: 0 },
    ])!
    expect(t.exercises.map((e) => e.name)).toEqual([
      'Treadmill', 'Chest Press', 'Preacher Curl',
    ])
    expect(t.exercises[0].kind).toBe('cardio')
    expect(t.exercises[0].distanceKm).toBe(0.4)
    expect(t.exercises[0].durationSec).toBe(300)
  })

  it('puts a finisher last', () => {
    const t = payloadToTemplate(strength, [
      { name: 'Treadmill', distanceKm: 2, durationSec: 720, deckOrder: 2 },
    ])!
    expect(t.exercises.map((e) => e.name)).toEqual([
      'Chest Press', 'Preacher Curl', 'Treadmill',
    ])
  })

  it('keeps a warm-up AND a finisher on opposite ends', () => {
    const t = payloadToTemplate(strength, [
      { name: 'Treadmill', distanceKm: 0.4, durationSec: 300, deckOrder: 0 },
      { name: 'Treadmill', distanceKm: 2, durationSec: 720, deckOrder: 3 },
    ])!
    expect(t.exercises.map((e) => e.kind ?? 'strength')).toEqual([
      'cardio', 'strength', 'strength', 'cardio',
    ])
    expect(t.exercises.map((e) => e.order)).toEqual([0, 1, 2, 3])
  })

  it('round-trips a cardio block back into the deck', () => {
    const t = payloadToTemplate(strength, [
      { name: 'Treadmill', distanceKm: 0.4, durationSec: 300, deckOrder: 0 },
    ])!
    const d = templateToDraft(t, cbB, '2026-08-20', 'cb_b')
    const first = d.exercises[0]
    expect(first.kind).toBe('cardio')
    expect(first.distanceKm).toBe(0.4)
    expect(first.durationSec).toBe(300)
    expect(first.sets).toEqual([])   // a cardio block has no sets to tick
  })

  it('survives a missing deckOrder by landing at the end', () => {
    const t = payloadToTemplate(strength, [{ name: 'Treadmill', distanceKm: 1 }])!
    expect(t.exercises[t.exercises.length - 1].name).toBe('Treadmill')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The tier order (P3 E4) — history outranks the template, and the template
// still owns the deck.
// ─────────────────────────────────────────────────────────────────────────────

describe('buildTemplateDraft — history outranks the stored template', () => {
  const day = activeProgram('onyx5', 'cut').days.find((d) => d.key === 'cb_a')!
  const stored: RoutineTemplate = {
    version: 1,
    exercises: [
      { name: 'Face Pull', order: 0, sets: [{ weightKg: 10, reps: 12 }] },
      { name: 'Lat Pulldown', order: 1, sets: [{ weightKg: 40, reps: 10 }, { weightKg: 40, reps: 9 }] },
    ],
  }
  const history = new Map([
    ['Face Pull', { date: '2026-09-06', sets: [{ weightKg: 16.25, reps: 15 }, { weightKg: 16.25, reps: 14 }] }],
  ])

  it('replaces a templated exercise’s sets with what was actually logged', () => {
    const d = buildTemplateDraft(day, '2026-09-13', history, stored)
    const face = d.exercises.find((e) => e.name === 'Face Pull')!
    expect(face.sets.map((s) => [s.weightKg, s.reps])).toEqual([[16.25, 15], [16.25, 14]])
    expect(face.seededFrom).toBe('2026-09-06')
    expect(face.sets.every((s) => s.done === false)).toBe(true)
  })

  it('leaves an exercise history says nothing about on the template’s numbers', () => {
    const d = buildTemplateDraft(day, '2026-09-13', history, stored)
    const lat = d.exercises.find((e) => e.name === 'Lat Pulldown')!
    expect(lat.sets.map((s) => [s.weightKg, s.reps])).toEqual([[40, 10], [40, 9]])
    expect(lat.seededFrom).toBeUndefined()
  })

  it('keeps the template’s deck and its order — the one thing only it carries', () => {
    const d = buildTemplateDraft(day, '2026-09-13', history, stored)
    expect(d.exercises.filter((e) => e.kind !== 'cardio').map((e) => e.name))
      .toEqual(['Face Pull', 'Lat Pulldown'])
  })

  it('still opens the deck with the Treadmill warm-up', () => {
    const d = buildTemplateDraft(day, '2026-09-13', history, stored)
    expect(d.exercises[0].kind).toBe('cardio')
  })
})
