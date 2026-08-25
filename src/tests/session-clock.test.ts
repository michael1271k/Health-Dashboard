import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  CLOCK_KEY, DEFAULT_DURATION_SEC, MAX_DURATION_SEC, MIN_DURATION_SEC,
  clockIsLive, clockReadingSec, elapsedSec, formatClock, getSessionClock,
  getSessionClockServerSnapshot, isTimerDone, pauseClock, remainingSec, resetClock,
  restartClock, setClockMode, setDurationSec, startClock, subscribeSessionClock,
} from '@/lib/sessions/sessionClock'

/**
 * The session clock stores TIMESTAMPS, not an elapsed count, and that is the
 * whole of its correctness.
 *
 * iOS jetsams a backgrounded WKWebView and Capacitor reloads the page. A stored
 * elapsed value would freeze at whatever it last wrote and resume from there,
 * under-reporting the rest by however long the app was gone — silently, and in
 * the direction that makes you start the next set too early. Derived from the
 * wall clock it cannot: the only thing a reload loses is the interval, and the
 * next tick recomputes the truth.
 *
 * Pause makes that a sum rather than a single subtraction, which is the one
 * thing about the two-mode rewrite that could have broken it — so every
 * wall-clock assertion below is repeated across a pause.
 */

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.useRealTimers() })

describe('the clock, both modes', () => {
  it('is idle before anything starts, and idle on the server', () => {
    expect(getSessionClock().startedAt).toBeNull()
    expect(getSessionClockServerSnapshot().startedAt).toBeNull()
    expect(getSessionClock().durationSec).toBe(DEFAULT_DURATION_SEC)
  })

  it('returns the SAME object until the stored value moves', () => {
    // The infinite-render guard: `useSyncExternalStore` compares by identity,
    // so parsing JSON afresh on every call would report a change forever.
    startClock('stopwatch')
    expect(getSessionClock()).toBe(getSessionClock())
    const before = getSessionClock()
    pauseClock()
    expect(getSessionClock()).not.toBe(before)
  })

  it('measures from the wall clock, so a reload cannot lose the rest', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    startClock('stopwatch')
    // The app dies here. Nothing runs, no interval ticks, no elapsed is written.
    vi.setSystemTime(new Date('2026-08-24T10:01:12Z'))
    // A fresh process reads the same localStorage row.
    const raw = localStorage.getItem(CLOCK_KEY)
    localStorage.clear()
    localStorage.setItem(CLOCK_KEY, raw as string)
    expect(elapsedSec(getSessionClock(), Date.now())).toBe(72)
  })

  it('keeps the banked segments across a reload too', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    startClock('stopwatch')
    vi.setSystemTime(new Date('2026-08-24T10:00:30Z'))
    pauseClock()
    // Ten minutes on the shelf, then resumed and killed mid-segment.
    vi.setSystemTime(new Date('2026-08-24T10:10:00Z'))
    startClock()
    vi.setSystemTime(new Date('2026-08-24T10:10:20Z'))
    const raw = localStorage.getItem(CLOCK_KEY)
    localStorage.clear()
    localStorage.setItem(CLOCK_KEY, raw as string)
    // 30 banked + 20 open. A single re-based start timestamp would say 20.
    expect(elapsedSec(getSessionClock(), Date.now())).toBe(50)
  })

  it('discards a clock left running overnight rather than restoring it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    setDurationSec(90)
    startClock('timer')
    vi.setSystemTime(new Date('2026-08-25T09:00:00Z'))
    const clock = getSessionClock()
    expect(clock.startedAt).toBeNull()
    // The duration it was aiming at is not the stale part, and survives.
    expect(clock.durationSec).toBe(90)
  })

  it('keeps the duration across a reset, because the next rest wants it', () => {
    setDurationSec(120)
    startClock('timer')
    expect(getSessionClock().durationSec).toBe(120)
    resetClock()
    expect(getSessionClock().durationSec).toBe(120)
  })

  it('notifies subscribers, and stops when they unsubscribe', () => {
    let hits = 0
    const off = subscribeSessionClock(() => { hits += 1 })
    startClock('stopwatch')
    pauseClock()
    expect(hits).toBe(2)
    off()
    resetClock()
    expect(hits).toBe(2)
  })

  it('survives a corrupt row instead of throwing on the deck', () => {
    localStorage.setItem(CLOCK_KEY, '{not json')
    expect(getSessionClock().startedAt).toBeNull()
  })

  it('reads m:ss at every length, and grows an hour only when it has one', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(90)).toBe('1:30')
    expect(formatClock(724)).toBe('12:04')
    // A stopwatch left running is the one reading that can pass an hour.
    expect(formatClock(3723)).toBe('1:02:03')
  })

  it('never reports a negative reading when the device clock moves backwards', () => {
    const future = {
      mode: 'stopwatch' as const, startedAt: Date.now() + 5000,
      accumulatedMs: 0, durationSec: 60,
    }
    expect(elapsedSec(future, Date.now())).toBe(0)
  })
})

/**
 * The stopwatch is the old count-up clock with its target removed. Pause and
 * resume are the only new behaviour, and Apple's Stopwatch is the reference:
 * Start after Stop RESUMES, it does not begin again.
 */
describe('stopwatch', () => {
  it('resumes rather than restarts', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    startClock('stopwatch')
    vi.setSystemTime(new Date('2026-08-24T10:00:20Z'))
    pauseClock()
    vi.setSystemTime(new Date('2026-08-24T10:05:00Z'))
    startClock()
    vi.setSystemTime(new Date('2026-08-24T10:05:10Z'))
    expect(elapsedSec(getSessionClock(), Date.now())).toBe(30)
  })

  it('holds its reading while paused instead of running on', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    startClock('stopwatch')
    vi.setSystemTime(new Date('2026-08-24T10:00:20Z'))
    pauseClock()
    vi.setSystemTime(new Date('2026-08-24T10:09:00Z'))
    expect(elapsedSec(getSessionClock(), Date.now())).toBe(20)
    expect(clockIsLive(getSessionClock())).toBe(true)
  })

  it('goes back to nothing on reset', () => {
    startClock('stopwatch')
    resetClock()
    expect(clockIsLive(getSessionClock())).toBe(false)
  })

  it('is never "done" — it has no end to reach', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    startClock('stopwatch')
    vi.setSystemTime(new Date('2026-08-24T10:30:00Z'))
    expect(isTimerDone(getSessionClock(), Date.now())).toBe(false)
  })
})

/**
 * The timer is the half that never existed. Its whole reason for being allowed
 * to count DOWN — which this control's predecessor argued against at length —
 * is that its zero is a fact rather than a lie: you asked for sixty seconds,
 * and sixty seconds have passed.
 */
describe('timer', () => {
  it('reads its full length for the whole of its first second', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    setDurationSec(60)
    startClock('timer')
    // Not 0:59. A countdown that loses a second the instant you press start is
    // the difference between a control that feels responsive and one that does
    // not, and every countdown on the phone already behaves this way.
    expect(remainingSec(getSessionClock(), Date.now())).toBe(60)
    vi.setSystemTime(new Date('2026-08-24T10:00:00.900Z'))
    expect(remainingSec(getSessionClock(), Date.now())).toBe(60)
    vi.setSystemTime(new Date('2026-08-24T10:00:01Z'))
    expect(remainingSec(getSessionClock(), Date.now())).toBe(59)
  })

  it('floors at zero and says so, rather than counting into negatives', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    setDurationSec(60)
    startClock('timer')
    vi.setSystemTime(new Date('2026-08-24T10:02:00Z'))
    expect(remainingSec(getSessionClock(), Date.now())).toBe(0)
    expect(isTimerDone(getSessionClock(), Date.now())).toBe(true)
  })

  it('steps in fifteens and refuses to step outside its bounds', () => {
    setDurationSec(MIN_DURATION_SEC - 30)
    expect(getSessionClock().durationSec).toBe(MIN_DURATION_SEC)
    setDurationSec(MAX_DURATION_SEC + 600)
    expect(getSessionClock().durationSec).toBe(MAX_DURATION_SEC)
  })

  it('resets a countdown that is mid-flight when its length changes', () => {
    // Half of a 60s timer is not half of a 90s timer, and silently re-basing a
    // running countdown is the one thing a clock is not allowed to do.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    setDurationSec(60)
    startClock('timer')
    vi.setSystemTime(new Date('2026-08-24T10:00:30Z'))
    setDurationSec(90)
    expect(getSessionClock().startedAt).toBeNull()
    expect(remainingSec(getSessionClock(), Date.now())).toBe(90)
  })

  it('reports the remainder to the header, where the stopwatch reports elapsed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    setDurationSec(60)
    startClock('timer')
    vi.setSystemTime(new Date('2026-08-24T10:00:10Z'))
    expect(clockReadingSec(getSessionClock(), Date.now())).toBe(50)
    setClockMode('stopwatch')
    startClock()
    vi.setSystemTime(new Date('2026-08-24T10:00:25Z'))
    expect(clockReadingSec(getSessionClock(), Date.now())).toBe(15)
  })

  it('stops the running clock when the tab changes, rather than carrying it over', () => {
    // A countdown you started becoming a stopwatch reading mid-flight is not a
    // thing a clock may do, and leaving both running puts two numbers behind
    // one header button.
    startClock('timer')
    setClockMode('stopwatch')
    const c = getSessionClock()
    expect(c.mode).toBe('stopwatch')
    expect(clockIsLive(c)).toBe(false)
  })

  it('restarts from zero when the next set begins', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    startClock('stopwatch')
    vi.setSystemTime(new Date('2026-08-24T10:00:50Z'))
    restartClock()
    expect(elapsedSec(getSessionClock(), Date.now())).toBe(0)
  })

  it('inherits a v1 rest target as its duration rather than resetting the user', () => {
    // A phone mid-cut has one of these rows in localStorage right now.
    localStorage.setItem(CLOCK_KEY, JSON.stringify({ startedAt: null, targetSec: 120 }))
    expect(getSessionClock().durationSec).toBe(120)
  })
})
