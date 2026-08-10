import { describe, it, expect, vi, afterEach } from 'vitest'

const platform = vi.hoisted(() => ({ value: 'web' }))
const calls = vi.hoisted(() => ({ list: [] as Array<{ m: string; args: unknown }> }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform.value, isNativePlatform: () => platform.value !== 'web' },
  registerPlugin: () => ({
    isSupported: async () => { calls.list.push({ m: 'isSupported', args: null }); return { supported: true } },
    start: async (a: unknown) => { calls.list.push({ m: 'start', args: a }); return { started: true } },
    update: async (a: unknown) => { calls.list.push({ m: 'update', args: a }); return { updated: true } },
    end: async (a: unknown) => { calls.list.push({ m: 'end', args: a }); return { ended: true } },
  }),
}))

const {
  restEndsAt, sessionActivityState, formatLastSet,
  startSessionActivity, updateSessionActivity, endSessionActivity, liveActivitySupported,
} = await import('@/lib/native/liveActivity')

afterEach(() => { calls.list = []; platform.value = 'web' })

/**
 * The Live Activity is a decoration on a data-entry screen. Two properties
 * matter more than anything it draws: it must never be able to break logging,
 * and it must not push a countdown.
 */
describe('it cannot break a workout', () => {
  it.each(['web', 'android'])('does nothing at all on %s', async (p) => {
    platform.value = p
    await startSessionActivity('Upper A', sessionActivityState({ exercise: 'Bench', setsDone: 1, setsPlanned: 4, prCount: 0 }))
    await updateSessionActivity(sessionActivityState({ exercise: 'Bench', setsDone: 2, setsPlanned: 4, prCount: 0 }))
    await endSessionActivity(sessionActivityState({ exercise: 'Bench', setsDone: 4, setsPlanned: 4, prCount: 0 }))
    expect(calls.list).toEqual([])
    expect(await liveActivitySupported()).toBe(false)
  })

  it('reaches the plugin on iOS', async () => {
    platform.value = 'ios'
    await startSessionActivity('Upper A', sessionActivityState({ exercise: 'Bench', setsDone: 1, setsPlanned: 4, prCount: 0 }))
    expect(calls.list.map((c) => c.m)).toEqual(['start'])
    expect(calls.list[0].args).toMatchObject({ dayLabel: 'Upper A', exercise: 'Bench' })
  })
})

describe('rest is published as an instant, never a duration', () => {
  /**
   * The widget renders this with `Text(timerInterval:)` so the SYSTEM animates
   * the countdown. Pushing a remaining-seconds integer instead would need one
   * update per second, which ActivityKit throttles almost immediately — the
   * timer freezes and the one thing the Island exists for stops working.
   *
   * A duration would also carry the gap between JS computing it and Swift
   * receiving it straight into the displayed time. An instant cannot drift.
   */
  it('is an absolute epoch-ms time', () => {
    expect(restEndsAt(90, 1_000_000)).toBe(1_090_000)
  })

  it('is null when you are not resting, rather than zero', () => {
    // Zero would render as a countdown that has already finished — a visible
    // "00:00" sitting on the lock screen instead of an honest dash.
    expect(restEndsAt(null)).toBeNull()
    expect(restEndsAt(undefined)).toBeNull()
    expect(restEndsAt(0)).toBeNull()
    expect(restEndsAt(-30)).toBeNull()
    expect(restEndsAt(Number.NaN)).toBeNull()
  })

  it('carries through the state builder', () => {
    const s = sessionActivityState({ exercise: 'Row', setsDone: 2, setsPlanned: 4, prCount: 1, restSeconds: 120, now: 5_000 })
    expect(s.restEndsAt).toBe(125_000)
    expect(s).toMatchObject({ exercise: 'Row', setsDone: 2, setsPlanned: 4, prCount: 1, lastSet: null })
  })
})

describe('the last-set label', () => {
  it('never prints a weight that does not exist', () => {
    // "0kg × 15" on a Hanging Knee Raise states a load of zero as if it were a
    // measurement — the same rule the deck rows follow.
    expect(formatLastSet(0, 15)).toBe('15 reps')
  })

  it('reads seconds for a hold', () => {
    expect(formatLastSet(0, 60, true)).toBe('60s')
  })

  it('keeps quarter-kg microloads exact', () => {
    expect(formatLastSet(80, 8)).toBe('80kg × 8')
    expect(formatLastSet(3.75, 12)).toBe('3.75kg × 12')
  })
})
