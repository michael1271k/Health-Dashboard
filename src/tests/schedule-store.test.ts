import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getScheduleOverride, setScheduleOverrideLocal, hydrateScheduleOverrides,
  subscribeScheduleOverrides, scheduleOverridesVersion, REST_OVERRIDE,
} from '@/lib/schedule/overrides'
import {
  normalizePlanId, setActiveProgramId, setActivePhase, activePhase,
  getActiveProgramId, subscribePlanPrefs,
} from '@/lib/programs'

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

/**
 * The plan/phase preferences are the OTHER half of "what is today's workout",
 * and they had the same defect plus two of their own: the hydrator read a
 * pre-consolidation column (`active_program`, which still holds the dead id
 * "axis5_hybrid") and wrote a fallback localStorage key, so a device that had
 * ever used the plan picker ignored the database entirely — and the phase was
 * never carried across devices at all.
 */
describe('plan preference store', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('rejects a plan id that no longer exists', () => {
    expect(normalizePlanId('axis5_hybrid')).toBeNull()
    expect(normalizePlanId(null)).toBeNull()
    expect(normalizePlanId('')).toBeNull()
  })

  it('migrates a legacy id to the plan that replaced it', () => {
    expect(normalizePlanId('axis4_builder')).toBe('axis4')
    expect(normalizePlanId('axis4_defender')).toBe('axis4')
  })

  it('accepts a live plan id unchanged', () => {
    expect(normalizePlanId('apex51')).toBe('apex51')
    expect(normalizePlanId('ppl')).toBe('ppl')
  })

  it('notifies subscribers when the plan or the phase changes', () => {
    const seen = vi.fn()
    const off = subscribePlanPrefs(seen)
    setActiveProgramId('ppl')
    expect(seen).toHaveBeenCalledTimes(1)
    setActivePhase('bulk')
    expect(seen).toHaveBeenCalledTimes(2)
    expect(activePhase()).toBe('bulk')
    off()
  })

  it('stays silent when the value is already what it is being set to', () => {
    setActiveProgramId('ppl')
    setActivePhase('bulk')
    const seen = vi.fn()
    const off = subscribePlanPrefs(seen)
    setActiveProgramId('ppl')
    setActivePhase('bulk')
    expect(seen).not.toHaveBeenCalled()
    off()
  })

  it('writes the key getActiveProgramId actually reads first', () => {
    setActiveProgramId('ppl')
    expect(window.localStorage.getItem('helix_active_plan')).toBe('ppl')
    // The old hydrator wrote this one instead, which is only a fallback.
    window.localStorage.setItem('helix_active_program', 'apex51')
    expect(getActiveProgramId()).toBe('ppl')
  })
})
