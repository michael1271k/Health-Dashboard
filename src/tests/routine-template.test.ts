import { describe, it, expect } from 'vitest'
import { PROGRAMS } from '@/lib/programs'
import {
  payloadToTemplate, templateToDraft, parseTemplate,
  type TemplateSourceSet, type RoutineTemplate,
} from '@/lib/sessions/routineTemplate'
import { countCommittedSets } from '@/lib/sessions/schema'

const cbB = PROGRAMS.apex51.days.find((d) => d.key === 'cb_b')!

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
      set({ exerciseName: 'Chest Press (Machine)', exerciseOrder: 0, weightKg: 40, reps: 11 }),
      set({ exerciseName: 'Chest Press (Machine)', exerciseOrder: 0, weightKg: 40, reps: 10 }),
      set({ exerciseName: 'Preacher Curl (Machine)', exerciseOrder: 5, weightKg: 17.5, reps: 12 }),
    ])!
    expect(t.exercises.map((e) => e.name)).toEqual(['Chest Press (Machine)', 'Preacher Curl (Machine)'])
    expect(t.exercises.map((e) => e.order)).toEqual([0, 1])
    expect(t.exercises[0].sets).toHaveLength(2)
  })

  it('preserves the deck ORDER — this is what makes reordering stick', () => {
    const t = payloadToTemplate([
      set({ exerciseName: 'Preacher Curl (Machine)', exerciseOrder: 0 }),
      set({ exerciseName: 'Chest Press (Machine)', exerciseOrder: 1 }),
    ])!
    expect(t.exercises.map((e) => e.name)).toEqual(['Preacher Curl (Machine)', 'Chest Press (Machine)'])
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
  const template = payloadToTemplate([
    set({ exerciseName: 'Chest Press (Machine)', exerciseOrder: 0, weightKg: 40, reps: 11 }),
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
    expect(d.exercises.map((e) => e.name)).toEqual(['Chest Press (Machine)', 'SA Triceps Pushdown'])
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
