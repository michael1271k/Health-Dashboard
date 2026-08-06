import { describe, it, expect } from 'vitest'
import { SEEDED_PRS, SEED_CUTOFF, ASSERTED_DATES, seededAxesFor, isAssertedSession } from '@/lib/training/prSeed'
import { canonicalExerciseName } from '@/lib/exercises/aliases'
import { buildBaselines, detectSessionPrs, type BaselineSetRow, type PrAxis } from '@/lib/training/prEngine'

/**
 * The record book is asserted, so its SHAPE is the thing worth pinning: how
 * many sets carry a trophy, how many standing ledger rows they collapse into,
 * and how the count splits per session. If an entry is added or edited these
 * numbers move, and they should — but never silently.
 */
describe('the seeded record book', () => {
  it('holds 23 records across 12 sessions', () => {
    expect(SEEDED_PRS).toHaveLength(23)
    expect(new Set(SEEDED_PRS.map((p) => p.date)).size).toBe(12)
  })

  it('collapses to 33 standing ledger rows', () => {
    // `personal_records` is keyed (user_id, exercise_key, axis) — ONE row per
    // exercise per axis. Hip Thrust wins volume on 07-17, 07-24 and 07-31 and
    // keeps a single row holding the latest.
    const keys = new Set<string>()
    for (const p of SEEDED_PRS) {
      for (const a of p.axes) keys.add(`${canonicalExerciseName(p.exercise)}|${a}`)
    }
    expect(keys.size).toBe(33)
  })

  it('totals 41 axis-achievements, distributed per session as specified', () => {
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
      '2026-07-28': 4, '2026-07-30': 3, '2026-07-31': 3, '2026-08-02': 3,
    })
    expect([...perSession.values()].reduce((a, b) => a + b, 0)).toBe(41)
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

describe('isAssertedSession — the boundary', () => {
  it('covers everything up to and including the cutoff', () => {
    expect(SEED_CUTOFF).toBe('2026-07-31')
    expect(isAssertedSession('2026-05-20')).toBe(true)   // the Hevy-era imports
    expect(isAssertedSession('2026-07-31')).toBe(true)
  })

  it('hands control to live detection the next day', () => {
    expect(isAssertedSession('2026-08-01')).toBe(false)
  })

  it('asserts individually listed post-cutoff sessions only', () => {
    // 2026-08-02 is corrected by hand; 08-03 and everything after it must still
    // derive, or adding one correction would freeze the engine indefinitely.
    expect(ASSERTED_DATES).toContain('2026-08-02')
    expect(isAssertedSession('2026-08-02')).toBe(true)
    expect(isAssertedSession('2026-08-03')).toBe(false)
    expect(isAssertedSession('2026-08-09')).toBe(false)
  })

  it('has an entry in SEEDED_PRS for every asserted date', () => {
    // An asserted date with no records suppresses detection and awards nothing —
    // legitimate for a genuinely record-free session, but never by accident.
    for (const d of ASSERTED_DATES) {
      expect(SEEDED_PRS.some((p) => p.date === d)).toBe(true)
    }
  })

  it('treats a dateless session as live, never as asserted', () => {
    // The live deck builds candidates without a date; defaulting those into the
    // seeded era would silently disable PR detection while logging.
    expect(isAssertedSession(null)).toBe(false)
    expect(isAssertedSession(undefined)).toBe(false)
  })
})

/**
 * 2026-08-02 end to end, through the real engine with the REAL baselines.
 *
 * Two histories, because the session outlived its own bug. `HISTORY` is the
 * repaired `workout_sets` (07-26 Incline DB Press corrected from 63.75 kg to its
 * true 35 kg on 2026-08-03); `POISONED` is what the engine actually saw on the
 * day. Both are kept: one pins today's behaviour, the other pins the failure
 * mode so a re-introduced bad load cannot pass silently.
 */
describe('2026-08-02 — an asserted session inside live detection', () => {
  const D = '2026-08-02'
  const cand = (name: string, setNumber: number, weightKg: number, reps: number, setType: string | null = null) =>
    ({ key: name, exerciseName: name, setNumber, weightKg, reps, setType, timed: false, date: D })

  const SETS = [
    cand('Incline DB Press', 1, 35, 12), cand('Incline DB Press', 2, 40, 10), cand('Incline DB Press', 3, 40, 8),
    cand('Lat Pulldown', 1, 47, 12), cand('Lat Pulldown', 2, 47, 12), cand('Lat Pulldown', 3, 47, 10),
    cand('Chest Press (Machine)', 1, 37.5, 12), cand('Chest Press (Machine)', 2, 40, 8, 'failure'),
    cand('Seated Cable Row (V-Grip)', 1, 42.5, 12), cand('Seated Cable Row (V-Grip)', 2, 42.5, 13),
    cand('Pec Deck', 1, 50, 15), cand('Pec Deck', 2, 50, 11),
    cand('Straight-Arm Pulldown', 1, 16.25, 15), cand('Straight-Arm Pulldown', 2, 16.25, 12), cand('Straight-Arm Pulldown', 3, 15, 11),
    cand('Face Pull', 1, 16.25, 15), cand('Face Pull', 2, 15, 16), cand('Face Pull', 3, 15, 15),
  ]

  // Every prior logged set for the six lifts that are NOT Incline DB Press —
  // identical under both histories.
  const REST: BaselineSetRow[] = [
    ...[[37.5, 12], [37.5, 12], [35, 12]].map(([w, r]) => ({ key: 'Chest Press (Machine)', weightKg: w, reps: r })),
    ...[[42.5, 12], [42.5, 12]].map(([w, r]) => ({ key: 'Seated Cable Row (V-Grip)', weightKg: w, reps: r })),
    ...[[50, 15], [52.5, 9]].map(([w, r]) => ({ key: 'Pec Deck', weightKg: w, reps: r })),
    ...[[16.25, 15], [16.25, 11], [15, 11]].map(([w, r]) => ({ key: 'Straight-Arm Pulldown', weightKg: w, reps: r })),
    ...[[15, 14], [16.25, 15], [15, 15]].map(([w, r]) => ({ key: 'Face Pull', weightKg: w, reps: r })),
    ...[[47, 12], [47, 12], [47, 10]].map(([w, r]) => ({ key: 'Lat Pulldown', weightKg: w, reps: r })),
  ]
  const incline = (rows: number[][]): BaselineSetRow[] =>
    rows.map(([w, r]) => ({ key: 'Incline DB Press', weightKg: w, reps: r }))

  const JUL_19 = incline([[35, 11], [35, 12], [35, 12]])

  /** Live `workout_sets` as of 2026-08-03, 07-26 repaired to its true load. */
  const HISTORY: BaselineSetRow[] = [...JUL_19, ...incline([[35, 12], [35, 12], [35, 12]]), ...REST]

  /** What the engine saw on the day: 63.75 kg wedged between 35 kg and 40 kg. */
  const POISONED: BaselineSetRow[] = [...JUL_19, ...incline([[63.75, 12], [63.75, 12], [63.75, 12]]), ...REST]

  const baselines = buildBaselines(HISTORY, () => false)
  const poisoned = buildBaselines(POISONED, () => false)

  it('awards exactly the three asserted records', () => {
    const r = detectSessionPrs(SETS, baselines)
    expect(r.prCount).toBe(3)
    expect(Object.fromEntries([...r.axesByKey].map(([k, v]) => [k, [...v].sort()]))).toEqual({
      'Incline DB Press': ['e1rm', 'weight'],
      'Chest Press (Machine)': ['weight'],
    })
  })

  it('flags the two sets that earned them, and no others', () => {
    const r = detectSessionPrs(SETS, baselines)
    const flagged = r.perSet
      .map((d, i) => (d.axes.length ? `${SETS[i].key} S${SETS[i].setNumber}` : null))
      .filter(Boolean)
    expect(flagged).toEqual(['Incline DB Press S2', 'Chest Press (Machine) S2'])
  })

  it('holds the same three records against the poisoned history', () => {
    // The assertion is an AUTHORITY, not a correction applied on top of
    // detection: what the baselines happen to contain must not move it.
    const r = detectSessionPrs(SETS, poisoned)
    expect(r.prCount).toBe(3)
  })

  it('pins the bad baseline that made the assertion necessary', () => {
    // Assertion bypassed, 63.75 kg still in history: NEITHER Incline DB Press
    // record is found, because a load never lifted was the bar every later set
    // had to clear. This is the original bug, and it is invisible in the count
    // alone — 3 axes, the same total the assertion produces, from a different
    // and wrong set of exercises.
    const bare = SETS.map((s) => ({ ...s, date: null }))
    const r = detectSessionPrs(bare, poisoned)
    expect(r.axesByKey.has('Incline DB Press')).toBe(false)
    expect(r.prCount).toBe(3)
  })

  it('derives both Incline records now that the load is repaired', () => {
    // The correction is load-bearing: against the true 35 kg history, detection
    // finds exactly the two axes seeded for this session, unaided.
    const bare = SETS.map((s) => ({ ...s, date: null }))
    const r = detectSessionPrs(bare, baselines)
    expect([...(r.axesByKey.get('Incline DB Press') ?? [])].sort()).toEqual(['e1rm', 'weight'])

    // The assertion still earns its place, but only just: derived detection now
    // reports 5 against the asserted 3. It read 10 before the 2026-08-03 axis
    // rules — dropping `reps` on loaded lifts and making `volume` a single-set
    // record removed the pile-on where one improved set carried three trophies.
    expect(r.prCount).toBe(5)
  })
})
