import { describe, it, expect } from 'vitest'
import { monthActivitySets, type MonthActivity } from '@/lib/hooks/useWeekly'

/**
 * Regression guard for the Momentum cold-open crash:
 *   "T.workoutDates.has is not a function"
 *
 * The query cache persists to localStorage as JSON. A `Set` has no JSON
 * representation — it dehydrates to `{}` and rehydrates as a plain object with
 * no `.has()`. `useMonthActivity` returned `{ workoutDates: Set, dataDates: Set }`,
 * so the calendar crashed on the first render after any cold launch.
 */
describe('month activity survives the persistence round-trip', () => {
  const payload: MonthActivity = {
    workoutDates: ['2026-07-27', '2026-07-29'],
    dataDates: ['2026-07-28'],
  }

  it('is plain JSON — no Set/Map anywhere in the payload', () => {
    const restored = JSON.parse(JSON.stringify(payload)) as MonthActivity
    expect(restored).toEqual(payload)
    expect(Array.isArray(restored.workoutDates)).toBe(true)
    expect(Array.isArray(restored.dataDates)).toBe(true)
  })

  it('still gives O(1) lookups after the round-trip', () => {
    const restored = JSON.parse(JSON.stringify(payload)) as MonthActivity
    const sets = monthActivitySets(restored)
    expect(sets.workouts.has('2026-07-27')).toBe(true)
    expect(sets.workouts.has('2026-07-28')).toBe(false)
    expect(sets.data.has('2026-07-28')).toBe(true)
  })

  it('survives undefined data (query not resolved yet)', () => {
    const sets = monthActivitySets(undefined)
    expect(sets.workouts.has('2026-07-27')).toBe(false)
    expect(sets.data.size).toBe(0)
  })

  // The exact blob an older build left in localStorage: Sets serialized to `{}`.
  // `new Set({})` throws "object is not iterable", so this must be guarded.
  it('survives a legacy cache blob where the Sets serialized to {}', () => {
    const legacy = JSON.parse(JSON.stringify({
      workoutDates: new Set(['2026-07-27']),
      dataDates: new Set(['2026-07-28']),
    })) as unknown as MonthActivity
    expect(legacy.workoutDates).toEqual({})           // this is the poison
    expect(() => monthActivitySets(legacy)).not.toThrow()
    expect(monthActivitySets(legacy).workouts.size).toBe(0)
  })
})

/**
 * The persister's own guard. It used to check only the TOP-level value, which
 * is why an object *containing* Sets was happily written to localStorage.
 * Mirrors src/components/providers/QueryProvider.tsx.
 */
function isJsonSafe(data: unknown, depth = 3): boolean {
  if (data instanceof Map || data instanceof Set) return false
  if (depth <= 0 || data === null || typeof data !== 'object') return true
  if (Array.isArray(data)) return data.every((v) => isJsonSafe(v, depth - 1))
  return Object.values(data as Record<string, unknown>).every((v) => isJsonSafe(v, depth - 1))
}

describe('isJsonSafe rejects nested Map/Set, not just top-level', () => {
  it('rejects a bare Set or Map (the original behaviour)', () => {
    expect(isJsonSafe(new Set(['a']))).toBe(false)
    expect(isJsonSafe(new Map([['a', 1]]))).toBe(false)
  })

  it('rejects an object CONTAINING Sets — the case that shipped the crash', () => {
    expect(isJsonSafe({ workoutDates: new Set(['a']), dataDates: new Set<string>() })).toBe(false)
  })

  it('rejects a Set nested inside an array', () => {
    expect(isJsonSafe([{ tags: new Set(['a']) }])).toBe(false)
  })

  it('accepts ordinary JSON payloads', () => {
    expect(isJsonSafe({ workoutDates: ['a'], dataDates: [] })).toBe(true)
    expect(isJsonSafe([{ date: '2026-07-29', score: 95, finalized: true }])).toBe(true)
    expect(isJsonSafe(null)).toBe(true)
    expect(isJsonSafe('a string')).toBe(true)
  })
})
