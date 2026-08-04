import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getScheduleOverride, setScheduleOverrideLocal, hydrateScheduleOverrides,
  subscribeScheduleOverrides, scheduleOverridesVersion, REST_OVERRIDE,
} from '@/lib/schedule/overrides'

/**
 * The override cache is an EXTERNAL STORE, not a plain module variable.
 *
 * The distinction is the whole cross-device sync bug: a swap made on the phone
 * was written to Supabase, fetched correctly by the desktop, and dropped into a
 * module-level object that React had no way to observe — so the desktop kept
 * drawing the day it drew at mount. These tests pin the subscription contract
 * that `useSyncExternalStore` depends on.
 */
describe('schedule override store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    hydrateScheduleOverrides([])
  })

  it('notifies subscribers when a DB fetch changes the schedule', () => {
    const seen = vi.fn()
    const off = subscribeScheduleOverrides(seen)
    hydrateScheduleOverrides([{ date: '2026-08-04', day_key: REST_OVERRIDE }])
    expect(seen).toHaveBeenCalledTimes(1)
    expect(getScheduleOverride('2026-08-04')).toBe(REST_OVERRIDE)
    off()
  })

  it('stays silent when the fetch returns what is already cached', () => {
    hydrateScheduleOverrides([{ date: '2026-08-04', day_key: REST_OVERRIDE }])
    const seen = vi.fn()
    const off = subscribeScheduleOverrides(seen)
    // The routine revalidation: same rows, nothing moved.
    hydrateScheduleOverrides([{ date: '2026-08-04', day_key: REST_OVERRIDE }])
    expect(seen).not.toHaveBeenCalled()
    off()
  })

  it('notices a REMOVED row, not just a changed one', () => {
    hydrateScheduleOverrides([
      { date: '2026-08-04', day_key: REST_OVERRIDE },
      { date: '2026-08-05', day_key: 'arms' },
    ])
    const seen = vi.fn()
    const off = subscribeScheduleOverrides(seen)
    // Undo on another device deletes both rows.
    hydrateScheduleOverrides([{ date: '2026-08-04', day_key: REST_OVERRIDE }])
    expect(seen).toHaveBeenCalledTimes(1)
    expect(getScheduleOverride('2026-08-05')).toBeUndefined()
    off()
  })

  it('bumps the version on an optimistic local write and on a clear', () => {
    const v0 = scheduleOverridesVersion()
    setScheduleOverrideLocal('2026-08-06', 'legs_b')
    const v1 = scheduleOverridesVersion()
    expect(v1).toBeGreaterThan(v0)
    setScheduleOverrideLocal('2026-08-06', null)
    expect(scheduleOverridesVersion()).toBeGreaterThan(v1)
    expect(getScheduleOverride('2026-08-06')).toBeUndefined()
  })

  it('does not re-render for a write that changes nothing', () => {
    setScheduleOverrideLocal('2026-08-06', 'legs_b')
    const seen = vi.fn()
    const off = subscribeScheduleOverrides(seen)
    setScheduleOverrideLocal('2026-08-06', 'legs_b')
    expect(seen).not.toHaveBeenCalled()
    off()
  })

  it('unsubscribes cleanly', () => {
    const seen = vi.fn()
    subscribeScheduleOverrides(seen)()
    hydrateScheduleOverrides([{ date: '2026-08-07', day_key: 'arms' }])
    expect(seen).not.toHaveBeenCalled()
  })

  it('survives the DB being unreachable — an empty hydrate clears, it does not throw', () => {
    hydrateScheduleOverrides([{ date: '2026-08-04', day_key: REST_OVERRIDE }])
    expect(() => hydrateScheduleOverrides([])).not.toThrow()
    expect(getScheduleOverride('2026-08-04')).toBeUndefined()
  })
})
