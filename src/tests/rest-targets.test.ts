import { describe, it, expect, beforeEach } from 'vitest'
import { ONYX5 } from '@/lib/programs'
import {
  programRestSec, restTargetFor, setRestTarget, hasRestOverride,
  clampRestSec, formatRestTarget, restTargetKey,
  REST_MIN_SEC, REST_MAX_SEC, REST_STEP_SEC,
} from '@/lib/training/restTargets'

/**
 * TARGET rest — the first rest figure the program has ever carried.
 *
 * The app used to MEASURE rest (the gap between two set ticks) and never
 * prescribe it. These assertions guard the prescription: that every lift on the
 * live plan has one, that the day disambiguates a lift appearing on two days,
 * and that an override is an override rather than a frozen copy of the plan.
 */

beforeEach(() => {
  localStorage.clear()
  // The module caches the store on first read, so clearing storage alone leaves
  // the previous test's overrides in memory. The cross-tab `storage` listener is
  // the module's own way of being told the store changed underneath it — using
  // it here keeps the test from reaching into private state.
  window.dispatchEvent(new StorageEvent('storage', { key: 'helix_rest_targets:v1', newValue: null }))
})

describe('the plan carries a target for every lift', () => {
  it('every exercise on every Onyx-5 day has one', () => {
    const missing = ONYX5.days.flatMap((d) =>
      d.exercises.filter((e) => e.restSec == null).map((e) => `${d.key}/${e.name}`))
    expect(missing).toEqual([])
  })

  it('every target is a legal, on-grid value', () => {
    for (const d of ONYX5.days) {
      for (const e of d.exercises) {
        expect(e.restSec).toBeGreaterThanOrEqual(REST_MIN_SEC)
        expect(e.restSec).toBeLessThanOrEqual(REST_MAX_SEC)
        expect((e.restSec ?? 0) % REST_STEP_SEC).toBe(0)
      }
    }
  })

  it('matches the Helix 5.1 table — compounds rest longest', () => {
    expect(programRestSec('Leg Press', 'legs_a', 'onyx5')).toBe(135)
    expect(programRestSec('Incline DB Press', 'cb_a', 'onyx5')).toBe(120)
    expect(programRestSec('Face Pull', 'cb_a', 'onyx5')).toBe(105)
    expect(programRestSec('Reverse Crunch', 'legs_a', 'onyx5')).toBe(75)
  })
})

describe('the DAY disambiguates', () => {
  it('Calf Press rests 1:30 on Legs A and 1:45 on Legs B', () => {
    expect(programRestSec('Calf Press', 'legs_a', 'onyx5')).toBe(90)
    expect(programRestSec('Calf Press', 'legs_b', 'onyx5')).toBe(105)
  })

  it('an unknown day takes the LONGEST — too much rest costs time, not the set', () => {
    expect(programRestSec('Calf Press', null, 'onyx5')).toBe(105)
  })

  it('is null for a movement the plan does not name', () => {
    expect(programRestSec('Zercher Carry', 'cb_a', 'onyx5')).toBeNull()
    expect(restTargetFor('Zercher Carry', 'cb_a', 'onyx5')).toBeNull()
  })
})

describe('overrides', () => {
  it('an edit wins over the plan, and only on its own day', () => {
    setRestTarget('Calf Press', 150, 'legs_a', 'onyx5')
    expect(restTargetFor('Calf Press', 'legs_a', 'onyx5')).toBe(150)
    expect(restTargetFor('Calf Press', 'legs_b', 'onyx5')).toBe(105)
  })

  it('storing the plan\'s own number stores nothing', () => {
    // Otherwise this exercise is frozen at today's value the next time the
    // plan's rest times are revised.
    setRestTarget('Leg Press', 135, 'legs_a', 'onyx5')
    expect(hasRestOverride('Leg Press', 'legs_a', 'onyx5')).toBe(false)
  })

  it('null clears back to the plan', () => {
    setRestTarget('Leg Press', 180, 'legs_a', 'onyx5')
    expect(hasRestOverride('Leg Press', 'legs_a', 'onyx5')).toBe(true)
    setRestTarget('Leg Press', null, 'legs_a', 'onyx5')
    expect(restTargetFor('Leg Press', 'legs_a', 'onyx5')).toBe(135)
  })

  it('clamps and snaps whatever it is handed', () => {
    setRestTarget('Leg Press', 4000, 'legs_a', 'onyx5')
    expect(restTargetFor('Leg Press', 'legs_a', 'onyx5')).toBe(REST_MAX_SEC)
    setRestTarget('Leg Press', 1, 'legs_a', 'onyx5')
    expect(restTargetFor('Leg Press', 'legs_a', 'onyx5')).toBe(REST_MIN_SEC)
  })

  it('keys on the canonical name, so an alias edits the same target', () => {
    expect(restTargetKey('Leg Press', 'legs_a', 'onyx5'))
      .toBe(restTargetKey('leg press', 'legs_a', 'onyx5'))
  })
})

describe('clampRestSec + formatRestTarget', () => {
  it('snaps to the 15-second grid', () => {
    expect(clampRestSec(97)).toBe(90)
    expect(clampRestSec(98)).toBe(105)
  })

  it('reads as a clock above a minute and as seconds below it', () => {
    expect(formatRestTarget(120)).toBe('2:00')
    expect(formatRestTarget(105)).toBe('1:45')
    expect(formatRestTarget(45)).toBe('45s')
  })
})
