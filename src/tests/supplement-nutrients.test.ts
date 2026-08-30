import { describe, it, expect } from 'vitest'
import { supplementNutrients, mergeNutrients, doseUnits, SUPPLEMENT_NUTRIENTS } from '@/lib/nutrition/supplementNutrients'
import { SUPPLEMENT_PROTOCOL, ALL_SUPPLEMENT_KEYS } from '@/lib/supplements'
import { NUTRIENT_TARGETS } from '@/lib/nutrition/nutrientTargets'

describe('supplement nutrients engine', () => {
  it('credits nothing when nothing is taken', () => {
    expect(supplementNutrients([])).toEqual({})
  })

  it('credits the morning stack exactly as labelled', () => {
    expect(supplementNutrients(['multivitamin', 'd3k2'])).toEqual({
      vitaminB12: 300, folate: 680, vitaminC: 470, vitaminD: 5000,
    })
  })

  it('sums nutrients shared across items', () => {
    // Magnesium arrives only from the night tablet; vitamin C only from the
    // multivitamin — but both land in one bundle.
    const out = supplementNutrients(['multivitamin', 'magnesium'])
    expect(out.vitaminC).toBe(470)
    expect(out.magnesium).toBe(300)
  })

  it('scales any COUNT-unit dose (tabs, caps) but never a mass dose', () => {
    const doses = new Map([
      ['multivitamin', '2 tabs'],
      ['omega3', '2 caps'],
      ['magnesium', '300 mg'],
    ])
    const out = supplementNutrients(['multivitamin', 'omega3', 'magnesium'], doses)
    expect(out.vitaminC).toBe(940)  // 470 × 2 tabs
    expect(out.epa).toBe(1000)      // 500 × 2 caps
    expect(out.dha).toBe(500)       // 250 × 2 caps
    // The magnesium payload is already the total across its three tablets —
    // "300 mg" is a mass, not a unit count, so it must stay ×1.
    expect(out.magnesium).toBe(300)
  })

  it('parses the leading count of a count-unit dose, else one unit', () => {
    expect(doseUnits('multivitamin', undefined)).toBe(1)
    expect(doseUnits('multivitamin', '1 tab')).toBe(1)
    expect(doseUnits('multivitamin', '2 tabs')).toBe(2)
    expect(doseUnits('omega3', '2 caps')).toBe(2)
    expect(doseUnits('creatine', '5 g')).toBe(1)     // mass, not a count
    expect(doseUnits('magnesium', '300 mg')).toBe(1) // mass, not a count
    expect(doseUnits('citrulline', '3 g')).toBe(1)   // mass, not a count
  })

  it('ignores keys with no payload rather than throwing', () => {
    expect(supplementNutrients(['not-a-supplement'])).toEqual({})
  })

  it('adds the stack on top of food without discarding either', () => {
    const merged = mergeNutrients({ vitaminC: 60, fiber: 28, iron: null }, { vitaminC: 470, magnesium: 300 })
    expect(merged.vitaminC).toBe(530)
    expect(merged.fiber).toBe(28)
    expect(merged.magnesium).toBe(300)
    expect(merged.iron).toBeUndefined()   // null food value is absent, not zero
  })

  /**
   * The two files are keyed by hand, so a rename in one silently orphans the
   * other — the failure mode is a supplement that quietly credits nothing.
   */
  it('every payload key maps to a real supplement in the protocol', () => {
    for (const key of Object.keys(SUPPLEMENT_NUTRIENTS)) {
      expect(ALL_SUPPLEMENT_KEYS, `${key} has no protocol item`).toContain(key)
    }
  })

  it('every protocol item declares a payload', () => {
    for (const slot of SUPPLEMENT_PROTOCOL) {
      for (const item of slot.items) {
        expect(SUPPLEMENT_NUTRIENTS[item.key], `${item.key} has no micro payload`).toBeDefined()
      }
    }
  })

  it('every micro a supplement credits has a target row to render into', () => {
    const targets = new Set(NUTRIENT_TARGETS.map((m) => m.key))
    for (const payload of Object.values(SUPPLEMENT_NUTRIENTS)) {
      for (const micro of Object.keys(payload)) {
        expect(targets, `${micro} has no NUTRIENT_TARGETS entry`).toContain(micro)
      }
    }
  })
})

/**
 * ── THE ARGUMENT IS TAKEN KEYS, AND IT WAS GIVEN THE OTHER SET ───────────────
 *
 * `useSupplements()` returns the keys you SKIPPED: the protocol is what happens
 * unless you say otherwise, so `supplement_log` only carries a row to record a
 * refusal. `useStackNutrients` bound that result to a variable called `taken`
 * and passed it straight in here.
 *
 * Two failures in one, and both were live on 2026-08-30: on an ordinary day
 * nothing had been skipped, so the set was empty and the whole stack
 * contributed nothing to the Nutrients page — while an item you HAD skipped got
 * its micronutrients credited. The weekly export inverted correctly
 * (`useWeeklyLoop`), which is why the report and the screen disagreed every
 * single day rather than obviously once.
 *
 * These pin the resolution the call site now performs.
 */
describe('the protocol is what happens unless you say otherwise', () => {
  const scheduled = ['multivitamin', 'd3k2', 'omega3', 'magnesium']
  const resolve = (skipped: string[]) =>
    supplementNutrients(scheduled.filter((k) => !skipped.includes(k)))

  it('credits the FULL stack when nothing was skipped', () => {
    // The exact live condition: no rows, empty set, and every dose was taken.
    const out = resolve([])
    expect(Object.keys(out).length).toBeGreaterThan(0)
    expect(out.vitaminC).toBe(470)
    expect(out.magnesium).toBe(300)
    expect(out).toEqual(supplementNutrients(scheduled))
  })

  it('drops exactly what was skipped, and nothing else', () => {
    const out = resolve(['magnesium'])
    expect(out.magnesium).toBeUndefined()
    expect(out.vitaminC).toBe(470)
  })

  it('never credits an item BECAUSE it was skipped', () => {
    // The inverted call did precisely this.
    expect(resolve(['multivitamin']).vitaminC).toBeUndefined()
  })

  it('is empty only when the whole day was refused', () => {
    expect(resolve(scheduled)).toEqual({})
  })
})
