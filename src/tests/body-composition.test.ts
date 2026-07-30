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
