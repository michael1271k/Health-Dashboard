import { describe, it, expect } from 'vitest'
import {
  trendPoints, meanBetween, topRecords, e1rmTrends, volumeByFamily, shiftISO,
  type LedgerRow, type SetRow,
} from '@/lib/widget/derive'
import { PR_TRUTH, prFloorFor } from '@/lib/training/prTruth'

/**
 * The widget payload's arithmetic. Everything here feeds a home-screen surface
 * with no UI to explain itself, so the rule from `snapshot.ts` is absolute:
 * an entry that cannot be computed is OMITTED, never emitted as a zero.
 */

describe('trendPoints', () => {
  it('sorts oldest-first and keeps only the newest `limit` readings', () => {
    const rows = [
      { date: '2026-08-03', value: 65.1 },
      { date: '2026-08-01', value: 65.6 },
      { date: '2026-08-02', value: 65.4 },
    ]
    expect(trendPoints(rows, 2)).toEqual([{ d: '2026-08-02', v: 65.4 }, { d: '2026-08-03', v: 65.1 }])
  })

  it('drops missing readings rather than interpolating across them', () => {
    // A skipped weigh-in is a day nobody stood on the scale. Drawing a point
    // there would put a number under a date that has none.
    const rows = [
      { date: '2026-08-01', value: 65.6 },
      { date: '2026-08-02', value: null },
      { date: '2026-08-03', value: undefined },
      { date: '2026-08-04', value: 65.2 },
    ]
    expect(trendPoints(rows, 14)).toEqual([{ d: '2026-08-01', v: 65.6 }, { d: '2026-08-04', v: 65.2 }])
  })

  it('drops NaN and Infinity, which arithmetic on nulls can produce', () => {
    expect(trendPoints([{ date: '2026-08-01', value: NaN }, { date: '2026-08-02', value: Infinity }], 5)).toEqual([])
  })

  it('returns an empty series rather than throwing on no data', () => {
    expect(trendPoints([], 14)).toEqual([])
  })
})

describe('meanBetween', () => {
  const pts = [
    { d: '2026-08-01', v: 66 }, { d: '2026-08-02', v: 65 },
    { d: '2026-08-08', v: 64 }, { d: '2026-08-09', v: 64.5 },
  ]

  it('averages the half-open window', () => {
    expect(meanBetween(pts, '2026-08-01', '2026-08-08')).toBe(65.5)
  })

  it('excludes the upper bound', () => {
    expect(meanBetween(pts, '2026-08-08', '2026-08-09')).toBe(64)
  })

  /**
   * Null, not zero. This is the dotted baseline the weight trendline is read
   * against — a 0 kg baseline would draw a fortnight of ordinary weigh-ins as a
   * sixty-five-kilo gain.
   */
  it('returns null for an empty window instead of a zero baseline', () => {
    expect(meanBetween(pts, '2026-07-01', '2026-07-08')).toBeNull()
    expect(meanBetween([], '2026-08-01', '2026-08-08')).toBeNull()
  })
})

describe('topRecords', () => {
  const row = (over: Partial<LedgerRow>): LedgerRow => ({
    exercise_key: 'Hammer Curl', axis: 'weight', value: 20, reps: 10, achieved_on: '2026-08-01', ...over,
  })

  it('returns the most recent records first', () => {
    const out = topRecords([
      row({ achieved_on: '2026-07-20', exercise_key: 'A' }),
      row({ achieved_on: '2026-08-05', exercise_key: 'B' }),
      row({ achieved_on: '2026-08-01', exercise_key: 'C' }),
    ])
    expect(out.map((r) => r.exercise)).toEqual(['B', 'C', 'A'])
  })

  it('honours the limit', () => {
    const rows = Array.from({ length: 9 }, (_, i) => row({ exercise_key: `E${i}`, achieved_on: `2026-08-0${i + 1}` }))
    expect(topRecords(rows, 3)).toHaveLength(3)
  })

  it('drops a row with no value or no date rather than rendering a dash as a PR', () => {
    expect(topRecords([row({ value: null }), row({ achieved_on: null })])).toEqual([])
  })

  /**
   * ── THE NOTION-ERA HOLE ──────────────────────────────────────────────────────
   * 75 sessions carry zero sets, so Helix's own detection cannot see any best set
   * before 2026-07-16. A ledger row below the asserted floor is a Helix-era best
   * that the pre-Helix book already beats — not a personal record.
   */
  it('drops a ledger row the asserted book already beats', () => {
    // Find a real exercise whose book raises the weight axis, so this test is
    // pinned to the actual record book rather than to a fixture.
    const named = Object.keys(PR_TRUTH).find((n) => prFloorFor(n)?.weight != null)
    expect(named).toBeDefined()
    const floor = prFloorFor(named!)!.weight as number

    const below = row({ exercise_key: named!, axis: 'weight', value: floor - 5 })
    const above = row({ exercise_key: named!, axis: 'weight', value: floor + 5 })
    expect(topRecords([below])).toEqual([])
    expect(topRecords([above])).toHaveLength(1)
  })

  it('keeps a row on an axis the book says nothing about', () => {
    expect(topRecords([row({ exercise_key: 'Some Unbooked Lift', axis: 'volume', value: 400 })])).toHaveLength(1)
  })

  it('passes an unrecognised axis through rather than filtering it out', () => {
    // A new axis must render, not vanish, the first time one is added.
    expect(topRecords([row({ axis: 'seconds', value: 90 })])).toHaveLength(1)
  })
})

describe('e1rmTrends', () => {
  const s = (over: Partial<SetRow> = {}): SetRow => ({
    exercise: 'Hack Squat', day: '2026-08-10', weightKg: 100, reps: 5, ...over,
  })

  /**
   * A session is a top set followed by back-offs. Without the per-day collapse
   * every workout reads as a mid-session strength collapse.
   */
  it('collapses a session to its best set', () => {
    const out = e1rmTrends([
      s({ weightKg: 100, reps: 5 }),   // ~116.7
      s({ weightKg: 80, reps: 5 }),    // back-off
      s({ weightKg: 70, reps: 8 }),    // back-off
    ], { asOf: '2026-08-10' })
    expect(out).toHaveLength(1)
    expect(out[0].kg).toBeCloseTo(116.7, 1)
  })

  it('measures the delta against the last session at or before the cutoff', () => {
    const out = e1rmTrends([
      s({ day: '2026-07-06', weightKg: 90, reps: 5 }),    // 35 days back — too old
      s({ day: '2026-07-13', weightKg: 95, reps: 5 }),    // 28 days back — the baseline
      s({ day: '2026-08-01', weightKg: 98, reps: 5 }),    // inside the window
      s({ day: '2026-08-10', weightKg: 100, reps: 5 }),
    ], { asOf: '2026-08-10' })
    expect(out[0].kg).toBeCloseTo(116.7, 1)
    expect(out[0].deltaKg).toBeCloseTo(116.7 - 110.8, 1)
  })

  it('reports a null delta rather than +0 when the lift is newer than the window', () => {
    const out = e1rmTrends([s({ day: '2026-08-09' }), s({ day: '2026-08-10' })], { asOf: '2026-08-10' })
    expect(out[0].deltaKg).toBeNull()
  })

  /**
   * `est_1rm_kg` stores a literal 0 for bodyweight and timed work — not null.
   * A `??` would keep that zero and report a Plank's one-rep max as 0 kg.
   */
  it('drops unloaded work instead of reporting a 0 kg one-rep max', () => {
    const out = e1rmTrends([
      s({ exercise: 'Plank', weightKg: 0, reps: 1, est1rmKg: 0 }),
      s({ exercise: 'Pull-Up', weightKg: 0, reps: 15, est1rmKg: 0 }),
    ], { asOf: '2026-08-10' })
    expect(out).toEqual([])
  })

  it('prefers the stored estimate over recomputing it', () => {
    const out = e1rmTrends([s({ weightKg: 100, reps: 5, est1rmKg: 999 })], { asOf: '2026-08-10' })
    expect(out[0].kg).toBe(999)
  })

  it('never counts a warm-up', () => {
    const out = e1rmTrends([
      s({ weightKg: 200, reps: 5, setType: 'warmup' }),
      s({ weightKg: 100, reps: 5 }),
    ], { asOf: '2026-08-10' })
    expect(out[0].kg).toBeCloseTo(116.7, 1)
  })

  it('orders by most recently trained, then by heaviest', () => {
    const out = e1rmTrends([
      s({ exercise: 'Old', day: '2026-07-01' }),
      s({ exercise: 'NewLight', day: '2026-08-10', weightKg: 50, reps: 5 }),
      s({ exercise: 'NewHeavy', day: '2026-08-10', weightKg: 150, reps: 5 }),
    ], { asOf: '2026-08-10' })
    expect(out.map((r) => r.exercise)).toEqual(['NewHeavy', 'NewLight', 'Old'])
  })

  it('honours the limit', () => {
    const rows = Array.from({ length: 8 }, (_, i) => s({ exercise: `E${i}` }))
    expect(e1rmTrends(rows, { asOf: '2026-08-10', limit: 3 })).toHaveLength(3)
  })
})

describe('volumeByFamily', () => {
  const s = (over: Partial<SetRow> = {}): SetRow => ({
    exercise: 'Hack Squat', day: '2026-08-10', weightKg: 100, reps: 10, ...over,
  })

  it('credits the primary family in full', () => {
    const out = volumeByFamily([s()])
    const legs = out.find((f) => f.family === 'Legs')
    expect(legs).toBeDefined()
    expect(legs!.kg).toBe(1000)
    expect(legs!.sets).toBe(1)
  })

  /**
   * The app-wide rule: primaries 1.0, secondaries 0.5. The widget and the
   * analytics page have to agree or one of them is lying.
   */
  it('credits a secondary family at half', () => {
    const out = volumeByFamily([s()])
    const secondary = out.filter((f) => f.family !== 'Legs')
    for (const f of secondary) expect(f.sets).toBe(0.5)
  })

  it('never gives one family full plus half for the same set', () => {
    // A pulldown names lats and upper back; both fold to Back. Back takes the
    // primary's full share once.
    const out = volumeByFamily([s({ exercise: 'Lat Pulldown', weightKg: 60, reps: 10 })])
    const back = out.find((f) => f.family === 'Back')
    expect(back?.sets).toBe(1)
    expect(back?.kg).toBe(600)
  })

  it('counts an unloaded set toward the family without inventing tonnage', () => {
    // Hanging Leg Raise resolves to abdominals → Core. `Plank` and `Pull-Up`
    // deliberately are NOT used here: neither resolves to any mover at all (the
    // same `muscleMap.DICT` gap as "Bench Press"), so they would have made this
    // test pass for the wrong reason.
    const out = volumeByFamily([s({ exercise: 'Hanging Leg Raise', weightKg: 0, reps: 15 })])
    expect(out).toEqual([{ family: 'Core', kg: 0, sets: 1 }])
  })

  it('counts a warm-up, exactly as the Week-to-Date card does', () => {
    // This asserted the opposite until the app stopped excluding warm-ups from
    // weekly per-muscle volume. A green test pinning the widget to the old rule
    // was hiding the disagreement rather than proving there was none.
    expect(volumeByFamily([s({ setType: 'warmup' })])).toEqual(
      volumeByFamily([s()]),
    )
  })

  it('sorts heaviest first', () => {
    const out = volumeByFamily([s(), s({ exercise: 'Lat Pulldown', weightKg: 10, reps: 1 })])
    expect(out[0].family).toBe('Legs')
  })

  /**
   * `muscleMap.DICT` has no entry for some plain names ("Bench Press",
   * "Barbell Curl") — a real gap, pinned here so the widget's behaviour around
   * it is documented rather than accidental: the set contributes nothing, and
   * nothing crashes.
   */
  it('contributes nothing for a lift with no known movers, and does not throw', () => {
    expect(() => volumeByFamily([s({ exercise: 'Nonexistent Machine' })])).not.toThrow()
    expect(volumeByFamily([s({ exercise: 'Nonexistent Machine' })])).toEqual([])
  })
})

describe('shiftISO', () => {
  it('shifts whole days in both directions', () => {
    expect(shiftISO('2026-08-10', -28)).toBe('2026-07-13')
    expect(shiftISO('2026-08-10', 7)).toBe('2026-08-17')
  })

  it('crosses month and year boundaries', () => {
    expect(shiftISO('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftISO('2026-01-01', -1)).toBe('2025-12-31')
  })
})
