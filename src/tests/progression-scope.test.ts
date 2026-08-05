import { describe, it, expect } from 'vitest'
import { scopeToDay } from '@/components/command-center/ProgressionAlerts'

/**
 * The Smart-Coach queue is plan-wide by design — the Session Deck wants every
 * lift. The banner is not: a Legs B cue on an Upper A morning is an instruction
 * you cannot act on, and a dozen of them is a list you stop reading.
 */
const QUEUE = [
  { name: 'Hack Squat', dayKey: 'legs_b' },
  { name: 'Chest Press', dayKey: 'cb_a' },
  { name: 'Leg Press', dayKey: 'legs_b' },
  { name: 'Lat Pulldown', dayKey: 'cb_a' },
]

describe('scopeToDay', () => {
  it('keeps only the scheduled day’s lifts', () => {
    expect(scopeToDay(QUEUE, 'legs_b').map((a) => a.name)).toEqual(['Hack Squat', 'Leg Press'])
  })

  it('returns nothing when the day has no lifts due — the banner then hides', () => {
    expect(scopeToDay(QUEUE, 'arms')).toEqual([])
  })

  it('follows a SWAP, because the caller passes the resolved day key', () => {
    // Swapping today to Legs B must move the cues with it, not keep Upper A's.
    expect(scopeToDay(QUEUE, 'cb_a').map((a) => a.name)).toEqual(['Chest Press', 'Lat Pulldown'])
    expect(scopeToDay(QUEUE, 'legs_b').map((a) => a.name)).toEqual(['Hack Squat', 'Leg Press'])
  })

  it('keeps EVERYTHING when the day has no key — the PPL era', () => {
    // Legacy dates resolve to a bare label. Every alert carries a Helix dayKey,
    // so filtering there would empty the widget rather than scope it.
    expect(scopeToDay(QUEUE, null)).toHaveLength(4)
    expect(scopeToDay(QUEUE, undefined)).toHaveLength(4)
    expect(scopeToDay(QUEUE, '')).toHaveLength(4)
  })

  it('does not mutate or alias the input queue', () => {
    const out = scopeToDay(QUEUE, null)
    expect(out).not.toBe(QUEUE)
    expect(QUEUE).toHaveLength(4)
  })

  it('drops alerts with a null dayKey once a day IS scoped', () => {
    // A keyless alert belongs to no day, so it cannot belong to this one.
    const mixed = [...QUEUE, { name: 'Orphan', dayKey: null }]
    expect(scopeToDay(mixed, 'legs_b').map((a) => a.name)).toEqual(['Hack Squat', 'Leg Press'])
  })
})
