import { describe, it, expect } from 'vitest'
import {
  cardioRecords, axesHeldBy, axisValue, isMinAxis, MIN_PACE_DISTANCE_M, type CardioRow,
} from '@/lib/cardio/cardioPrs'

const row = (o: Partial<CardioRow> & { id: string }): CardioRow => ({
  kind: 'walk', distance_m: null, duration_min: null, ...o,
})

describe('cardio axis values', () => {
  it('scores pace as minutes per km', () => {
    expect(axisValue(row({ id: 'a', distance_m: 5000, duration_min: 30 }), 'pace')).toBe(6)
  })

  it('reads the legacy `kcal` column when `active_kcal` is absent', () => {
    // Every row logged before the full field set has only `kcal`.
    expect(axisValue(row({ id: 'a', kcal: 210 }), 'calories')).toBe(210)
    expect(axisValue(row({ id: 'a', kcal: 210, active_kcal: 180 }), 'calories')).toBe(180)
  })

  it('refuses a pace under the distance floor', () => {
    // A 200m dash for a bus posts a 3:10/km and would own the record forever.
    const sprint = row({ id: 'a', distance_m: 200, duration_min: 0.63 })
    expect(sprint.distance_m).toBeLessThan(MIN_PACE_DISTANCE_M)
    expect(axisValue(sprint, 'pace')).toBeNull()
    // The same effort still counts for nothing on pace but is a real distance.
    expect(axisValue(sprint, 'distance')).toBe(200)
  })

  it('accepts a pace exactly at the floor', () => {
    expect(axisValue(row({ id: 'a', distance_m: 1000, duration_min: 6 }), 'pace')).toBe(6)
  })

  it('treats zero and missing as no contest, not as a record low', () => {
    expect(axisValue(row({ id: 'a', distance_m: 0 }), 'distance')).toBeNull()
    expect(axisValue(row({ id: 'a', duration_min: 0 }), 'duration')).toBeNull()
    expect(axisValue(row({ id: 'a' }), 'calories')).toBeNull()
  })
})

describe('pace is the one MINIMUM axis', () => {
  it('says so', () => {
    expect(isMinAxis('pace')).toBe(true)
    for (const a of ['distance', 'duration', 'calories'] as const) expect(isMinAxis(a)).toBe(false)
  })

  it('awards the FASTEST pace, not the slowest', () => {
    const rows = [
      row({ id: 'slow', distance_m: 5000, duration_min: 40 }),   // 8:00 /km
      row({ id: 'fast', distance_m: 5000, duration_min: 30 }),   // 6:00 /km
    ]
    expect(cardioRecords(rows, 'walk').pace?.id).toBe('fast')
    // …while the same two rows tie on distance, so the earlier one keeps it.
    expect(cardioRecords(rows, 'walk').distance?.id).toBe('slow')
  })
})

describe('records are scoped per kind', () => {
  it('does not let a walk take a run’s distance record', () => {
    const rows = [
      row({ id: 'w', kind: 'walk', distance_m: 8000, duration_min: 90 }),
      row({ id: 'r', kind: 'run', distance_m: 5000, duration_min: 25 }),
    ]
    expect(cardioRecords(rows, 'run').distance?.id).toBe('r')
    expect(cardioRecords(rows, 'walk').distance?.id).toBe('w')
  })

  it('returns nothing for a kind with no rows', () => {
    expect(cardioRecords([row({ id: 'w' })], 'run')).toEqual({})
  })
})

describe('axesHeldBy — what earns a trophy on a row', () => {
  const rows = [
    row({ id: 'a', distance_m: 5000, duration_min: 50, kcal: 300 }),  // longest + most kcal
    row({ id: 'b', distance_m: 3000, duration_min: 15 }),             // fastest
  ]

  it('names every axis a row currently holds', () => {
    expect(axesHeldBy(rows, 'a').sort()).toEqual(['calories', 'distance', 'duration'])
    expect(axesHeldBy(rows, 'b')).toEqual(['pace'])
  })

  it('is standing-record only — a beaten row loses its trophy', () => {
    const beaten = [...rows, row({ id: 'c', distance_m: 9000, duration_min: 60, kcal: 500 })]
    expect(axesHeldBy(beaten, 'a')).toEqual([])
    expect(axesHeldBy(beaten, 'c').sort()).toEqual(['calories', 'distance', 'duration'])
  })

  it('is empty for a row that isn’t there', () => {
    expect(axesHeldBy(rows, 'nope')).toEqual([])
  })

  it('gives a row with nothing logged no trophies at all', () => {
    // An empty row must not win by default just because nothing else competes.
    expect(axesHeldBy([row({ id: 'blank' })], 'blank')).toEqual([])
  })
})
