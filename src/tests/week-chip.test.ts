import { describe, it, expect } from 'vitest'
import { weekChip, phaseRgb, phaseBadgeStyle, getWeekPhase, PHASE_RGB } from '@/lib/phases'

/**
 * The week header identity: `[Plan] · [Phase] · [Wk N]`, coloured by phase.
 *
 * Guards two things that were wrong before: the header carried no phase colour
 * at all (it keyed off ERA, so Cut and Bulk weeks were both grey), and the
 * palette lived inside `phaseBadgeStyle` where nothing else could reach it.
 */
describe('weekChip', () => {
  it('splits a numbered phase into plan · phase · week', () => {
    const chip = weekChip('2026-07-19', 'Helix-5')!   // Helix Cut Week 1
    expect(chip.plan).toBe('Helix-5')
    expect(chip.phase).toBe('Cut')
    expect(chip.week).toBe('Wk 1')
  })

  it('numbers later weeks of the same phase', () => {
    expect(weekChip('2026-08-02', 'Helix-5')!.week).toBe('Wk 3')
  })

  it('carries the phase colour, not a fixed grey', () => {
    const cut = weekChip('2026-07-19', 'Helix-5')!
    const bulk = weekChip('2026-11-01', 'Helix-5')!
    expect(cut.rgb).toBe(PHASE_RGB.cut)
    expect(bulk.rgb).toBe(PHASE_RGB.bulk)
    expect(cut.rgb).not.toBe(bulk.rgb)
  })

  it('omits the week number on an unnumbered phase', () => {
    const chip = weekChip('2026-08-30', 'Helix-5')!   // Maintenance Week
    expect(chip.phase).toBe('Maintenance Week')
    expect(chip.week).toBeNull()
  })

  it('returns null for a week outside every phase', () => {
    expect(weekChip('2020-01-05', 'Helix-5')).toBeNull()
  })
})

describe('phase palette is one source', () => {
  it('desaturates the PPL era so two Cut eras never look alike', () => {
    expect(phaseRgb('cut', 'ppl')).not.toBe(phaseRgb('cut', 'helix'))
  })

  it('keeps the Thailand deload warm rather than PPL grey', () => {
    expect(phaseRgb('maintenance', 'ppl')).not.toBe(phaseRgb('cut', 'ppl'))
  })

  it('phaseBadgeStyle draws from the same table it always did', () => {
    const style = phaseBadgeStyle('cut', false, 'helix')
    expect(style.color).toBe(`rgb(${PHASE_RGB.cut})`)
  })
})

describe('getWeekPhase carries the phase name and number separately', () => {
  it('exposes name and n alongside the legacy label', () => {
    const p = getWeekPhase('2026-07-19')!
    expect(p.name).toBe('Cut')
    expect(p.n).toBe(1)
    expect(p.label).toBe('Helix Cut · Week 1')   // unchanged for existing callers
  })
})
