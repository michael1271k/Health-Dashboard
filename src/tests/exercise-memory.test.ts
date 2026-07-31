import { describe, it, expect } from 'vitest'
import { PROGRAMS } from '@/lib/programs'
import { buildTemplateDraft, type ExerciseHistoryEntry } from '@/lib/sessions/templateDraft'
import { workingSets, type ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import { routineMemoryMap } from '@/lib/hooks/useLogger'

const legsB = PROGRAMS.apex51.days.find((d) => d.key === 'legs_b')!

/**
 * Routine-scoped memory. The bug: the logger keyed "previous" on the exercise
 * ALONE, so Seated Leg Curl on Legs A and Legs B shared one memory — a 3-set day
 * seeded from a 2-set day and the coach paced you against the wrong session.
 */
describe('workingSets — warm-ups seed but never form a baseline', () => {
  const h: ExerciseHistory = {
    date: '2026-07-31',
    sets: [
      { weightKg: 60, reps: 15, setType: 'warmup' },
      { weightKg: 72.5, reps: 13 },
      { weightKg: 72.5, reps: 12, setType: 'failure' },
    ],
  }

  it('drops warm-ups and keeps everything else', () => {
    expect(workingSets(h)).toEqual([
      { weightKg: 72.5, reps: 13 },
      { weightKg: 72.5, reps: 12, setType: 'failure' },
    ])
  })

  it('keeps the top load honest — a warm-up must not set the PREV chip', () => {
    const top = Math.max(...workingSets(h).map((s) => s.weightKg))
    expect(top).toBe(72.5)
    // …whereas the raw payload would have reported the 60 kg warm-up as a set.
    expect(h.sets.some((s) => s.weightKg === 60)).toBe(true)
  })

  it('survives undefined and a malformed payload without throwing', () => {
    expect(workingSets(undefined)).toEqual([])
    expect(workingSets({ date: 'x', sets: undefined as never })).toEqual([])
  })
})

describe('seedFromHistory reproduces ALL tags, not just failure', () => {
  it('round-trips warmup / failure / dropset into the draft', () => {
    const history = new Map<string, ExerciseHistoryEntry>([
      ['Leg Press Horizontal', {
        date: '2026-07-31',
        sets: [
          { weightKg: 60, reps: 15, setType: 'warmup' },
          { weightKg: 72.5, reps: 13 },
          { weightKg: 72.5, reps: 12, setType: 'failure' },
        ],
      }],
    ])
    const d = buildTemplateDraft(legsB, '2026-08-07', history)
    const press = d.exercises.find((e) => e.name === 'Leg Press Horizontal')!
    expect(press.sets).toEqual([
      { weightKg: 60, reps: 15, setType: 'warmup', done: false },
      { weightKg: 72.5, reps: 13, done: false },
      { weightKg: 72.5, reps: 12, setType: 'failure', done: false },
    ])
    expect(press.seededFrom).toBe('2026-07-31')
  })

  it('reproduces the SET COUNT exactly — 2 sets last time means 2 sets today', () => {
    const history = new Map<string, ExerciseHistoryEntry>([
      ['Seated Leg Curl', { date: '2026-07-31', sets: [{ weightKg: 45, reps: 15 }, { weightKg: 45, reps: 13 }] }],
    ])
    const d = buildTemplateDraft(legsB, '2026-08-07', history)
    const curl = d.exercises.find((e) => e.name === 'Seated Leg Curl')!
    expect(curl.sets).toHaveLength(2)
  })

  it('every seeded set opens UNCHECKED — a template is a plan, not a log', () => {
    const d = buildTemplateDraft(legsB, '2026-08-07')
    for (const ex of d.exercises) for (const s of ex.sets) expect(s.done).toBe(false)
  })
})

describe('routineMemoryMap — the same lift on two days keeps two memories', () => {
  const rows: Array<[string, { weightKg: number; reps: number }]> = [
    ['legs_a|curl-uuid', { weightKg: 40, reps: 12 }],
    ['legs_b|curl-uuid', { weightKg: 45, reps: 15 }],
  ]

  it('keys on `${dayKey}|${exerciseId}`, so the two never collide', () => {
    const m = routineMemoryMap(rows)
    expect(m.get('legs_a|curl-uuid')).toEqual({ weightKg: 40, reps: 12 })
    expect(m.get('legs_b|curl-uuid')).toEqual({ weightKg: 45, reps: 15 })
  })

  it('is JSON-safe: tuples survive the persisted-cache round-trip', () => {
    const restored = JSON.parse(JSON.stringify(rows)) as typeof rows
    expect(routineMemoryMap(restored).get('legs_b|curl-uuid')).toEqual({ weightKg: 45, reps: 15 })
  })

  it('tolerates undefined and a legacy blob where a Map serialized to {}', () => {
    expect(routineMemoryMap(undefined).size).toBe(0)
    const legacy = JSON.parse(JSON.stringify(new Map(rows))) as unknown as typeof rows
    expect(legacy).toEqual({})
    expect(() => routineMemoryMap(legacy)).not.toThrow()
    expect(routineMemoryMap(legacy).size).toBe(0)
  })
})
