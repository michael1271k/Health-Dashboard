import { describe, it, expect } from 'vitest'
import { biggestChange, type WeekTotals } from '@/lib/dashboard/weekSoFar'

/**
 * "The Week So Far" replaced a card that listed four weekly means — every one
 * of which the BioStrips above it already showed. Its one claim is that it
 * names ONE change: the largest.
 *
 * It used to make a second claim — that the directive line it printed was
 * retrieved from a pasted report rather than generated — and that whole
 * mechanism is gone. Retrieval was never the problem; putting a tolerant
 * parser's best guess at hand-written prose on the dashboard as fact was.
 */

const week = (over: Partial<WeekTotals> = {}): WeekTotals => ({
  volumeKg: 20000, sessions: 4, sleepMin: 420, score: 80, ...over,
})

describe('biggestChange', () => {
  it('names the largest relative move, not a fixed favourite', () => {
    const c = biggestChange(week({ volumeKg: 23000 }), week())!
    expect(c.label).toBe('Tonnage')
    expect(c.text).toBe('+15%')
    expect(c.good).toBe(true)
  })

  it('lets sleep win when sleep is what actually moved', () => {
    const c = biggestChange(week({ volumeKg: 20200, sleepMin: 340 }), week())!
    expect(c.label).toBe('Sleep')
    expect(c.direction).toBe('down')
    expect(c.good).toBe(false)
  })

  it('treats less sleep as bad and more tonnage as good', () => {
    expect(biggestChange(week({ sleepMin: 480 }), week())!.good).toBe(true)
    expect(biggestChange(week({ volumeKg: 15000 }), week())!.good).toBe(false)
  })

  it('ignores a sleep difference too small to mean anything', () => {
    // Five minutes is measurement noise, not a change in behaviour.
    const c = biggestChange(week({ volumeKg: 20000, sleepMin: 425, score: 80 }), week())
    expect(c).toBeNull()
  })

  it('ranks a session count BELOW any real percentage move', () => {
    const c = biggestChange(week({ sessions: 5, volumeKg: 22000 }), week())!
    expect(c.label).toBe('Tonnage')
  })

  it('reports the session count when nothing else changed', () => {
    const c = biggestChange(week({ sessions: 5 }), week())!
    expect(c.label).toBe('Sessions')
    expect(c.text).toBe('+1')
  })

  it('says nothing rather than inventing a percentage from zero', () => {
    // A first week has no previous tonnage to divide by.
    const c = biggestChange(week({ volumeKg: 18000, sessions: 3, sleepMin: null, score: null }),
      { volumeKg: 0, sessions: 3, sleepMin: null, score: null })
    expect(c).toBeNull()
  })

  it('is null on two identical weeks', () => {
    expect(biggestChange(week(), week())).toBeNull()
  })
})
