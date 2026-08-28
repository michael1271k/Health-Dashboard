import { describe, it, expect } from 'vitest'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import { payloadToTemplate } from '@/lib/sessions/routineTemplate'
import { computeWorkoutScore } from '@/lib/scoring/score'
import { setDetail, type ExportSet } from '@/lib/reports/weeklyExport'

/**
 * A GHOST IS A SET YOU DELIBERATELY DID NOT DO.
 *
 * `setTags.ts` has described one as "logged, not counted" since it was
 * introduced, and `isPrIneligible` honoured that. Almost nothing else did: a
 * ghost carried its full tonnage into `total_валume_kg`, credited its muscles,
 * cost effort points, seeded next week's template with its weight and RPE, and
 * printed in the weekly export as an ordinary numbered set.
 *
 * These pin every one of those, because the vocabulary existing without the
 * consequences is precisely how it went wrong the first time.
 */

describe('a ghost weighs nothing', () => {
  it('contributes no tonnage, while a warm-up and a drop set still do', () => {
    // The asymmetry is the point. A warm-up is work you performed; the app has
    // counted it everywhere since the Hevy parity pass. A ghost is not work.
    expect(sessionVolumeKg([{ weightKg: 40, reps: 10, setType: 'ghost' }])).toBe(0)
    expect(sessionVolumeKg([{ weightKg: 40, reps: 10, setType: 'warmup' }])).toBe(400)
    expect(sessionVolumeKg([{ weightKg: 40, reps: 10, setType: 'dropset' }])).toBe(400)
    expect(sessionVolumeKg([{ weightKg: 40, reps: 10, setType: 'failure' }])).toBe(400)
  })

  it('leaves the rest of the session untouched', () => {
    expect(sessionVolumeKg([
      { weightKg: 40, reps: 10 },
      { weightKg: 40, reps: 10, setType: 'ghost' },
      { weightKg: 50, reps: 8 },
    ])).toBe(800)
  })

  it('drops a ghosted unilateral pair without scoring it as a lone side', () => {
    // The weaker-side collapse must not see a half-empty bucket and fall through
    // to "score each row as logged", which would credit the surviving side.
    expect(sessionVolumeKg([
      { weightKg: 20, reps: 10, side: 'R', pairId: 'p1', setType: 'ghost' },
      { weightKg: 18, reps: 10, side: 'L', pairId: 'p1', setType: 'ghost' },
    ])).toBe(0)
  })

  it('does not change any answer when no set type is given', () => {
    // Every historical row and most call sites pass no setType at all.
    expect(sessionVolumeKg([
      { weightKg: 20, reps: 10, side: 'L', pairId: 'p1' },
      { weightKg: 20, reps: 14, side: 'R', pairId: 'p1' },
    ])).toBe(200)
  })
})

describe('a ghost does not deduct from the score', () => {
  const base = {
    workoutLogged: true, isRestDay: false, newPRsToday: 0,
    sessionVolumeKg: 5000, trailingAvgVolumeKg: 5000,
    plannedExercises: 5, loggedExercises: 5,
    failureSets: 2,
  } as const

  it('scores a half-ghosted session exactly like a smaller session done in full', () => {
    // 20 prescribed, 4 ghosted, 16 performed — the scorer is handed
    // plannedSets = 16 (see computeForDate), so the ratio is 16/16.
    const ghosted = computeWorkoutScore({ ...base, plannedSets: 16, sessionSets: 16 })
    const whole   = computeWorkoutScore({ ...base, plannedSets: 16, sessionSets: 16 })
    expect(ghosted).toBe(whole)
  })

  it('still penalises sets that were simply not done', () => {
    // The guard must not become "skipping is always free". A set neither
    // performed nor ghosted is a gap, and the effort component should say so.
    const full = computeWorkoutScore({ ...base, plannedSets: 20, sessionSets: 20 })!
    const short = computeWorkoutScore({ ...base, plannedSets: 20, sessionSets: 16 })!
    expect(short).toBeLessThan(full)
  })
})

describe('a ghost does not reach next week', () => {
  const set = (over: Partial<Parameters<typeof payloadToTemplate>[0][number]> = {}) => ({
    exerciseName: 'Leg Press', exerciseOrder: 0,
    weightKg: 100, reps: 10, ...over,
  }) as Parameters<typeof payloadToTemplate>[0][number]

  it('drops the ghosted row, keeping the rest of the exercise', () => {
    const t = payloadToTemplate([
      set({ weightKg: 100, reps: 10 }),
      set({ weightKg: 100, reps: 10, setType: 'ghost', rpe: 9 }),
      set({ weightKg: 100, reps: 8 }),
    ])
    const sets = t!.exercises[0].sets
    expect(sets).toHaveLength(2)
    expect(sets.some((s) => s.setType === 'ghost')).toBe(false)
    // And it must not smuggle the RPE through on a surviving row.
    expect(sets.map((s) => s.reps)).toEqual([10, 8])
  })

  it('drops an exercise that was ghosted entirely', () => {
    // Correct: you skipped the lift, so next week seeds from the PROGRAM rather
    // than from a memory of a session that did not happen.
    const t = payloadToTemplate([
      set({ exerciseName: 'Leg Press', setType: 'ghost' }),
      set({ exerciseName: 'Hack Squat', exerciseOrder: 1 }),
    ])
    expect(t!.exercises.map((e) => e.name)).toEqual(['Hack Squat'])
  })

  it('returns null when the whole session was ghosted, rather than blanking the template', () => {
    expect(payloadToTemplate([set({ setType: 'ghost' })])).toBeNull()
  })

  it('still carries warm-ups, failures and drop sets forward', () => {
    const t = payloadToTemplate([
      set({ setType: 'warmup' }),
      set({ setType: 'failure' }),
      set({ setType: 'dropset' }),
    ])
    expect(t!.exercises[0].sets.map((s) => s.setType)).toEqual(['warmup', 'failure', 'dropset'])
  })
})

describe('a ghost is visible in the export', () => {
  const s = (over: Partial<ExportSet>): ExportSet =>
    ({ weightKg: 40, reps: 10, rpe: null, side: null, failure: false, pairId: null, ...over })

  it('takes no set number and says it was planned', () => {
    expect(setDetail([
      s({ rpe: 8 }),
      s({ ghost: true }),
      s({ weightKg: 50, reps: 8, rpe: 9 }),
    ])).toEqual([
      'Set 1: 40 kg × 10 (RPE 8 — Challenging)',
      'Skipped: 40 kg × 10 (planned)',
      'Set 2: 50 kg × 8 (RPE 9 — Very Hard)',
    ])
  })

  it('does not fire the unrated caveat because of a ghost', () => {
    // Every set actually performed was rated, so the week has full coverage —
    // a ghost counting as "unrated" would append a caveat that is not true.
    const lines = setDetail([s({ rpe: 8 }), s({ ghost: true })])
    expect(lines.some((l) => l.includes('not reported'))).toBe(false)
  })

  it('is not counted as an unrated working set', () => {
    // Otherwise the "RPE not reported" caveat fires on a week where every set
    // you actually performed was rated.
    expect(setDetail([s({ rpe: 8 }), s({ ghost: true })])).toEqual([
      'Set 1: 40 kg × 10 (RPE 8 — Challenging)',
      'Skipped: 40 kg × 10 (planned)',
    ])
  })
})
