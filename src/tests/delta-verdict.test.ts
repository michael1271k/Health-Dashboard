import { describe, it, expect } from 'vitest'
import { deltaVerdict } from '@/lib/body/deltaVerdict'

/**
 * −0.3 kg is a win mid-cut and a failure mid-bulk. These pin the three
 * asymmetries that make the rule more than "down is green".
 */
describe('deltaVerdict', () => {
  describe('weight — the only metric whose direction flips with the phase', () => {
    it('reads a loss as progress on a cut and a problem on a bulk', () => {
      expect(deltaVerdict('weight', -0.3, 'cut')).toBe('good')
      expect(deltaVerdict('weight', -0.3, 'bulk')).toBe('bad')
    })

    it('reads a gain the other way round', () => {
      expect(deltaVerdict('weight', +0.3, 'cut')).toBe('bad')
      expect(deltaVerdict('weight', +0.3, 'bulk')).toBe('good')
    })
  })

  describe('muscle — never reinterpreted by phase', () => {
    it('is bad to lose even on a cut, where the excuse would be easiest', () => {
      expect(deltaVerdict('muscle', -0.2, 'cut')).toBe('bad')
      expect(deltaVerdict('muscle', -0.2, 'bulk')).toBe('bad')
      expect(deltaVerdict('muscle', -0.2, 'maintenance')).toBe('bad')
    })

    it('is good to gain in every phase', () => {
      for (const p of ['cut', 'bulk', 'maintenance'] as const) {
        expect(deltaVerdict('muscle', +0.2, p)).toBe('good')
      }
    })

    it('ignores the maintenance dead band — muscle movement is never noise', () => {
      expect(deltaVerdict('muscle', -0.1, 'maintenance')).toBe('bad')
    })
  })

  describe('fat', () => {
    it('is good to lose in every phase, bulk included', () => {
      for (const p of ['cut', 'bulk', 'maintenance'] as const) {
        expect(deltaVerdict('fat', -0.4, p)).toBe('good')
      }
    })

    it('is NEUTRAL to gain on a bulk — the price of the surplus, not a win', () => {
      expect(deltaVerdict('fat', +0.4, 'bulk')).toBe('neutral')
    })

    it('is bad to gain on a cut', () => {
      expect(deltaVerdict('fat', +0.4, 'cut')).toBe('bad')
    })
  })

  describe('water — information, not an outcome', () => {
    it('is neutral whichever way it moves, in every phase', () => {
      for (const p of ['cut', 'bulk', 'maintenance'] as const) {
        expect(deltaVerdict('water', +1.2, p)).toBe('neutral')
        expect(deltaVerdict('water', -1.2, p)).toBe('neutral')
      }
    })
  })

  describe('maintenance dead band', () => {
    it('calls small weight movement neutral so a flat week stops flickering', () => {
      expect(deltaVerdict('weight', +0.4, 'maintenance')).toBe('neutral')
      expect(deltaVerdict('weight', -0.4, 'maintenance')).toBe('neutral')
    })

    it('judges outside the band — drifting up is how maintenance fails', () => {
      expect(deltaVerdict('weight', +0.6, 'maintenance')).toBe('bad')
      expect(deltaVerdict('weight', -0.6, 'maintenance')).toBe('good')
    })

    it('uses a tighter band for fat than for weight', () => {
      expect(deltaVerdict('fat', +0.2, 'maintenance')).toBe('neutral')
      expect(deltaVerdict('fat', +0.4, 'maintenance')).toBe('bad')
    })
  })

  describe('noise and nonsense', () => {
    it('treats an unchanged reading as neutral, not as a tiny win', () => {
      expect(deltaVerdict('weight', 0, 'cut')).toBe('neutral')
      expect(deltaVerdict('weight', 0.001, 'cut')).toBe('neutral')
    })

    it('never colours a NaN', () => {
      expect(deltaVerdict('weight', NaN, 'cut')).toBe('neutral')
      expect(deltaVerdict('muscle', Infinity, 'bulk')).toBe('neutral')
    })
  })
})
