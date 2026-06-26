import { describe, it, expect } from 'vitest'
import {
  parseDailyMetrics,
  parseSleepSessions,
  parseBodyComposition,
  parseNutrition,
  parseWater,
  toDate,
} from '@/lib/ingest/parse'
import type { HealthMetricGroup } from '@/lib/ingest/schema'
import { HealthAutoExportPayloadSchema } from '@/lib/ingest/schema'

// Minimal fixture: what Health Auto Export actually sends
const FIXTURE_STEPS: HealthMetricGroup = {
  name: 'step_count',
  units: 'count',
  data: [
    { startDate: '2024-01-15T00:00:00Z', endDate: '2024-01-15T23:59:59Z', value: 8432 },
    { startDate: '2024-01-16T00:00:00Z', endDate: '2024-01-16T23:59:59Z', value: 10201 },
  ],
}

const FIXTURE_ACTIVE_ENERGY: HealthMetricGroup = {
  name: 'active_energy_burned',
  units: 'kcal',
  data: [
    { startDate: '2024-01-15T06:00:00Z', endDate: '2024-01-15T07:00:00Z', value: 320 },
    { startDate: '2024-01-15T10:00:00Z', endDate: '2024-01-15T11:00:00Z', value: 180 },
  ],
}

const FIXTURE_SLEEP: HealthMetricGroup = {
  name: 'sleep_analysis',
  units: 'hr',
  data: [
    {
      uuid: 'sleep-uuid-001',
      startDate: '2024-01-15T22:30:00Z',
      endDate: '2024-01-16T06:30:00Z',
      value: 480,
      sleepStage: 'AsleepCore',
    } as never,
    {
      uuid: 'sleep-uuid-002',
      startDate: '2024-01-16T01:00:00Z',
      endDate: '2024-01-16T02:00:00Z',
      value: 60,
      sleepStage: 'AsleepDeep',
    } as never,
  ],
}

const FIXTURE_WEIGHT: HealthMetricGroup = {
  name: 'body_mass',
  units: 'kg',
  data: [
    {
      uuid: 'weight-uuid-001',
      startDate: '2024-01-15T08:00:00Z',
      endDate: '2024-01-15T08:00:00Z',
      value: 82.5,
    },
  ],
}

const FIXTURE_WATER: HealthMetricGroup = {
  name: 'dietary_water',
  units: 'mL',
  data: [
    {
      uuid: 'water-uuid-001',
      startDate: '2024-01-15T09:00:00Z',
      endDate: '2024-01-15T09:00:00Z',
      value: 500,
      unit: 'mL',
    },
    {
      uuid: 'water-uuid-002',
      startDate: '2024-01-15T14:00:00Z',
      endDate: '2024-01-15T14:00:00Z',
      value: 300,
      unit: 'mL',
    },
  ],
}

describe('toDate', () => {
  it('extracts date from ISO string', () => {
    expect(toDate('2024-01-15T22:30:00Z')).toBe('2024-01-15')
    expect(toDate('2024-01-16T06:30:00+02:00')).toBe('2024-01-16')
  })

  it('handles offset timestamps correctly (UTC-safe)', () => {
    // 00:30 on Jan 16 in +03:00 is 21:30 on Jan 15 UTC
    expect(toDate('2024-01-16T00:30:00+03:00')).toBe('2024-01-15')
  })
})

describe('parseDailyMetrics', () => {
  it('aggregates steps by date', () => {
    const result = parseDailyMetrics([FIXTURE_STEPS])
    expect(result).toHaveLength(2)
    const jan15 = result.find((r) => r.date === '2024-01-15')
    expect(jan15?.steps).toBe(8432)
    const jan16 = result.find((r) => r.date === '2024-01-16')
    expect(jan16?.steps).toBe(10201)
  })

  it('aggregates active calories from multiple samples on same day', () => {
    const result = parseDailyMetrics([FIXTURE_ACTIVE_ENERGY])
    expect(result).toHaveLength(1)
    expect(result[0].activeCal).toBe(500) // 320 + 180
  })

  it('returns empty array for empty metrics', () => {
    expect(parseDailyMetrics([])).toEqual([])
  })

  it('combines steps and calories for same date', () => {
    const result = parseDailyMetrics([FIXTURE_STEPS, FIXTURE_ACTIVE_ENERGY])
    const jan15 = result.find((r) => r.date === '2024-01-15')
    expect(jan15?.steps).toBe(8432)
    expect(jan15?.activeCal).toBe(500)
  })
})

describe('parseSleepSessions', () => {
  it('aggregates sleep stages by night', () => {
    const result = parseSleepSessions([FIXTURE_SLEEP])
    expect(result).toHaveLength(1)
    const session = result[0]
    // Both segments fall on the 2024-01-15 sleep night:
    //   segment 1: 22:30Z→06:30Z (480 min, AsleepCore) → toSleepNightDate hour=22 → 2024-01-15
    //   segment 2: 01:00Z→02:00Z (60 min, AsleepDeep)  → toSleepNightDate hour=1  → 2024-01-15
    expect(session.durationMin).toBe(540)
    expect(session.deepMin).toBe(60)
  })

  it('uses deterministic earliest-start UUID', () => {
    const result = parseSleepSessions([FIXTURE_SLEEP])
    // segment 1 starts at 22:30Z which is earlier than segment 2 at 01:00Z (next calendar day)
    expect(result[0].hkUuid).toBe('sleep-uuid-001')
  })

  it('returns empty array when no sleep data', () => {
    expect(parseSleepSessions([FIXTURE_STEPS])).toEqual([])
  })
})

describe('parseBodyComposition', () => {
  it('parses weight entry', () => {
    const result = parseBodyComposition([FIXTURE_WEIGHT])
    expect(result).toHaveLength(1)
    expect(result[0].weightKg).toBe(82.5)
    expect(result[0].hkUuid).toBe('weight-uuid-001')
    expect(result[0].date).toBe('2024-01-15')
  })

  it('returns empty array when no weight data', () => {
    expect(parseBodyComposition([FIXTURE_STEPS])).toEqual([])
  })

  it('correlates body fat percentage from separate metric group', () => {
    const bodyFatGroup: HealthMetricGroup = {
      name: 'body_fat_percentage',
      units: '%',
      data: [
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T08:00:00Z',
          value: 18.5,
        },
      ],
    }
    const result = parseBodyComposition([FIXTURE_WEIGHT, bodyFatGroup])
    expect(result[0].bodyFatPct).toBeCloseTo(18.5)
  })
})

const FIXTURE_NUTRITION: HealthMetricGroup[] = [
  {
    name: 'dietary_energy',
    units: 'kcal',
    data: [
      { startDate: '2024-01-15T12:00:00Z', endDate: '2024-01-15T12:00:00Z', value: 600 },
      { startDate: '2024-01-15T18:00:00Z', endDate: '2024-01-15T18:00:00Z', value: 800 },
    ],
  },
  {
    name: 'dietary_protein',
    units: 'g',
    data: [
      { startDate: '2024-01-15T12:00:00Z', endDate: '2024-01-15T12:00:00Z', value: 40 },
      { startDate: '2024-01-15T18:00:00Z', endDate: '2024-01-15T18:00:00Z', value: 55 },
    ],
  },
]

describe('parseNutrition', () => {
  it('aggregates calories and protein by date', () => {
    const result = parseNutrition(FIXTURE_NUTRITION)
    expect(result).toHaveLength(1)
    expect(result[0].calories).toBeCloseTo(1400)
    expect(result[0].proteinG).toBeCloseTo(95)
  })

  it('returns empty array for non-nutrition groups', () => {
    expect(parseNutrition([FIXTURE_STEPS])).toEqual([])
  })
})

describe('parseWater', () => {
  it('accumulates water intake with separate uuid entries', () => {
    const result = parseWater([FIXTURE_WATER])
    expect(result).toHaveLength(2) // Two separate entries (different uuids)
    const total = result.reduce((s, r) => s + r.amountMl, 0)
    expect(total).toBe(800)
  })

  it('converts fl oz to ml when unit is fl_oz', () => {
    const flOzGroup: HealthMetricGroup = {
      name: 'dietary_water',
      units: 'fl_oz',
      data: [
        {
          startDate: '2024-01-15T09:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          value: 16.9, // ~500mL
          unit: 'fl_oz',
        },
      ],
    }
    const result = parseWater([flOzGroup])
    expect(result[0].amountMl).toBeCloseTo(499.99, 0) // 16.9 * 29.5735
  })
})

describe('HealthAutoExportPayloadSchema', () => {
  it('validates a minimal valid payload', () => {
    const payload = {
      data: {
        metrics: [{ name: 'step_count', data: [{ startDate: '2024-01-15', endDate: '2024-01-15', value: 100 }] }],
      },
    }
    const result = HealthAutoExportPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('rejects payload missing data.metrics', () => {
    const result = HealthAutoExportPayloadSchema.safeParse({ data: {} })
    expect(result.success).toBe(false)
  })

  it('rejects payload with non-numeric value', () => {
    const result = HealthAutoExportPayloadSchema.safeParse({
      data: {
        metrics: [{ name: 'step_count', data: [{ startDate: '2024-01-15', endDate: '2024-01-15', value: 'not-a-number' }] }],
      },
    })
    expect(result.success).toBe(false)
  })
})
