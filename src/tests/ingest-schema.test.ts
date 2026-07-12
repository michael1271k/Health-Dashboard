import { formatSleep, formatSleepLong, mlToL } from '@/lib/utils/format'
import { ShortcutPayloadSchema } from '@/lib/ingest/schema'

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

describe('ShortcutPayload flex() coercion', () => {
  it('does not throw on the `sleep_minutes: false` junk (the original crash)', () => {
    const r = ShortcutPayloadSchema.safeParse({ sleep_minutes: false })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.sleep_minutes).toBeUndefined()
  })

  it('coerces "", null, "null", "NaN" to absent fields', () => {
    const r = ShortcutPayloadSchema.safeParse({
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
    const r = ShortcutPayloadSchema.safeParse({ steps: '8200.6', weight: '78.4' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.steps).toBe(8201)
      expect(r.data.weight).toBe(78.4)
    }
  })

  it('maps Shortcut aliases onto canonical keys (incl. the respitory_rate spelling)', () => {
    const r = ShortcutPayloadSchema.safeParse({ respitory_rate: 14.5, heart_rate_variability: 62, vo2_max: 44.1 })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.respiratory_rate).toBe(14.5)
      expect(r.data.hrv).toBe(62)
      expect(r.data.vo2max).toBe(44.1)
    }
  })

  it('converts active_energy from cal to kcal only when clearly cal', () => {
    const big = ShortcutPayloadSchema.safeParse({ active_energy: 523000 })
    const small = ShortcutPayloadSchema.safeParse({ active_energy: 520 })
    expect(big.success && big.data.active_energy).toBe(523)
    expect(small.success && small.data.active_energy).toBe(520)
  })

  it('parses a full mixed payload with junk values without error', () => {
    const r = ShortcutPayloadSchema.safeParse({
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
