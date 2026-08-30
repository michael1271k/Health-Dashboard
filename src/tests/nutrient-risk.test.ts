import { describe, it, expect } from 'vitest'
import { nutrientRisk } from '@/components/dashboard/widgets/FuelWidget'

/**
 * The micros tile used to lead with a hardcoded fibre/sodium/iron headline.
 * Those are reasonable guesses at what usually goes wrong, which is exactly the
 * failure: on the day something else tanks, the tile shows three nutrients that
 * are fine and says nothing about the one that is not.
 */
describe('nutrientRisk — comparable across units and directions', () => {
  it('scores a met floor and an obeyed ceiling as fine', () => {
    expect(nutrientRisk(30, 30, 'floor')).toBe(0)
    expect(nutrientRisk(45, 30, 'floor')).toBe(0)      // over a floor is not "risk"
    expect(nutrientRisk(3000, 3000, 'ceiling')).toBe(0)
    expect(nutrientRisk(1200, 3000, 'ceiling')).toBe(0)
  })

  it('measures a floor by shortfall and a ceiling by overage', () => {
    expect(nutrientRisk(18, 30, 'floor')).toBeCloseTo(0.4)
    expect(nutrientRisk(4200, 3000, 'ceiling')).toBeCloseTo(0.4)
  })

  it('makes milligrams and grams comparable', () => {
    // The whole point. Ranked by RAW magnitude, sodium's shortfall is 1,600 and
    // fibre's is 12, so sodium would lead every day purely for being measured in
    // a smaller unit. As fractions of their own targets, fibre is worse.
    const fibre = nutrientRisk(18, 30, 'floor')          // 0.40
    const potassium = nutrientRisk(1800, 3400, 'floor')  // 0.47
    expect(potassium).toBeGreaterThan(fibre)
    expect(1800 - 3400).toBeLessThan(18 - 30)         // and raw magnitude disagrees
  })

  it('sorts an unmeasured nutrient last rather than treating it as a shortfall', () => {
    // A row reading "—" must never push a real shortfall off a six-cell tile.
    expect(nutrientRisk(null, 30, 'floor')).toBe(-1)
    expect(nutrientRisk(null, 3000, 'ceiling')).toBe(-1)
    expect(nutrientRisk(null, 30, 'floor')).toBeLessThan(nutrientRisk(30, 30, 'floor'))
  })

  it('never divides by a target of zero', () => {
    expect(nutrientRisk(10, 0, 'floor')).toBe(0)
    expect(Number.isFinite(nutrientRisk(10, 0, 'ceiling'))).toBe(true)
  })
})
