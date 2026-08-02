import { describe, it, expect } from 'vitest'
import { deriveBodyComp } from '@/lib/body/composition'
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
