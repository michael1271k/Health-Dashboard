import { describe, it, expect } from 'vitest'
import { alignPreviousSets, previousDisplayRows } from '@/lib/sessions/prevAlign'
import type { HistorySet } from '@/lib/hooks/useExerciseSetHistory'

const warm = (kg: number, reps: number): HistorySet => ({ weightKg: kg, reps, setType: 'warmup' })
const work = (kg: number, reps: number): HistorySet => ({ weightKg: kg, reps })

describe('alignPreviousSets', () => {
  /**
   * 2026-08-28's Leg Press, which is the reason this module exists.
   * Aug 21 (legs_b): warm-up 60×15, then 72.5×13 and 72.5×14.
   * Aug 28 opened warm-up + two working sets.
   */
  it('gives the third row a previous instead of a blank', () => {
    const previous = [warm(60, 15), work(72.5, 13), work(72.5, 14)]
    const out = alignPreviousSets([true, false, false], previous)
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual(warm(60, 15))
    expect(out[1]).toEqual(work(72.5, 13))
    // The row that used to be empty.
    expect(out[2]).toEqual(work(72.5, 14))
  })

  it('never shows a working set beside a warm-up', () => {
    const out = alignPreviousSets([true, false], [work(72.5, 13), work(72.5, 14)])
    expect(out[0]).toBeNull()
    expect(out[1]).toEqual(work(72.5, 13))
  })

  it('runs out rather than repeating or borrowing', () => {
    const out = alignPreviousSets([false, false, false], [work(40, 12)])
    expect(out).toEqual([work(40, 12), null, null])
  })

  it('is length- and order-preserving', () => {
    const today = [true, false, false, false]
    expect(alignPreviousSets(today, undefined)).toEqual([null, null, null, null])
  })

  it('counts a warm-up in the history even when today has none', () => {
    const out = alignPreviousSets([false, false], [warm(60, 15), work(72.5, 13), work(72.5, 14)])
    expect(out).toEqual([work(72.5, 13), work(72.5, 14)])
  })
})

describe('previousDisplayRows', () => {
  it('collapses an L/R pair to one row so later sets do not slide', () => {
    const pair: HistorySet[] = [
      { weightKg: 12, reps: 10, side: 'R', pairId: 'p1' },
      { weightKg: 12, reps: 10, side: 'L', pairId: 'p1' },
      work(12, 9),
    ]
    const rows = previousDisplayRows(pair)
    expect(rows).toHaveLength(2)
    expect(rows[0].side).toBe('R')
    expect(rows[1]).toEqual(work(12, 9))
  })

  it('aligns a paired history against a paired deck', () => {
    const previous: HistorySet[] = [
      { weightKg: 12, reps: 10, side: 'R', pairId: 'p1' },
      { weightKg: 12, reps: 10, side: 'L', pairId: 'p1' },
      { weightKg: 12, reps: 9, side: 'R', pairId: 'p2' },
      { weightKg: 12, reps: 9, side: 'L', pairId: 'p2' },
    ]
    const out = alignPreviousSets([false, false], previous)
    expect(out[0]?.reps).toBe(10)
    expect(out[1]?.reps).toBe(9)
  })

  it('is empty for no history', () => {
    expect(previousDisplayRows(undefined)).toEqual([])
    expect(previousDisplayRows([])).toEqual([])
  })
})
