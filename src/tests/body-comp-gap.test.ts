import { describe, it, expect } from 'vitest'
import {
  bodyCompState, missingBodyCompFields, bodyCompGapLabel, bodyCompGapShort,
} from '@/lib/body/compGap'

/**
 * Apple Health delivers `weight_kg` on its own — HealthKit carries bodyweight
 * and nothing else the smart scale measures. Body fat, muscle % and skeletal
 * muscle mass are typed in by hand off the scale's display.
 *
 * So a day can hold a real weigh-in with an empty composition, and that is not
 * the same as no weigh-in. The Body band called both "No weigh-in today".
 */

const FULL = { weight_kg: 82.4, body_fat_pct: 18.2, muscle_mass_kg: 50.3, skeletal_muscle_mass_kg: 26.8 }

describe('bodyCompState', () => {
  it('is "none" with no weight — an untouched day owes nothing', () => {
    expect(bodyCompState(null)).toBe('none')
    expect(bodyCompState({})).toBe('none')
    expect(bodyCompState({ body_fat_pct: 18.2 })).toBe('none')
  })

  it('is "weight-only" when the sync landed and nobody typed the rest', () => {
    expect(bodyCompState({ weight_kg: 82.4 })).toBe('weight-only')
  })

  it('is "partial" when some manual fields are in', () => {
    expect(bodyCompState({ weight_kg: 82.4, body_fat_pct: 18.2 })).toBe('partial')
    expect(bodyCompState({ ...FULL, skeletal_muscle_mass_kg: null })).toBe('partial')
  })

  it('is "complete" with every manual field', () => {
    expect(bodyCompState(FULL)).toBe('complete')
  })

  it('does not count 0 as a reading — 0 % body fat is a missing value', () => {
    expect(bodyCompState({ weight_kg: 82.4, body_fat_pct: 0 })).toBe('weight-only')
    expect(bodyCompState({ weight_kg: 0 })).toBe('none')
  })
})

describe('missingBodyCompFields', () => {
  it('lists what is owed, in entry order', () => {
    expect(missingBodyCompFields({ weight_kg: 82.4 })).toEqual([
      'body_fat_pct', 'muscle_mass_kg', 'skeletal_muscle_mass_kg',
    ])
  })

  it('is empty on a complete day', () => {
    expect(missingBodyCompFields(FULL)).toEqual([])
  })

  it('is empty with no weight — a day with no weigh-in is not an incomplete day', () => {
    expect(missingBodyCompFields({ body_fat_pct: 18.2 })).toEqual([])
  })
})

describe('the labels', () => {
  it('names the gap on a weight-only day', () => {
    expect(bodyCompGapLabel({ weight_kg: 82.4 }))
      .toBe('Weight synced — add body fat, lean soft tissue and skeletal muscle')
  })

  it('says nothing on a complete day, or a day with no weight', () => {
    expect(bodyCompGapLabel(FULL)).toBeNull()
    expect(bodyCompGapLabel(null)).toBeNull()
  })

  /**
   * `muscle_mass_kg` is lean SOFT TISSUE (~50 kg), not skeletal muscle (~27 kg).
   * Calling both "muscle" in one sentence is how the two got conflated before.
   */
  it('never calls lean soft tissue "muscle"', () => {
    const label = bodyCompGapLabel({ weight_kg: 82.4 })!
    expect(label).toContain('lean soft tissue')
    expect(label).toContain('skeletal muscle')
  })

  it('gives the partial day a short hint, not the full sentence', () => {
    expect(bodyCompGapShort({ ...FULL, skeletal_muscle_mass_kg: null })).toBe('add skeletal muscle')
    expect(bodyCompGapLabel({ ...FULL, skeletal_muscle_mass_kg: null })).toBeNull()
  })

  it('the two labels are never both present — one state, one message', () => {
    for (const row of [null, {}, { weight_kg: 82.4 }, { weight_kg: 82.4, body_fat_pct: 18 }, FULL]) {
      expect(Number(!!bodyCompGapLabel(row)) + Number(!!bodyCompGapShort(row))).toBeLessThanOrEqual(1)
    }
  })
})
