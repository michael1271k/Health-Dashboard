import { describe, it, expect } from 'vitest'
import { sessionDuration, LONG_IDLE_MIN, DEFAULT_REST_TARGET_SEC } from '@/lib/sessions/sessionDuration'

const at = (hhmm: string) => `2026-09-06T${hhmm}:00.000Z`

describe('sessionDuration — the rule', () => {
  it('is the wall clock when nothing was paused', () => {
    expect(sessionDuration({ startedAt: at('10:46'), endedAt: at('11:46') }).minutes).toBe(60)
  })

  it('subtracts the pause', () => {
    const r = sessionDuration({ startedAt: at('10:46'), endedAt: at('12:16'), pausedMs: 30 * 60_000 })
    expect(r.minutes).toBe(60)
    expect(r.pausedMin).toBe(30)
    expect(r.capped).toBe(false)
  })

  it('never goes negative when the pause exceeds the span', () => {
    expect(sessionDuration({ startedAt: at('10:46'), endedAt: at('11:00'), pausedMs: 60 * 60_000 }).minutes).toBe(0)
  })

  it('refuses a finish before the start', () => {
    expect(sessionDuration({ startedAt: at('11:00'), endedAt: at('10:00') }).minutes).toBeNull()
  })

  it('refuses an unparseable instant', () => {
    expect(sessionDuration({ startedAt: 'nope', endedAt: at('11:00') }).minutes).toBeNull()
  })
})

describe('sessionDuration — the long-idle guard', () => {
  it('leaves a normal tail alone', () => {
    const r = sessionDuration({
      startedAt: at('10:46'), endedAt: at('11:50'), lastSetAt: at('11:45'),
    })
    expect(r.capped).toBe(false)
    expect(r.minutes).toBe(64)
  })

  it('counts the work plus one rest when the deck was left open for hours', () => {
    // The Sept 6 shape: an hour of work, then the commit at 17:12.
    const r = sessionDuration({
      startedAt: at('10:46'), endedAt: at('17:12'), lastSetAt: at('11:46'),
    })
    expect(r.capped).toBe(true)
    expect(r.idleMin).toBe(326)
    expect(r.minutes).toBe(60 + DEFAULT_REST_TARGET_SEC / 60)
  })

  it('uses the movement’s own rest target when it has one', () => {
    const r = sessionDuration({
      startedAt: at('10:46'), endedAt: at('17:12'), lastSetAt: at('11:46'), restTargetSec: 105,
    })
    expect(r.minutes).toBe(62)
  })

  it('the threshold is inclusive — exactly 20 minutes is still training', () => {
    const exact = sessionDuration({
      startedAt: at('10:00'), endedAt: at('11:20'), lastSetAt: at('11:00'),
    })
    expect(exact.capped).toBe(false)
    expect(exact.minutes).toBe(80)

    const over = sessionDuration({
      startedAt: at('10:00'), endedAt: at('11:21'), lastSetAt: at('11:00'), restTargetSec: 0,
    })
    expect(over.capped).toBe(true)
    expect(over.idleMin).toBe(LONG_IDLE_MIN + 1)
    expect(over.minutes).toBe(60)
  })

  it('never lengthens a session', () => {
    // A rest target longer than the idle itself must not add time.
    const r = sessionDuration({
      startedAt: at('10:00'), endedAt: at('10:30'), lastSetAt: at('10:00'), restTargetSec: 3600,
    })
    expect(r.minutes).toBeLessThanOrEqual(30)
  })

  it('subtracts a pause that happened before the last set', () => {
    const r = sessionDuration({
      startedAt: at('10:00'), endedAt: at('17:00'), lastSetAt: at('11:30'),
      pausedMs: 30 * 60_000, restTargetSec: 0,
    })
    expect(r.minutes).toBe(60)
  })

  it('ignores a last set outside the session', () => {
    expect(sessionDuration({
      startedAt: at('10:00'), endedAt: at('11:00'), lastSetAt: at('09:00'),
    }).capped).toBe(false)
  })
})
