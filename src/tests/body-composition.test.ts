import { describe, it, expect } from 'vitest'
import { deriveBodyComp, whrBand } from '@/lib/body/composition'
import { mergeBodyTrend, type BodyTrendRow } from '@/lib/hooks/useCharts'
import { mergeBodyComposition } from '@/components/charts/BodyCompositionChart'

describe('deriveBodyComp — Weight × % → mass', () => {
  it('computes muscle / water / fat / bone masses from percentages', () => {
    const d = deriveBodyComp({
      weight_kg: 80,
      body_fat_pct: 15,
      muscle_percent: 45,
      water_percent: 60,
      bone_mineral: 4,
    })
    expect(d.fat_mass_kg).toBe(12)        // 80 × 0.15
    expect(d.muscle_mass_kg).toBe(36)     // 80 × 0.45
    expect(d.water_mass_kg).toBe(48)      // 80 × 0.60
    expect(d.bone_mineral_kg).toBe(3.2)   // 80 × 0.04
    expect(d.fat_free_mass_kg).toBe(68)   // 80 × (1 − 0.15)
  })

  it('derives protein from the fat-free compartment when no protein % is given', () => {
    const d = deriveBodyComp({ weight_kg: 80, body_fat_pct: 15, water_percent: 60, bone_mineral: 4 })
    // FFM 68 − water 48 − mineral 3.2 = 16.8
    expect(d.protein_mass_kg).toBe(16.8)
  })

  it('uses an explicit protein % when provided', () => {
    const d = deriveBodyComp({ weight_kg: 80, protein_percent: 20 })
    expect(d.protein_mass_kg).toBe(16)    // 80 × 0.20
  })

  it('returns only the fields whose inputs are present', () => {
    const d = deriveBodyComp({ muscle_percent: 45 }) // no weight → nothing derivable
    expect(d).toEqual({})
  })

  it('ignores non-finite / null inputs', () => {
    const d = deriveBodyComp({ weight_kg: 80, body_fat_pct: null })
    expect(d.fat_mass_kg).toBeUndefined()
  })

  // Circumference is NOT tracked: waist_cm / hip_cm / waist_hip_ratio were
  // purged from the engine, the UI and the DB. This guards the removal.
  it('never derives a waist-to-hip ratio', () => {
    const d = deriveBodyComp({ weight_kg: 80, body_fat_pct: 18 } as Parameters<typeof deriveBodyComp>[0])
    expect('waist_hip_ratio' in d).toBe(false)
  })
})

/**
 * The two mergers were exported "so the precedence rule is testable" and then
 * never tested. Between them they carried the muscle-mass / fat-free-mass
 * conflation all the way from the DB to the chart, so they get coverage built
 * from the real 2026-07-21 → 07-23 boundary that produced the phantom +2.6 kg.
 */
describe('mergeBodyTrend — union of the two body tables', () => {
  const row = (date: string, o: Partial<BodyTrendRow> = {}): BodyTrendRow => ({
    date, weight_kg: 65, body_fat_pct: null, muscle_mass_kg: null, fat_free_mass_kg: null, ...o,
  })

  it('keeps muscle mass and fat-free mass as SEPARATE fields', () => {
    const out = mergeBodyTrend([], [row('2026-07-23', { muscle_mass_kg: 50.49, fat_free_mass_kg: 53.35 })])
    expect(out[0].muscle_mass_kg).toBe(50.49)
    expect(out[0].fat_free_mass_kg).toBe(53.35)
  })

  it('lets the ledger overwrite daily_logs per field, not per row', () => {
    const out = mergeBodyTrend(
      [row('2026-07-23', { weight_kg: 64.9, muscle_mass_kg: 50.49 })],
      [row('2026-07-23', { weight_kg: 64.9, body_fat_pct: 17.8 })],
    )
    expect(out).toHaveLength(1)
    expect(out[0].body_fat_pct).toBe(17.8)   // only daily_logs had it
    expect(out[0].muscle_mass_kg).toBe(50.49) // only the ledger had it
  })

  it('drops sub-50kg readings entirely — scale artifacts, not light days', () => {
    expect(mergeBodyTrend([], [row('2026-07-23', { weight_kg: 3.2 })])).toEqual([])
  })

  it('returns rows in date order regardless of input order', () => {
    const out = mergeBodyTrend([], [row('2026-07-25'), row('2026-07-15'), row('2026-07-21')])
    expect(out.map((r) => r.date)).toEqual(['2026-07-15', '2026-07-21', '2026-07-25'])
  })
})

describe('mergeBodyComposition — one series per definition', () => {
  const kg = (v: number | null) => v
  const trend = (date: string, o: Partial<BodyTrendRow> = {}): BodyTrendRow => ({
    date, weight_kg: 65, body_fat_pct: null, muscle_mass_kg: null, fat_free_mass_kg: null, ...o,
  })

  it('does NOT step when the source changes mid-week', () => {
    // The live bug: 07-21 was a manual InBody entry (muscle %), 07-23 a
    // HealthKit sync (fat-free). One `lean` series jumped 50.5 → 53.3 and read
    // as lean-mass gain during a cut. Each series must move on its own scale.
    const pts = mergeBodyComposition([
      trend('2026-07-21', { weight_kg: 64.8, body_fat_pct: 17.8, muscle_mass_kg: 50.48 }),
      trend('2026-07-23', { weight_kg: 64.9, body_fat_pct: 17.8, muscle_mass_kg: 50.49 }),
    ], [], kg)
    expect(pts.map((p) => p.muscleMass)).toEqual([50.48, 50.49])
    // Fat-free is computed live here (weight − fat), so it carries float noise
    // the stored column doesn't; the point is the ~0.08 step, not the decimals.
    expect(pts[0].fatFreeMass).toBeCloseTo(53.27, 2)
    expect(pts[1].fatFreeMass).toBeCloseTo(53.35, 2)
    // The two never collapse into one another.
    expect(pts.every((p) => p.fatFreeMass! > p.muscleMass!)).toBe(true)
  })

  it('leaves muscle mass NULL when muscle % was never measured', () => {
    // 2026-07-17 and 07-20: HealthKit gave weight + body fat and nothing else.
    // Borrowing the fat-free number here is exactly how the drift started.
    const pts = mergeBodyComposition([trend('2026-07-17', { weight_kg: 65.5, body_fat_pct: 18 })], [], kg)
    expect(pts[0].muscleMass).toBeNull()
    expect(pts[0].fatFreeMass).toBe(53.71)
  })

  it('falls back to a stored fat-free reading when body fat is missing', () => {
    const pts = mergeBodyComposition([trend('2026-07-17', { body_fat_pct: null, fat_free_mass_kg: 53.7 })], [], kg)
    expect(pts[0].fatFreeMass).toBe(53.7)
    expect(pts[0].fatMass).toBeNull()
  })

  it('joins the detail table by date without disturbing the masses', () => {
    const pts = mergeBodyComposition(
      [trend('2026-07-23', { weight_kg: 64.9, body_fat_pct: 17.8, muscle_mass_kg: 50.49 })],
      [{ date: '2026-07-23', water_percent: 60.5, muscle_percent: 77.8, visceral_fat: 6, body_fat_pct: 17.8 }],
      kg,
    )
    expect(pts[0].musclePct).toBe(77.8)
    expect(pts[0].muscleMass).toBe(50.49)   // the MASS, not the percent
  })
})

/**
 * TAPE MEASUREMENTS ARE PURGED. Nothing in Helix is measured by hand — every
 * body number comes off the scale or out of HealthKit. These guard the removal
 * so `waist_cm` / `hip_cm` cannot creep back a third time.
 */
describe('no tape measurements', () => {
  it('ignores circumference inputs entirely, and derives no ratio from them', () => {
    const d = deriveBodyComp({ weight_kg: 64.2, body_fat_pct: 17.3, waist_cm: 80, hip_cm: 95 } as Parameters<typeof deriveBodyComp>[0])
    expect('waist_hip_ratio' in d).toBe(false)
    expect('waist_cm' in d).toBe(false)
    expect('hip_cm' in d).toBe(false)
    // …and the masses are unaffected by their presence.
    expect(d.fat_mass_kg).toBe(11.11)
  })

  it('derives no ratio field of any name', () => {
    const d = deriveBodyComp({ weight_kg: 64.2, body_fat_pct: 17.3, muscle_percent: 78.3 })
    expect(Object.keys(d).some((k) => k.includes('ratio'))).toBe(false)
  })
})

/**
 * The ratio Helix DOES track is `estimated_waist_to_hip_ratio` — one float the
 * Xiaomi scale computes and reports. Entered, never derived; only the RISK BAND
 * is computed here.
 */
describe('the scale’s waist-to-hip ratio', () => {
  it('bands on the WHO male thresholds: <0.90 low, <1.00 moderate, else high', () => {
    expect(whrBand(0.84)).toBe('low')
    expect(whrBand(0.899)).toBe('low')
    expect(whrBand(0.90)).toBe('moderate')
    expect(whrBand(0.99)).toBe('moderate')
    expect(whrBand(1.00)).toBe('high')
  })

  it('uses the female thresholds when asked', () => {
    expect(whrBand(0.79, 'female')).toBe('low')
    expect(whrBand(0.82, 'female')).toBe('moderate')
    expect(whrBand(0.86, 'female')).toBe('high')
  })
})

/**
 * Skeletal muscle mass is ENTERED. `muscle_mass_kg` (weight × muscle%) is lean
 * SOFT TISSUE — ~50 kg where the scale reports ~27 kg of skeletal muscle — and
 * no percentage in this input can produce the second number.
 */
describe('skeletal muscle mass', () => {
  it('is never derived, however complete the entry', () => {
    const d = deriveBodyComp({
      weight_kg: 64.2, body_fat_pct: 17.3, muscle_percent: 78.3,
      water_percent: 57.4, bone_mineral: 4.4, protein_percent: 20.1,
    })
    expect('skeletal_muscle_mass_kg' in d).toBe(false)
  })

  it('still reports lean soft tissue correctly — the number that looked wrong', () => {
    // 64.2 × 78.3% = 50.27. Arithmetically right; it was only ever mislabelled.
    expect(deriveBodyComp({ weight_kg: 64.2, muscle_percent: 78.3 }).muscle_mass_kg).toBe(50.27)
  })
})
