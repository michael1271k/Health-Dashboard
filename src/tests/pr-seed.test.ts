import { describe, it, expect } from 'vitest'
import { SEEDED_PRS, SEED_CUTOFF, seededAxesFor, isSeededEra } from '@/lib/training/prSeed'
import { canonicalExerciseName } from '@/lib/exercises/aliases'
import type { PrAxis } from '@/lib/training/prEngine'

/**
 * The record book is asserted, so its SHAPE is the thing worth pinning: how
 * many sets carry a trophy, how many standing ledger rows they collapse into,
 * and how the count splits per session. If an entry is added or edited these
 * numbers move, and they should — but never silently.
 */
describe('the seeded record book', () => {
  it('holds 21 records across 11 sessions', () => {
    expect(SEEDED_PRS).toHaveLength(21)
    expect(new Set(SEEDED_PRS.map((p) => p.date)).size).toBe(11)
  })

  it('collapses to 30 standing ledger rows', () => {
    // `personal_records` is keyed (user_id, exercise_key, axis) — ONE row per
    // exercise per axis. Hip Thrust wins volume on 07-17, 07-24 and 07-31 and
    // keeps a single row holding the latest.
    const keys = new Set<string>()
    for (const p of SEEDED_PRS) {
      for (const a of p.axes) keys.add(`${canonicalExerciseName(p.exercise)}|${a}`)
    }
    expect(keys.size).toBe(30)
  })

  it('totals 38 axis-achievements, distributed per session as specified', () => {
    // pr_count counts DISTINCT axes per exercise within one session.
    const perSession = new Map<string, number>()
    for (const p of SEEDED_PRS) {
      const byEx = new Map<string, Set<PrAxis>>()
      for (const q of SEEDED_PRS.filter((x) => x.date === p.date)) {
        const s = byEx.get(q.exercise) ?? new Set<PrAxis>()
        q.axes.forEach((a) => s.add(a))
        byEx.set(q.exercise, s)
      }
      perSession.set(p.date, [...byEx.values()].reduce((n, s) => n + s.size, 0))
    }
    expect(Object.fromEntries([...perSession].sort())).toEqual({
      '2026-07-16': 2, '2026-07-17': 1, '2026-07-19': 2, '2026-07-20': 2,
      '2026-07-21': 9, '2026-07-23': 5, '2026-07-24': 5, '2026-07-27': 2,
      '2026-07-28': 4, '2026-07-30': 3, '2026-07-31': 3,
    })
    expect([...perSession.values()].reduce((a, b) => a + b, 0)).toBe(38)
  })

  it('omits 2026-07-26 entirely — that session sets no records', () => {
    expect(SEEDED_PRS.some((p) => p.date === '2026-07-26')).toBe(false)
  })

  it('names every exercise canonically, so the ledger key matches exercises.name', () => {
    // `useSessionDetail` matches ledger rows by `exercises.name`; an entry left
    // under an alias would render no axis chip at all.
    for (const p of SEEDED_PRS) {
      expect(canonicalExerciseName(p.exercise)).toBe(p.exercise)
    }
  })

  it('never files a bare weight of 0 on a loaded lift', () => {
    // Only the timed holds are weightless, and they carry `reps` (= seconds).
    for (const p of SEEDED_PRS.filter((x) => x.weightKg === 0)) {
      expect(p.axes).toEqual(['reps'])
    }
  })
})

describe('seededAxesFor — strict matching', () => {
  const HIP = 'Hip Thrust (Machine)'

  it('returns the asserted axes on an exact match', () => {
    expect(seededAxesFor('2026-07-31', HIP, 2, 27.5, 13).sort()).toEqual(['e1rm', 'volume'])
  })

  it('resolves an alias to the canonical name', () => {
    // 07-21's lateral raise was logged as `Cable Lateral Raise` before the merge.
    expect(seededAxesFor('2026-07-21', 'Cable Lateral Raise', 3, 5, 10).sort())
      .toEqual(['e1rm', 'weight'])
  })

  it('drops out when the load or reps were edited', () => {
    expect(seededAxesFor('2026-07-31', HIP, 2, 27.5, 12)).toEqual([])
    expect(seededAxesFor('2026-07-31', HIP, 2, 30, 13)).toEqual([])
  })

  it('drops out on the wrong set number or date', () => {
    expect(seededAxesFor('2026-07-31', HIP, 3, 27.5, 13)).toEqual([])
    expect(seededAxesFor('2026-08-04', HIP, 2, 27.5, 13)).toEqual([])
  })

  it('tolerates missing identity fields rather than throwing', () => {
    expect(seededAxesFor(null, HIP, 2, 27.5, 13)).toEqual([])
    expect(seededAxesFor('2026-07-31', null, 2, 27.5, 13)).toEqual([])
    expect(seededAxesFor('2026-07-31', HIP, null, 27.5, 13)).toEqual([])
  })
})

describe('isSeededEra — the boundary', () => {
  it('covers everything up to and including the cutoff', () => {
    expect(SEED_CUTOFF).toBe('2026-07-31')
    expect(isSeededEra('2026-05-20')).toBe(true)   // the Hevy-era imports
    expect(isSeededEra('2026-07-31')).toBe(true)
  })

  it('hands control to live detection the next day', () => {
    expect(isSeededEra('2026-08-01')).toBe(false)
  })

  it('treats a dateless session as live, never as seeded', () => {
    // The live deck builds candidates without a date; defaulting those into the
    // seeded era would silently disable PR detection while logging.
    expect(isSeededEra(null)).toBe(false)
    expect(isSeededEra(undefined)).toBe(false)
  })
})
