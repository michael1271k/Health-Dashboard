import { formatSleep, formatSleepLong, mlToL } from '@/lib/utils/format'
import { IngestPayloadSchema } from '@/lib/ingest/schema'

describe('formatSleep', () => {
  it('formats minutes as "Hh Mm"', () => {
    expect(formatSleep(457)).toBe('7h 37m')
    expect(formatSleep(420)).toBe('7h')
    expect(formatSleep(45)).toBe('45m')
    expect(formatSleep(61)).toBe('1h 1m')
  })
  it('returns em-dash for missing / zero / NaN', () => {
    expect(formatSleep(0)).toBe('—')
    expect(formatSleep(null)).toBe('—')
    expect(formatSleep(undefined)).toBe('—')
    expect(formatSleep(NaN)).toBe('—')
  })
  it('long form spells out hours and minutes', () => {
    expect(formatSleepLong(457)).toBe('7 hours 37 minutes')
    expect(formatSleepLong(60)).toBe('1 hour')
  })
})

describe('mlToL', () => {
  it('converts millilitres to litres', () => {
    expect(mlToL(2500)).toBe('2.5')
    expect(mlToL(null)).toBe('—')
  })
})

describe('IngestPayload flex() coercion', () => {
  it('does not throw on the `sleep_minutes: false` junk (the original crash)', () => {
    const r = IngestPayloadSchema.safeParse({ sleep_minutes: false })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.sleep_minutes).toBeUndefined()
  })

  it('coerces "", null, "null", "NaN" to absent fields', () => {
    const r = IngestPayloadSchema.safeParse({
      blood_oxygen: '', steps: 'NaN', weight: null, bmi: 'null',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.blood_oxygen).toBeUndefined()
      expect(r.data.steps).toBeUndefined()
      expect(r.data.weight).toBeUndefined()
      expect(r.data.bmi).toBeUndefined()
    }
  })

  it('parses numeric strings and rounds integer fields', () => {
    const r = IngestPayloadSchema.safeParse({ steps: '8200.6', weight: '78.4' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.steps).toBe(8201)
      expect(r.data.weight).toBe(78.4)
    }
  })

  it('maps Shortcut aliases onto canonical keys (incl. the respitory_rate spelling)', () => {
    const r = IngestPayloadSchema.safeParse({ respitory_rate: 14.5, heart_rate_variability: 62, vo2_max: 44.1 })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.respiratory_rate).toBe(14.5)
      expect(r.data.hrv).toBe(62)
      expect(r.data.vo2max).toBe(44.1)
    }
  })

  it('converts active_energy from cal to kcal only when clearly cal', () => {
    const big = IngestPayloadSchema.safeParse({ active_energy: 523000 })
    const small = IngestPayloadSchema.safeParse({ active_energy: 520 })
    expect(big.success && big.data.active_energy).toBe(523)
    expect(small.success && small.data.active_energy).toBe(520)
  })

  it('treats a small sleep_minutes value as HOURS (native/Shortcut sends hours)', () => {
    const r = IngestPayloadSchema.safeParse({ sleep_minutes: 7.5 })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.sleep_minutes).toBe(450) // 7.5h → 450 min
  })

  it('keeps a real minutes value as-is and drops implausible sleep (>18h)', () => {
    const ok = IngestPayloadSchema.safeParse({ sleep_minutes: 462 })
    const junk = IngestPayloadSchema.safeParse({ sleep_minutes: 5400 })
    expect(ok.success && ok.data.sleep_minutes).toBe(462)
    expect(junk.success && junk.data.sleep_minutes).toBeUndefined()
  })

  it('accepts native sleep-stage + bed-time fields', () => {
    const r = IngestPayloadSchema.safeParse({
      sleep_minutes: 462, deep_min: 68, rem_min: 96, core_min: 298, awake_min: 12,
      bed_start: '2026-07-18T23:10:00.000Z', bed_end: '2026-07-19T06:52:00.000Z',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.deep_min).toBe(68)
      expect(r.data.rem_min).toBe(96)
      expect(r.data.bed_start).toBe('2026-07-18T23:10:00.000Z')
      expect(r.data.bed_end).toBe('2026-07-19T06:52:00.000Z')
    }
  })

  it('accepts native dietary macros (calories/protein/carbs/fats/water)', () => {
    const r = IngestPayloadSchema.safeParse({ calories: 1934, protein: 170, carbs: 187, fats: 52, water: 2500 })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.calories).toBe(1934)
      expect(r.data.protein).toBe(170)
    }
  })

  it('parses a full mixed payload with junk values without error', () => {
    const r = IngestPayloadSchema.safeParse({
      steps: 8200, water: 2500, sleep_minutes: false, carbs: 180, protein: 175,
      fats: 55, weight: 78.4, lean_mass: 61.2, bmi: 23.1, training_minutes: 70,
      active_energy: 520000, body_fat: 16.2, standing_minutes: '', avg_heart_rate: 78,
      avg_rest_heart_rate: 51, respitory_rate: 14, blood_oxygen: 98,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.sleep_minutes).toBeUndefined()
      expect(r.data.standing_minutes).toBeUndefined()
      expect(r.data.active_energy).toBe(520)
      expect(r.data.avg_rest_heart_rate).toBe(51)
      expect(r.data.respiratory_rate).toBe(14)
    }
  })
})

// ── Back-compat alias + native payload shape ─────────────────────────────────
import { IngestPayloadSchema as Canonical, ShortcutPayloadSchema as Legacy } from '@/lib/ingest/schema'

describe('ingest schema rename', () => {
  it('the legacy alias is the same schema as the canonical export', () => {
    expect(Legacy).toBe(Canonical)
  })
  it('accepts a native HealthKit-shaped payload (steps/hrv/active_energy)', () => {
    const r = Canonical.safeParse({ steps: 8240, hrv: 62, active_energy: 512, avg_rest_heart_rate: 52 })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.steps).toBe(8240)
      expect(r.data.hrv).toBe(62)
    }
  })
})
