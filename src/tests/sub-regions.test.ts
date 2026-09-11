import { describe, it, expect } from 'vitest'
import { DOMS_MUSCLES } from '@/lib/hooks/useRecovery'
import {
  ALL_SUB_REGIONS, JOINTS, JOINTS_BY_GROUP, SIDE_MARK, SORENESS_SIDES, SUB_REGIONS,
  hasSubRegions, subRegionParent, subRegionsOf,
} from '@/lib/body/subRegions'

/**
 * The sub-region vocabulary exists to add detail WITHOUT adding a muscle. These
 * tests pin the two halves of that bargain: the fold down to the ten is total,
 * and the ten never grow.
 */
describe('soreness sub-regions', () => {
  it('folds every sub-region onto exactly one DOMS muscle', () => {
    for (const sub of ALL_SUB_REGIONS) {
      const parent = subRegionParent(sub)
      expect(parent, `${sub} folds nowhere`).not.toBeNull()
      expect(DOMS_MUSCLES).toContain(parent!)
    }
  })

  it('keeps the DOMS vocabulary at ten — a sub-region is never a muscle', () => {
    expect(DOMS_MUSCLES).toHaveLength(10)
    for (const sub of ALL_SUB_REGIONS) {
      expect(DOMS_MUSCLES, `${sub} leaked into DOMS_MUSCLES`).not.toContain(sub)
    }
  })

  it('only declares sub-regions for real DOMS muscles', () => {
    for (const parent of Object.keys(SUB_REGIONS)) {
      expect(DOMS_MUSCLES).toContain(parent)
    }
  })

  it('has no duplicate sub-region name across parents', () => {
    // Two parents claiming 'Lats' would make `subRegionParent` answer by
    // declaration order — a silent mis-attribution rather than an error.
    expect(new Set(ALL_SUB_REGIONS).size).toBe(ALL_SUB_REGIONS.length)
  })

  it('answers nothing for a name that is not a sub-region', () => {
    expect(subRegionParent('')).toBeNull()
    expect(subRegionParent('Quads')).toBeNull()      // a muscle, not a sub-region
    expect(subRegionParent('Abductors')).toBe('Inner thighs')
  })

  it('gives an empty list, never null, for an undivided muscle', () => {
    expect(hasSubRegions('Quads')).toBe(false)
    expect(subRegionsOf('Quads')).toEqual([])
    expect(subRegionsOf('Back')).toContain('Erectors')
  })

  it('orders the flat list by DOMS display order', () => {
    // `Back` precedes `Arms` in DOMS_MUSCLES, so its sub-regions come first —
    // the export and the sheet both render in this order.
    expect(ALL_SUB_REGIONS.indexOf('Traps')).toBeLessThan(ALL_SUB_REGIONS.indexOf('Biceps'))
  })
})

describe('sides', () => {
  it('marks only the lateral ones, so a bilateral token is unchanged', () => {
    expect(SORENESS_SIDES).toEqual(['both', 'left', 'right'])
    expect(SIDE_MARK.both).toBe('')
    expect(SIDE_MARK.left).toBe('L')
    expect(SIDE_MARK.right).toBe('R')
  })
})

describe('joints', () => {
  it('is a vocabulary of its own — never a muscle or a sub-region', () => {
    for (const j of JOINTS) {
      expect(DOMS_MUSCLES).not.toContain(j)
      expect(ALL_SUB_REGIONS).not.toContain(j)
    }
  })

  it('offers every joint in exactly one group, so none is unreachable', () => {
    const offered = Object.values(JOINTS_BY_GROUP).flat()
    expect([...offered].sort()).toEqual([...JOINTS].sort())
    expect(new Set(offered).size).toBe(JOINTS.length)
  })
})
