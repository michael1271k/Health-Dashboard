import { describe, it, expect } from 'vitest'
import {
  buildSessionSeed, sessionsForSeed, collapsePairs, previousLabel,
  type SeedSession, type SeedSet,
} from '@/lib/sessions/sessionSeed'
import type { RoutineTemplate } from '@/lib/sessions/routineTemplate'

const ONYX5 = 'onyx5'
const TODAY = '2026-09-13'

const session = (over: Partial<SeedSession> & { id: string; date: string }): SeedSession => ({
  dayKey: 'cb_a', startedAt: `${over.date}T09:00:00Z`, maintenance: false, ...over,
})

let n = 0
const set = (over: Partial<SeedSet> & { sessionId: string; exerciseName: string }): SeedSet => ({
  order: (n += 1), weightKg: 40, reps: 10, ...over,
})

const seed = (over: Partial<Parameters<typeof buildSessionSeed>[0]> = {}) => buildSessionSeed({
  dayKey: 'cb_a', today: TODAY, phase: 'cut', programId: ONYX5,
  sessions: [], sets: [], ...over,
})

const exercise = (s: ReturnType<typeof seed>, name: string) =>
  s.exercises.find((e) => e.name === name)!

describe('sessionsForSeed — what a seed is allowed to look at', () => {
  const pool: SeedSession[] = [
    session({ id: 'a', date: '2026-09-06' }),
    session({ id: 'b', date: '2026-08-30' }),
    session({ id: 'other-day', date: '2026-09-05', dayKey: 'legs_a' }),
    session({ id: 'no-day', date: '2026-09-04', dayKey: null }),
    session({ id: 'ppl', date: '2026-06-01' }),
    session({ id: 'maint', date: '2026-09-02', maintenance: true }),
  ]

  it('keeps only this day key, this era, and non-maintenance sessions', () => {
    expect(sessionsForSeed(pool, 'cb_a', TODAY).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('orders newest first, breaking a same-day tie on started_at then id', () => {
    const sameDay: SeedSession[] = [
      session({ id: 'z', date: '2026-09-06', startedAt: '2026-09-06T08:00:00Z' }),
      session({ id: 'y', date: '2026-09-06', startedAt: '2026-09-06T18:00:00Z' }),
      session({ id: 'x', date: '2026-09-06', startedAt: '2026-09-06T18:00:00Z' }),
    ]
    expect(sessionsForSeed(sameDay, 'cb_a', TODAY).map((s) => s.id)).toEqual(['x', 'y', 'z'])
  })
})

describe('collapsePairs — an L/R pair is one set at the weaker side', () => {
  it('folds two sided rows into one, min weight × min reps, in the first side’s slot', () => {
    const rows = collapsePairs([
      set({ sessionId: 's', exerciseName: 'X', order: 1, weightKg: 10, reps: 12 }),
      set({ sessionId: 's', exerciseName: 'X', order: 2, weightKg: 7.5, reps: 14, side: 'L', pairId: 'p1' }),
      set({ sessionId: 's', exerciseName: 'X', order: 3, weightKg: 7.5, reps: 12, side: 'R', pairId: 'p1' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[1].weightKg).toBe(7.5)
    expect(rows[1].reps).toBe(12)
    expect(rows[1].pairId).toBeNull()
  })

  it('leaves a lone side as the row it is', () => {
    const rows = collapsePairs([
      set({ sessionId: 's', exerciseName: 'X', order: 1, weightKg: 5, reps: 15, side: 'L', pairId: 'p1' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].pairId).toBe('p1')
  })

  it('drops ghosts', () => {
    const rows = collapsePairs([
      set({ sessionId: 's', exerciseName: 'X', order: 1, setType: 'ghost' }),
      set({ sessionId: 's', exerciseName: 'X', order: 2 }),
    ])
    expect(rows).toHaveLength(1)
  })
})

describe('buildSessionSeed — the tiers', () => {
  it('opens Upper A with the program’s 18 working sets', () => {
    const s = seed()
    expect(s.exercises.flatMap((e) => e.rows).filter((r) => r.kind === 'normal')).toHaveLength(18)
  })

  it('cold-starts from wk1Kg at the rep floor when nothing was ever logged', () => {
    const face = exercise(seed(), 'Face Pull')
    expect(face.source).toBe('program')
    expect(face.rows.map((r) => [r.weightKg, r.reps])).toEqual([[13.75, 12], [13.75, 12], [13.75, 12]])
    expect(face.rows.every((r) => r.previous === null)).toBe(true)
  })

  it('seeds from history matched by NAME, not by exercise id', () => {
    // A web-logged session: the caller resolved a catalogue uuid to this name.
    const sessions = [session({ id: 'web', date: '2026-09-06' })]
    const sets: SeedSet[] = [
      set({ sessionId: 'web', exerciseName: 'Face Pull', order: 1, weightKg: 16.25, reps: 15 }),
      set({ sessionId: 'web', exerciseName: 'Face Pull', order: 2, weightKg: 16.25, reps: 14 }),
      set({ sessionId: 'web', exerciseName: 'Face Pull', order: 3, weightKg: 16.25, reps: 13 }),
    ]
    const face = exercise(seed({ sessions, sets }), 'Face Pull')
    expect(face.source).toBe('history')
    expect(face.seededFrom).toBe('2026-09-06')
    expect(face.rows.map((r) => r.reps)).toEqual([15, 14, 13])
    expect(face.rows[0].previous).toBe('16.25kg × 15')
  })

  it('resolves an alias to the canonical name before matching', () => {
    const sessions = [session({ id: 'web', date: '2026-09-06' })]
    // `incline dumbbell press` → `Incline DB Press`.
    const sets = [set({ sessionId: 'web', exerciseName: 'Incline Dumbbell Press', weightKg: 36, reps: 9 })]
    expect(exercise(seed({ sessions, sets }), 'Incline DB Press').source).toBe('history')
  })

  it('repeats the last known load at the rep floor for a set history is short of', () => {
    const sessions = [session({ id: 'a', date: '2026-09-06' })]
    const sets = [
      set({ sessionId: 'a', exerciseName: 'Face Pull', order: 1, weightKg: 15, reps: 15 }),
      set({ sessionId: 'a', exerciseName: 'Face Pull', order: 2, weightKg: 15, reps: 13 }),
    ]
    const face = exercise(seed({ sessions, sets }), 'Face Pull')
    expect(face.rows.map((r) => [r.weightKg, r.reps])).toEqual([[15, 15], [15, 13], [15, 12]])
    expect(face.rows[2].previous).toBe('15kg × 13')
  })

  it('truncates a history longer than the program asks for', () => {
    const sessions = [session({ id: 'a', date: '2026-09-06' })]
    const sets = [1, 2, 3, 4, 5].map((i) =>
      set({ sessionId: 'a', exerciseName: 'Face Pull', order: i, weightKg: 15, reps: 15 }))
    expect(exercise(seed({ sessions, sets }), 'Face Pull').rows).toHaveLength(3)
  })

  it('carries last session’s warm-up as a warm-up row, on top of the working sets', () => {
    const sessions = [session({ id: 'a', date: '2026-09-06' })]
    const sets = [
      set({ sessionId: 'a', exerciseName: 'Face Pull', order: 1, weightKg: 5, reps: 15, setType: 'warmup' }),
      set({ sessionId: 'a', exerciseName: 'Face Pull', order: 2, weightKg: 15, reps: 15 }),
    ]
    const face = exercise(seed({ sessions, sets }), 'Face Pull')
    expect(face.rows.map((r) => r.kind)).toEqual(['warmup', 'normal', 'normal', 'normal'])
    expect(face.rows.filter((r) => r.kind === 'normal')).toHaveLength(3)
  })

  it('walks back past a session that skipped the movement', () => {
    const sessions = [session({ id: 'new', date: '2026-09-06' }), session({ id: 'old', date: '2026-08-30' })]
    const sets = [set({ sessionId: 'old', exerciseName: 'Face Pull', weightKg: 14, reps: 15 })]
    expect(exercise(seed({ sessions, sets }), 'Face Pull').seededFrom).toBe('2026-08-30')
  })

  it('walks past a session that only warmed up', () => {
    // You warmed up and stopped. Committing to the history tier on that returns
    // the warm-up and NOTHING else — there is no working row to repeat — and the
    // day opens with none of the sets the program asks for.
    const sessions = [session({ id: 'w', date: '2026-09-06' }), session({ id: 'real', date: '2026-08-30' })]
    const sets: SeedSet[] = [
      set({ sessionId: 'w', exerciseName: 'Face Pull', weightKg: 5, reps: 15, setType: 'warmup' }),
      set({ sessionId: 'real', exerciseName: 'Face Pull', weightKg: 15, reps: 15 }),
    ]
    const face = exercise(seed({ sessions, sets }), 'Face Pull')
    expect(face.seededFrom).toBe('2026-08-30')
    expect(face.rows.filter((r) => r.kind === 'normal')).toHaveLength(3)
  })

  it('falls to the cold start when every session only warmed up', () => {
    const sessions = [session({ id: 'w', date: '2026-09-06' })]
    const sets = [set({ sessionId: 'w', exerciseName: 'Face Pull', weightKg: 5, reps: 15, setType: 'warmup' })]
    const face = exercise(seed({ sessions, sets }), 'Face Pull')
    expect(face.source).toBe('program')
    expect(face.rows).toHaveLength(3)
  })

  it('never reads a maintenance week', () => {
    const sessions = [session({ id: 'm', date: '2026-09-06', maintenance: true })]
    const sets = [set({ sessionId: 'm', exerciseName: 'Face Pull', weightKg: 8, reps: 15 })]
    expect(exercise(seed({ sessions, sets }), 'Face Pull').source).toBe('program')
  })

  it('falls to the stored template when history has nothing', () => {
    const template: RoutineTemplate = {
      version: 1,
      exercises: [{ name: 'Face Pull', order: 0, sets: [{ weightKg: 20, reps: 14 }, { weightKg: 20, reps: 13 }] }],
    }
    const face = exercise(seed({ template }), 'Face Pull')
    expect(face.source).toBe('template')
    expect(face.rows.map((r) => [r.weightKg, r.reps])).toEqual([[20, 14], [20, 13]])
    expect(face.seededFrom).toBeNull()
  })

  it('prefers history over the template', () => {
    const template: RoutineTemplate = {
      version: 1,
      exercises: [{ name: 'Face Pull', order: 0, sets: [{ weightKg: 20, reps: 14 }] }],
    }
    const sessions = [session({ id: 'a', date: '2026-09-06' })]
    const sets = [set({ sessionId: 'a', exerciseName: 'Face Pull', weightKg: 15, reps: 15 })]
    expect(exercise(seed({ sessions, sets, template }), 'Face Pull').source).toBe('history')
  })
})

describe('buildSessionSeed — progression and RPE memory', () => {
  const sessions = [session({ id: 'a', date: '2026-09-06' })]
  const rated: SeedSet[] = [
    set({ sessionId: 'a', exerciseName: 'Face Pull', order: 1, weightKg: 15, reps: 15, rpe: 8 }),
    set({ sessionId: 'a', exerciseName: 'Face Pull', order: 2, weightKg: 15, reps: 15, rpe: 8.5 }),
    set({ sessionId: 'a', exerciseName: 'Face Pull', order: 3, weightKg: 15, reps: 15, rpe: 9 }),
  ]

  it('carries last session’s rating when the work is unchanged', () => {
    const face = exercise(seed({ sessions, sets: rated }), 'Face Pull')
    expect(face.rows.map((r) => r.rpe)).toEqual([8, 8.5, 9])
    expect(face.rows.every((r) => !r.rpeStale)).toBe(true)
  })

  it('pre-fills suggestKg at the floor and marks the row progressed', () => {
    const face = exercise(seed({
      sessions, sets: rated, ready: [{ name: 'Face Pull', suggestKg: 17.5 }],
    }), 'Face Pull')
    expect(face.rows.map((r) => [r.weightKg, r.reps])).toEqual([[17.5, 12], [17.5, 12], [17.5, 12]])
    expect(face.rows.every((r) => r.progressed)).toBe(true)
  })

  it('drops the remembered rating when the bump makes the work harder', () => {
    const face = exercise(seed({
      sessions, sets: rated, ready: [{ name: 'Face Pull', suggestKg: 17.5 }],
    }), 'Face Pull')
    expect(face.rows.map((r) => r.rpe)).toEqual([null, null, null])
    expect(face.rows.every((r) => r.rpeStale)).toBe(true)
  })

  it('does nothing for a bodyweight ready — there is no load to add', () => {
    const face = exercise(seed({
      sessions, sets: rated, ready: [{ name: 'Face Pull', suggestKg: null }],
    }), 'Face Pull')
    expect(face.rows.every((r) => !r.progressed)).toBe(true)
    expect(face.rows[0].weightKg).toBe(15)
  })

  it('never carries a warm-up’s rating', () => {
    const sets: SeedSet[] = [
      set({ sessionId: 'a', exerciseName: 'Face Pull', order: 1, weightKg: 5, reps: 15, rpe: 6, setType: 'warmup' }),
      set({ sessionId: 'a', exerciseName: 'Face Pull', order: 2, weightKg: 15, reps: 15 }),
    ]
    expect(exercise(seed({ sessions, sets }), 'Face Pull').rows[0].rpe).toBeNull()
  })
})

describe('previousLabel', () => {
  it('prints the load the way the row does', () => {
    expect(previousLabel(13.75, 12)).toBe('13.75kg × 12')
    expect(previousLabel(49.5, 8)).toBe('49.5kg × 8')
    expect(previousLabel(47, 12)).toBe('47kg × 12')
  })
})
