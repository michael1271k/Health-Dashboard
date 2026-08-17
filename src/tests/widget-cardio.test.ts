import { describe, it, expect } from 'vitest'
import { cardioBlock, type CardioRow } from '@/lib/widget/derive'
import { ZONE2_MIN_MINUTES, ZONE2_WEEKLY_TARGET, isZone2 } from '@/lib/cardio/zone2'
import { paceMinPerKm } from '@/lib/cardio/metrics'

/**
 * ZONE 2 IS A COUNT OF SESSIONS, NOT A PILE OF MINUTES.
 *
 * `useCardio` grades the week by counting sessions of `ZONE2_MIN_MINUTES` or
 * more against `ZONE2_WEEKLY_TARGET`, and draws one pip per session. The Wave B
 * plan asked for "week Zone-2 minutes" on the widget, which is a different
 * quantity wearing the same words — and a widget disagreeing with the app about
 * a definition is precisely how the streak came to read 22 on one surface and
 * 32 on the other.
 *
 * These tests pin the shape of that disagreement so it cannot come back: three
 * short walks are not a Zone-2 session however many minutes they add up to.
 */

const OPTS = {
  today: '2026-08-16',
  weekStart: '2026-08-10',
  zone2MinMinutes: ZONE2_MIN_MINUTES,
  weekTarget: ZONE2_WEEKLY_TARGET,
  paceOf: paceMinPerKm,
  trendDays: 7,
}

const row = (date: string, duration: number | null, extra: Partial<CardioRow> = {}): CardioRow => ({
  date, kind: 'walk', distance_m: null, duration_min: duration, ...extra,
})

describe('cardioBlock — Zone 2', () => {
  it('counts sessions at or over the minimum, not minutes', () => {
    const block = cardioBlock([
      row('2026-08-11', 25),
      row('2026-08-13', 32),
      row('2026-08-14', 12),   // short — real cardio, not a Zone-2 block
    ], OPTS)

    expect(block.weekSessions).toBe(2)
    // 69 minutes is more than three times the 20-minute minimum. If the count
    // were derived from minutes this would read as three sessions, and the pips
    // in CardioLogger would say two.
    expect(block.weekMinutes).toBe(69)
  })

  it('counts a session exactly at the minimum', () => {
    // The boundary is `>=`, stated once in `isZone2` and asserted here so the
    // route and the hook cannot drift to `>` independently.
    expect(isZone2(ZONE2_MIN_MINUTES)).toBe(true)
    expect(cardioBlock([row('2026-08-12', ZONE2_MIN_MINUTES)], OPTS).weekSessions).toBe(1)
    expect(cardioBlock([row('2026-08-12', ZONE2_MIN_MINUTES - 1)], OPTS).weekSessions).toBe(0)
  })

  it('ships the target rather than letting the widget hardcode a 2', () => {
    expect(cardioBlock([], OPTS).weekTarget).toBe(ZONE2_WEEKLY_TARGET)
  })

  it('ignores sessions outside the week for the count but keeps them for the trend', () => {
    const block = cardioBlock([
      row('2026-08-08', 40),   // previous week
      row('2026-08-11', 25),
    ], OPTS)
    expect(block.weekSessions).toBe(1)
    expect(block.weekMinutes).toBe(25)
    // The trend is a seven-day window of its own; the older session is simply
    // outside it, not excluded by the week boundary.
    expect(block.trend.map((p) => p.d)).toEqual(['2026-08-08', '2026-08-11'])
  })
})

describe('cardioBlock — the last session', () => {
  it('takes the newest session at or before today', () => {
    const block = cardioBlock([
      row('2026-08-11', 25, { kind: 'run' }),
      row('2026-08-15', 30, { kind: 'walk' }),
    ], OPTS)
    expect(block.last?.date).toBe('2026-08-15')
    expect(block.last?.kind).toBe('walk')
  })

  it('never announces a session logged into the future', () => {
    const block = cardioBlock([
      row('2026-08-15', 30, { kind: 'walk' }),
      row('2026-08-20', 30, { kind: 'run' }),   // ahead of `today`
    ], OPTS)
    expect(block.last?.date).toBe('2026-08-15')
  })

  it('is null rather than an empty shell when nothing has been logged', () => {
    // The payload contract: "—" is correct, an invented zero is not.
    expect(cardioBlock([], OPTS).last).toBeNull()
    expect(cardioBlock([], OPTS).weekSessions).toBe(0)
  })

  it('falls back to a truthful kind rather than an empty string', () => {
    const block = cardioBlock([row('2026-08-15', 30, { kind: null })], OPTS)
    expect(block.last?.kind).toBe('Cardio')
  })

  it('takes pace from lib/cardio/metrics rather than recomputing it', () => {
    const block = cardioBlock(
      [row('2026-08-15', 30, { distance_m: 5000 })], OPTS)
    expect(block.last?.paceMinPerKm).toBe(paceMinPerKm(5000, 30))
  })

  it('leaves pace null when there is no distance to divide by', () => {
    const block = cardioBlock([row('2026-08-15', 30, { distance_m: null })], OPTS)
    expect(block.last?.paceMinPerKm).toBeNull()
  })
})

describe('cardioBlock — the trend', () => {
  it('sums a day rather than keeping the longest of it', () => {
    // Two twenty-minute walks are forty minutes of cardio. `max` would be right
    // for two readings of ONE event (which is what two sleep rows are) and is
    // wrong here.
    const block = cardioBlock([
      row('2026-08-14', 20),
      row('2026-08-14', 20),
    ], OPTS)
    expect(block.trend).toEqual([{ d: '2026-08-14', v: 40 }])
    // ...and the session count still sees two sessions, because they were two.
    expect(block.weekSessions).toBe(2)
  })

  it('omits days with no cardio instead of zeroing them', () => {
    const block = cardioBlock([row('2026-08-14', 20)], OPTS)
    expect(block.trend).toHaveLength(1)
  })
})
