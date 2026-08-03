import { describe, it, expect } from 'vitest'
import { formatSet, formatLoad, formatReps, isUnloadedSet } from '@/lib/utils/setFormat'
import { setDetail, type ExportSet } from '@/lib/reports/weeklyExport'

const s = (weightKg: number, reps: number, extra: Partial<ExportSet> = {}): ExportSet =>
  ({ weightKg, reps, side: null, failure: false, pairId: null, ...extra })

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
  it('groups a loaded exercise by load', () => {
    expect(setDetail([s(60, 12), s(60, 11), s(57.5, 10)], 'Hack Squat'))
      .toBe('60kg × 12,11 · 57.5kg × 10')
  })

  it('writes bodyweight work as reps, not as 0 kg', () => {
    expect(setDetail([s(0, 17), s(0, 16)], 'Reverse Crunch')).toBe('17,16 reps')
  })

  it('writes a hold as seconds', () => {
    expect(setDetail([s(0, 58)], 'Side Plank')).toBe('58 sec')
  })

  it('keeps the tags spelled out on unloaded sets too', () => {
    expect(setDetail([s(0, 12, { warmup: true }), s(0, 17)], 'Hanging Knee Raise'))
      .toBe('12 reps (Warmup) · 17 reps')
  })
})
