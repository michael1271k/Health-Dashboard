import { describe, it, expect } from 'vitest'
import { biggestChange, type WeekTotals } from '@/components/dashboard/WeekSoFarCard'
import { firstDirective } from '@/lib/reports/directive'

/**
 * "The Week So Far" replaced a card that listed four weekly means — every one
 * of which the BioStrips above it already showed. Its two claims are that it
 * names ONE change (the largest), and that the directive it prints was
 * retrieved from a report you pasted, never generated.
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

describe('firstDirective', () => {
  const report = [
    '⬢ HELIX OS · WEEKLY TELEMETRY & PERFORMANCE AUDIT',
    '▓ PART 3 — THE WEEK AHEAD',
    '⚑ DIRECTIVES',
    '─────────────────────',
    '• Hold calories at 1,950 and add one Zone-2 walk on Wednesday.',
    '• Drop the second drop-set on Leg Press.',
    '',
  ].join('\n')

  it('retrieves the first instruction from the directive section', () => {
    expect(firstDirective(report)).toBe('Hold calories at 1,950 and add one Zone-2 walk on Wednesday.')
  })

  it('skips box-drawing and rule lines', () => {
    expect(firstDirective(report)).not.toMatch(/─/)
  })

  it('returns null when the report carries no directive section', () => {
    const md = ['▓ PART 1 — WEIGHT', '📉 TRAJECTORY', 'Weight fell 0.4 kg across the week.'].join('\n')
    expect(firstDirective(md)).toBeNull()
  })

  it('returns null on no report at all — never a fabricated line', () => {
    // The app calls no model. An absent report means an absent directive.
    expect(firstDirective(null)).toBeNull()
    expect(firstDirective('')).toBeNull()
  })

  it('does not mistake a table row for an instruction', () => {
    const md = [
      '▓ PART 3 — ACTIONS',
      '⚑ NEXT WEEK',
      'Day | Focus | Load',
      'Mon | Legs A | +2.5 kg',
      'Push the top set on Leg Press to 12 before adding load.',
    ].join('\n')
    expect(firstDirective(md)).toBe('Push the top set on Leg Press to 12 before adding load.')
  })

  it('truncates a very long directive rather than breaking the card', () => {
    const long = 'x'.repeat(400)
    const md = ['▓ PART 3 — ACTIONS', '⚑ DIRECTIVES', long].join('\n')
    const out = firstDirective(md)!
    expect(out.length).toBeLessThanOrEqual(140)
    expect(out.endsWith('…')).toBe(true)
  })
})
