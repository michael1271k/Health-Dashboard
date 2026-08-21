import { describe, it, expect } from 'vitest'
import { formatSet, formatLoad, formatReps, isUnloadedSet } from '@/lib/utils/setFormat'
import { setDetail, type ExportSet } from '@/lib/reports/weeklyExport'

const s = (weightKg: number, reps: number, extra: Partial<ExportSet> = {}): ExportSet =>
  ({ weightKg, reps, rpe: null, side: null, failure: false, pairId: null, ...extra })

/**
 * "0 kg × 17" states a load that does not exist and buries the only number the
 * set has behind it. Every surface hand-rolled `${w}${unit} × ${reps}`, so the
 * rule has to live in one place or it will drift back on the next component.
 */
describe('formatSet', () => {
  it('reads a loaded set as load × reps', () => {
    expect(formatSet(60, 12)).toBe('60kg × 12')
    expect(formatSet(16.25, 15)).toBe('16.25kg × 15')
  })

  it('reads unloaded work as reps', () => {
    expect(formatSet(0, 17)).toBe('17 reps')
    expect(formatSet(0, 1)).toBe('1 rep')
    expect(formatSet(null, 15)).toBe('15 reps')
  })

  it('reads a timed hold as seconds, whatever the load column says', () => {
    expect(formatSet(0, 58, { timed: true })).toBe('58 sec')
    // A weighted carry is still scored on time.
    expect(formatSet(20, 45, { timed: true })).toBe('45 sec')
  })

  it('converts and labels the unit for loaded sets only', () => {
    const toLb = (kg: number) => Math.round(kg * 2.20462 * 100) / 100
    expect(formatSet(60, 12, { unit: 'lb', toDisplay: toLb })).toBe('132.28lb × 12')
    // No load to convert — the unit must not leak onto a rep count.
    expect(formatSet(0, 17, { unit: 'lb', toDisplay: toLb })).toBe('17 reps')
  })

  it('has a bare form for columns that already say which number this is', () => {
    expect(formatSet(0, 17, { bare: true })).toBe('17')
    expect(formatSet(0, 58, { timed: true, bare: true })).toBe('58s')
  })

  it('treats only a real positive load as loaded', () => {
    expect(isUnloadedSet(0)).toBe(true)
    expect(isUnloadedSet(null)).toBe(true)
    expect(isUnloadedSet(undefined)).toBe(true)
    expect(isUnloadedSet(Number.NaN)).toBe(true)
    expect(isUnloadedSet(-5)).toBe(true)
    expect(isUnloadedSet(0.25)).toBe(false)
  })

  it('formats the halves independently', () => {
    expect(formatLoad(40)).toBe('40kg')
    expect(formatLoad(0)).toBe('bodyweight')
    expect(formatReps(12)).toBe('12 reps')
    expect(formatReps(58, true)).toBe('58 sec')
  })
})

describe('setDetail carries the same rule into the export', () => {
  it('gives every set its own line, named and in the unit the movement has', () => {
    expect(setDetail([s(60, 12, { rpe: 8.5 }), s(60, 11, { rpe: 9 })], 'Hack Squat')).toEqual([
      'Set 1: 60 kg × 12 (RPE 8.5 — Hard)',
      'Set 2: 60 kg × 11 (RPE 9 — Very Hard)',
    ])
  })

  it('writes bodyweight work as reps, not as 0 kg', () => {
    expect(setDetail([s(0, 17), s(0, 16)], 'Reverse Crunch')).toEqual([
      'Set 1: 17 reps', 'Set 2: 16 reps',
      '_(RPE not reported for any working set)_',
    ])
  })

  it('writes a hold as seconds', () => {
    expect(setDetail([s(0, 58, { rpe: 9 })], 'Side Plank')).toEqual([
      'Set 1: 58 sec (RPE 9 — Very Hard)',
    ])
  })

  it('names a warm-up rather than numbering it — Set 1 is the first WORKING set', () => {
    expect(setDetail([s(0, 12, { warmup: true }), s(0, 17, { rpe: 9 })], 'Hanging Knee Raise')).toEqual([
      'Warm-up: 12 reps (warm-up)',
      'Set 1: 17 reps (RPE 9 — Very Hard)',
    ])
  })
})

/**
 * PER-SET EFFORT IN THE EXPORT.
 *
 * The rating used to ride on the rep — `60kg × 12@8.5,11@9` — which is compact
 * and requires the reader to know that `@` means effort on a ten-point scale.
 * It is the number AND the word now, which is what the ladder actually means
 * and what the app's own ledger prints.
 *
 * A missing rating is STATED, never implied: an omitted rating and a set that
 * felt easy are different facts.
 */
describe('setDetail — per-set RPE', () => {
  it('gives the number and the word, because neither is much use alone', () => {
    expect(setDetail([s(60, 10, { rpe: 10 })], 'Hack Squat'))
      .toEqual(['Set 1: 60 kg × 10 (RPE 10 — Failure)'])
    expect(setDetail([s(60, 10, { rpe: 7.5 })], 'Hack Squat'))
      .toEqual(['Set 1: 60 kg × 10 (RPE 7.5 — Medium)'])
  })

  it('states it once for the exercise when nothing was rated', () => {
    expect(setDetail([s(60, 12), s(60, 11)], 'Hack Squat')).toEqual([
      'Set 1: 60 kg × 12', 'Set 2: 60 kg × 11',
      '_(RPE not reported for any working set)_',
    ])
  })

  it('marks the UNRATED set when the exercise is partly rated', () => {
    expect(setDetail([s(60, 12, { rpe: 8.5 }), s(65, 10)], 'Hack Squat')).toEqual([
      'Set 1: 60 kg × 12 (RPE 8.5 — Hard)',
      'Set 2: 65 kg × 10 (RPE not reported)',
    ])
  })

  it('never asks a warm-up for a rating', () => {
    expect(setDetail([s(20, 12, { warmup: true }), s(60, 10, { rpe: 9 })], 'Hack Squat')).toEqual([
      'Warm-up: 20 kg × 12 (warm-up)',
      'Set 1: 60 kg × 10 (RPE 9 — Very Hard)',
    ])
    // …and an all-warm-up exercise makes no claim about effort at all.
    expect(setDetail([s(20, 12, { warmup: true })], 'Hack Squat'))
      .toEqual(['Warm-up: 20 kg × 12 (warm-up)'])
  })

  it('does not say "Failure" twice — RPE 10 IS the top of the ladder', () => {
    expect(setDetail([s(60, 8, { rpe: 10, failure: true })], 'Hack Squat'))
      .toEqual(['Set 1: 60 kg × 8 (RPE 10 — Failure)'])
  })

  it('but keeps the tag when the rating does NOT already carry it', () => {
    // Reaching failure at 9 is a real combination — the set broke down before
    // the rating said it would — and the tag is the only thing that reports it.
    expect(setDetail([s(60, 8, { rpe: 9, failure: true })], 'Hack Squat'))
      .toEqual(['Set 1: 60 kg × 8 (RPE 9 — Very Hard, to failure)'])
    // …and an unrated failure keeps it too, alongside the coverage note the
    // exercise earns for having no ratings at all.
    expect(setDetail([s(60, 8, { failure: true })], 'Hack Squat'))
      .toEqual(['Set 1: 60 kg × 8 (to failure)', '_(RPE not reported for any working set)_'])
  })

  /** The rating is PER SIDE, like the failure tag — a weaker arm can genuinely
   *  rate harder at the same load. */
  it('carries a rating on each side of a unilateral pair', () => {
    expect(setDetail([
      s(20, 12, { side: 'L', pairId: 'p1', rpe: 8.5 }),
      s(20, 10, { side: 'R', pairId: 'p1', rpe: 10 }),
    ], 'Single Arm Row'))
      .toEqual(['Set 1: L 20 kg × 12 (RPE 8.5 — Hard) · R 20 kg × 10 (RPE 10 — Failure)'])
  })
})

/**
 * ── THE HARDCODED "L" ────────────────────────────────────────────────────────
 *
 * The old renderer asked one question for the whole exercise — is ANY set sided?
 * — and then ran every set through the unilateral branch, where an unsided set
 * hit `else p.L = s` and came out stamped LEFT.
 *
 * The fixture below is not invented. It is `Single Arm Lateral Raise (Cable)`
 * exactly as `workout_sets` holds it for 2026-08-18: two paired sets, two
 * BILATERAL sets with no side and no pairId, two paired sets. The export
 * reported a left-arm-only session for the middle two.
 */
describe('a mixed unilateral exercise', () => {
  const AUG_18: ExportSet[] = [
    s(5, 15, { side: 'L', pairId: 'zfpf', rpe: 8.5 }),
    s(5, 14, { side: 'R', pairId: 'zfpf', rpe: 8.5 }),
    s(3.75, 16, { rpe: 8.5 }),
    s(3.75, 15, { rpe: 9 }),
    s(3.75, 15, { side: 'L', pairId: 'mbof2', rpe: 9 }),
    s(3.75, 15, { side: 'R', pairId: 'mbof2', rpe: 8.5 }),
  ]

  it('never invents a side for a set the log does not give one', () => {
    const lines = setDetail(AUG_18, 'Single Arm Lateral Raise (Cable)')
    expect(lines[1]).toBe('Set 2: 3.75 kg × 16 (RPE 8.5 — Hard)')
    expect(lines[2]).toBe('Set 3: 3.75 kg × 15 (RPE 9 — Very Hard)')
    // The whole bug in one assertion: neither bilateral set may name a limb.
    expect(lines[1]).not.toMatch(/\bL\b|\bR\b/)
    expect(lines[2]).not.toMatch(/\bL\b|\bR\b/)
  })

  it('still pairs the sets that ARE two-sided, in place', () => {
    const lines = setDetail(AUG_18, 'Single Arm Lateral Raise (Cable)')
    expect(lines[0]).toBe('Set 1: L 5 kg × 15 (RPE 8.5 — Hard) · R 5 kg × 14 (RPE 8.5 — Hard)')
    expect(lines[3]).toBe('Set 4: L 3.75 kg × 15 (RPE 9 — Very Hard) · R 3.75 kg × 15 (RPE 8.5 — Hard)')
  })

  it('numbers four sets, not six and not five', () => {
    // Six rows, four sets of work: a pair is ONE set. The old renderer gave the
    // two bilateral rows their own S-numbers off a separate `solo` counter.
    const lines = setDetail(AUG_18, 'Single Arm Lateral Raise (Cable)')
    expect(lines).toHaveLength(4)
    expect(lines.map((l) => l.split(':')[0])).toEqual(['Set 1', 'Set 2', 'Set 3', 'Set 4'])
  })

  it('treats a bare side with no pair as a plain set, not half of one', () => {
    // A `side` with no `pairId` is an annotation, not evidence of a partner row.
    // Reading it as a pair would leave a permanently half-empty set.
    expect(setDetail([s(5, 15, { side: 'L', rpe: 9 })], 'Single Arm Row'))
      .toEqual(['Set 1: 5 kg × 15 (RPE 9 — Very Hard)'])
  })
})
