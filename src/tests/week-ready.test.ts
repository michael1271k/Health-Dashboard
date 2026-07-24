import { describe, it, expect } from 'vitest'
import { isWeekReady } from '@/components/pathfinder/PathfinderTimeline'

/**
 * The gold "ready week" aura. HELIX-5 trains Sun/Mon/Tue/Thu/Fri; Wed and Sat
 * are scheduled rest, so they must never block a week from reading as complete.
 * Week of 2026-07-19 (Sunday) → training days 19, 20, 21, 23, 24.
 */
describe('isWeekReady', () => {
  const WEEK = '2026-07-19'
  const TRAINING = ['2026-07-19', '2026-07-20', '2026-07-21', '2026-07-23', '2026-07-24']

  it('is ready once every training day so far is logged', () => {
    // Friday: all five training days done.
    expect(isWeekReady(WEEK, new Set(TRAINING), '2026-07-24')).toBe(true)
  })

  it('does NOT wait for the rest days', () => {
    // Saturday is a rest day — the week stays ready without a session on it.
    expect(isWeekReady(WEEK, new Set(TRAINING), '2026-07-25')).toBe(true)
  })

  it('is ready mid-week when everything DUE so far is done', () => {
    // Tuesday: only 19/20/21 are due yet.
    expect(isWeekReady(WEEK, new Set(['2026-07-19', '2026-07-20', '2026-07-21']), '2026-07-21')).toBe(true)
  })

  it('is not ready with a missed training day', () => {
    const missedTuesday = TRAINING.filter((d) => d !== '2026-07-21')
    expect(isWeekReady(WEEK, new Set(missedTuesday), '2026-07-24')).toBe(false)
  })

  it('is not ready with nothing logged', () => {
    expect(isWeekReady(WEEK, new Set(), '2026-07-24')).toBe(false)
  })

  it('is not ready before the week has begun (nothing due)', () => {
    expect(isWeekReady(WEEK, new Set(), '2026-07-18')).toBe(false)
  })
})
