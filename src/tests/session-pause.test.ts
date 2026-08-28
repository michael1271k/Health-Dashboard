import { describe, it, expect } from 'vitest'
import {
  MAX_SESSION_SEC, pausedMsAt, sessionActiveSec, sessionElapsedSec, elapsedDurationMin,
} from '@/lib/sessions/sessionElapsed'

/**
 * ── THE PAUSE, PINNED ────────────────────────────────────────────────────────
 *
 * A workout can be paused, and the pause is two stored fields rather than a
 * rewritten `startedAt` — that field is read by `save.ts`, `eraForDate` and the
 * re-entry PR gate as the moment the workout began, and it is still true while
 * you are standing still. Everything that can go wrong with that arrangement is
 * arithmetic, and all of it is invisible until a duration is stored wrong:
 *
 *   · a pause still open has to count from its start to NOW;
 *   · a pause already closed has to count exactly once, from the bank;
 *   · a clock that moves backwards mid-pause must never produce a duration
 *     LONGER than the session, or a negative one;
 *   · the six-hour refusal is about the WALL clock, so a long deck is not
 *     rescued by having been paused for most of it.
 */

const MIN = 60_000

describe('pausedMsAt', () => {
  it('is zero when nothing was ever paused', () => {
    expect(pausedMsAt(undefined, Date.now())).toBe(0)
    expect(pausedMsAt(null, Date.now())).toBe(0)
    expect(pausedMsAt({}, Date.now())).toBe(0)
  })

  it('counts a closed pause exactly once, from the bank', () => {
    expect(pausedMsAt({ pausedMs: 5 * MIN, pausedAt: null }, Date.now())).toBe(5 * MIN)
  })

  it('counts the pause still running, on top of the bank', () => {
    const now = Date.parse('2026-08-28T13:00:00.000Z')
    const pause = { pausedMs: 5 * MIN, pausedAt: '2026-08-28T12:57:00.000Z' }
    expect(pausedMsAt(pause, now)).toBe(8 * MIN)
  })

  /** A clock correction mid-pause must not invent negative paused time. */
  it('never goes backwards on a clock that does', () => {
    const now = Date.parse('2026-08-28T12:00:00.000Z')
    const pause = { pausedMs: 2 * MIN, pausedAt: '2026-08-28T12:30:00.000Z' }
    expect(pausedMsAt(pause, now)).toBe(2 * MIN)
  })

  it('ignores a bank that is negative or unparseable rather than trusting it', () => {
    const now = Date.now()
    expect(pausedMsAt({ pausedMs: -900 }, now)).toBe(0)
    expect(pausedMsAt({ pausedMs: 3 * MIN, pausedAt: 'not a date' }, now)).toBe(3 * MIN)
  })
})

describe('sessionActiveSec', () => {
  const began = '2026-08-28T12:00:00.000Z'
  const at = (iso: string) => Date.parse(iso)

  it('is the plain elapsed time when nothing was paused', () => {
    const now = at('2026-08-28T13:10:00.000Z')
    expect(sessionActiveSec(began, now)).toBe(70 * 60)
    expect(sessionActiveSec(began, now)).toBe(sessionElapsedSec(began, now))
  })

  it('subtracts a closed pause', () => {
    const now = at('2026-08-28T13:10:00.000Z')
    expect(sessionActiveSec(began, now, { pausedMs: 10 * MIN })).toBe(60 * 60)
  })

  it('subtracts a pause that is still open, and stops advancing while it is', () => {
    const pause = { pausedMs: 0, pausedAt: '2026-08-28T12:40:00.000Z' }
    // Paused at the 40-minute mark: the reading is 40 minutes at 12:40 and is
    // still 40 minutes half an hour later.
    expect(sessionActiveSec(began, at('2026-08-28T12:40:00.000Z'), pause)).toBe(40 * 60)
    expect(sessionActiveSec(began, at('2026-08-28T13:10:00.000Z'), pause)).toBe(40 * 60)
  })

  it('never reports more active time than has actually elapsed', () => {
    const now = at('2026-08-28T12:30:00.000Z')
    const active = sessionActiveSec(began, now, { pausedMs: 10 * MIN })
    expect(active).toBeLessThanOrEqual(sessionElapsedSec(began, now) as number)
  })

  it('clamps to zero rather than going negative on an over-long pause', () => {
    const now = at('2026-08-28T12:05:00.000Z')
    expect(sessionActiveSec(began, now, { pausedMs: 60 * MIN })).toBe(0)
  })

  /**
   * The six-hour bound guards against a MIS-DATED draft, which is a failure
   * measured in days. It is applied to the wall clock, before the pause comes
   * off — otherwise a deck opened on Monday could be dragged back inside the
   * bound by claiming to have been paused since Monday.
   */
  it('refuses a mis-dated draft even when the pause would bring it inside the bound', () => {
    const now = at('2026-08-28T12:00:00.000Z')
    const threeDaysAgo = '2026-08-25T12:00:00.000Z'
    expect(sessionActiveSec(threeDaysAgo, now, { pausedMs: 3 * 24 * 60 * MIN })).toBeNull()
  })

  it('refuses the same inputs sessionElapsedSec refuses', () => {
    const now = Date.now()
    expect(sessionActiveSec(null, now)).toBeNull()
    expect(sessionActiveSec('not a date', now)).toBeNull()
    // A draft dated later today — the clock has not reached it yet.
    expect(sessionActiveSec(new Date(now + 60_000).toISOString(), now)).toBeNull()
    expect(sessionActiveSec(new Date(now - (MAX_SESSION_SEC + 60) * 1000).toISOString(), now)).toBeNull()
  })

  it('rounds to the stored minute through elapsedDurationMin', () => {
    const now = at('2026-08-28T13:10:40.000Z')
    // 70m40s of wall clock, ten of them paused → 60m40s of work → 61 minutes.
    expect(elapsedDurationMin(sessionActiveSec(began, now, { pausedMs: 10 * MIN }))).toBe(61)
  })
})
