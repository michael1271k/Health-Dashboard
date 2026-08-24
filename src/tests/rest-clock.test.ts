import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  REST_CLOCK_KEY, getRestClock, getRestClockServerSnapshot, subscribeRestClock,
  startRest, stopRest, setRestTargetSec, restElapsedSec, formatClock,
} from '@/lib/sessions/restClock'

/**
 * The rest clock stores a TIMESTAMP, not an elapsed count, and that is the
 * whole of its correctness.
 *
 * iOS jetsams a backgrounded WKWebView and Capacitor reloads the page. A stored
 * elapsed value would freeze at whatever it last wrote and resume from there,
 * under-reporting the rest by however long the app was gone — silently, and in
 * the direction that makes you start the next set too early. Derived from the
 * wall clock it cannot: the only thing a reload loses is the interval, and the
 * next tick recomputes the truth.
 */

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.useRealTimers() })

describe('restClock', () => {
  it('is idle before anything starts, and idle on the server', () => {
    expect(getRestClock().startedAt).toBeNull()
    expect(getRestClockServerSnapshot().startedAt).toBeNull()
  })

  it('returns the SAME object until the stored value moves', () => {
    // The infinite-render guard: `useSyncExternalStore` compares by identity,
    // so parsing JSON afresh on every call would report a change forever.
    startRest(90)
    expect(getRestClock()).toBe(getRestClock())
    const before = getRestClock()
    stopRest()
    expect(getRestClock()).not.toBe(before)
  })

  it('measures from the wall clock, so a reload cannot lose the rest', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    startRest(90)
    // The app dies here. Nothing runs, no interval ticks, no elapsed is written.
    vi.setSystemTime(new Date('2026-08-24T10:01:12Z'))
    // A fresh process reads the same localStorage row.
    const raw = localStorage.getItem(REST_CLOCK_KEY)
    localStorage.clear()
    localStorage.setItem(REST_CLOCK_KEY, raw as string)
    expect(restElapsedSec(getRestClock(), Date.now())).toBe(72)
  })

  it('discards a clock left running overnight rather than restoring it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    startRest(90)
    vi.setSystemTime(new Date('2026-08-25T09:00:00Z'))
    const clock = getRestClock()
    expect(clock.startedAt).toBeNull()
    // The target it was aiming at is not the stale part, and survives.
    expect(clock.targetSec).toBe(90)
  })

  it('keeps the target across a stop, because the next rest wants it', () => {
    setRestTargetSec(120)
    startRest()
    expect(getRestClock().targetSec).toBe(120)
    stopRest()
    expect(getRestClock().targetSec).toBe(120)
  })

  it('restarting is a new start, not a resume', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T10:00:00Z'))
    startRest(90)
    vi.setSystemTime(new Date('2026-08-24T10:00:50Z'))
    startRest()
    expect(restElapsedSec(getRestClock(), Date.now())).toBe(0)
  })

  it('notifies subscribers, and stops when they unsubscribe', () => {
    let hits = 0
    const off = subscribeRestClock(() => { hits += 1 })
    startRest(60)
    stopRest()
    expect(hits).toBe(2)
    off()
    startRest(60)
    expect(hits).toBe(2)
  })

  it('survives a corrupt row instead of throwing on the deck', () => {
    localStorage.setItem(REST_CLOCK_KEY, '{not json')
    expect(getRestClock().startedAt).toBeNull()
  })

  it('reads m:ss at every length a rest can reach', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(90)).toBe('1:30')
    expect(formatClock(724)).toBe('12:04')
  })

  it('never reports a negative rest when the device clock moves backwards', () => {
    expect(restElapsedSec({ startedAt: Date.now() + 5000, targetSec: 90 }, Date.now())).toBe(0)
  })
})
