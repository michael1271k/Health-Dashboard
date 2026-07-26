import { describe, it, expect } from 'vitest'
import { deriveBodyComp } from '@/lib/body/composition'

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

  it('computes waist-to-hip ratio', () => {
    const d = deriveBodyComp({ waist_cm: 80, hip_cm: 100 })
    expect(d.waist_hip_ratio).toBe(0.8)
  })

  it('returns only the fields whose inputs are present', () => {
    const d = deriveBodyComp({ muscle_percent: 45 }) // no weight → nothing derivable
    expect(d).toEqual({})
  })

  it('ignores non-finite / null inputs', () => {
    const d = deriveBodyComp({ weight_kg: 80, body_fat_pct: null, hip_cm: 0, waist_cm: 80 })
    expect(d.fat_mass_kg).toBeUndefined()
    expect(d.waist_hip_ratio).toBeUndefined() // hip 0 guarded
  })
})
