import { describe, it, expect } from 'vitest'
import { supplementMicros, mergeMicros, doseUnits, SUPPLEMENT_MICROS } from '@/lib/nutrition/supplementMicros'
import { SUPPLEMENT_PROTOCOL, ALL_SUPPLEMENT_KEYS } from '@/lib/supplements'
import { MICRO_TARGETS } from '@/lib/nutrition/microTargets'

describe('supplement micros engine', () => {
  it('credits nothing when nothing is taken', () => {
    expect(supplementMicros([])).toEqual({})
  })

  it('credits the morning stack exactly as labelled', () => {
    expect(supplementMicros(['multivitamin', 'd3k2'])).toEqual({
      vitaminB12: 300, folate: 680, vitaminC: 470, vitaminD: 5000,
    })
  })

  it('sums nutrients shared across items', () => {
    // Magnesium arrives only from the night tablet; vitamin C only from the
    // multivitamin — but both land in one bundle.
    const out = supplementMicros(['multivitamin', 'magnesium'])
    expect(out.vitaminC).toBe(470)
    expect(out.magnesium).toBe(300)
  })

  it('doubles ONLY the multivitamin on a 2-tab day', () => {
    const doses = new Map([['multivitamin', '2 tabs'], ['magnesium', '300 mg']])
    const out = supplementMicros(['multivitamin', 'magnesium'], doses)
    expect(out.vitaminC).toBe(940)
    // The magnesium payload is already the total across its three tablets —
    // multiplying it by the dose string would triple a dose that wasn't tripled.
    expect(out.magnesium).toBe(300)
  })

  it('treats an unparseable dose as one unit', () => {
    expect(doseUnits('multivitamin', undefined)).toBe(1)
    expect(doseUnits('multivitamin', '1 tab')).toBe(1)
    expect(doseUnits('magnesium', '300 mg')).toBe(1)
  })

  it('ignores keys with no payload rather than throwing', () => {
    expect(supplementMicros(['not-a-supplement'])).toEqual({})
  })

  it('adds the stack on top of food without discarding either', () => {
    const merged = mergeMicros({ vitaminC: 60, fiber: 28, iron: null }, { vitaminC: 470, magnesium: 300 })
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
    for (const key of Object.keys(SUPPLEMENT_MICROS)) {
      expect(ALL_SUPPLEMENT_KEYS, `${key} has no protocol item`).toContain(key)
    }
  })

  it('every protocol item declares a payload', () => {
    for (const slot of SUPPLEMENT_PROTOCOL) {
      for (const item of slot.items) {
        expect(SUPPLEMENT_MICROS[item.key], `${item.key} has no micro payload`).toBeDefined()
      }
    }
  })

  it('every micro a supplement credits has a target row to render into', () => {
    const targets = new Set(MICRO_TARGETS.map((m) => m.key))
    for (const payload of Object.values(SUPPLEMENT_MICROS)) {
      for (const micro of Object.keys(payload)) {
        expect(targets, `${micro} has no MICRO_TARGETS entry`).toContain(micro)
      }
    }
  })
})
