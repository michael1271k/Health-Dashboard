import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { weekChip, phaseRgb, phaseHex, phaseBadgeStyle, getWeekPhase, PHASE_RGB, PHASE_HEX } from '@/lib/phases'
import { EMBER, PLATINUM, SAND, MUTED, rgbTriple } from '@/lib/theme/palette'

/**
 * The week header identity: `[Plan] · [Phase] · [Wk N]`, coloured by phase.
 *
 * Guards two things that were wrong before: the header carried no phase colour
 * at all (it keyed off ERA, so Cut and Bulk weeks were both grey), and the
 * palette lived inside `phaseBadgeStyle` where nothing else could reach it.
 */
describe('weekChip', () => {
  it('splits a numbered phase into plan · phase · week', () => {
    const chip = weekChip('2026-07-19', 'Onyx-5')!   // Helix Cut Week 1
    expect(chip.plan).toBe('Onyx-5')
    expect(chip.phase).toBe('Cut')
    expect(chip.week).toBe('Wk 1')
  })

  it('numbers later weeks of the same phase', () => {
    expect(weekChip('2026-08-02', 'Onyx-5')!.week).toBe('Wk 3')
  })

  it('carries the phase colour, not a fixed grey', () => {
    const cut = weekChip('2026-07-19', 'Onyx-5')!
    const bulk = weekChip('2026-11-01', 'Onyx-5')!
    expect(cut.rgb).toBe(PHASE_RGB.cut)
    expect(bulk.rgb).toBe(PHASE_RGB.bulk)
    expect(cut.rgb).not.toBe(bulk.rgb)
  })

  it('omits the week number on an unnumbered phase', () => {
    const chip = weekChip('2026-07-12', 'Onyx-5')!   // Week 0 · Transition
    expect(chip.phase).toBe('Week 0 · Transition')
    expect(chip.week).toBeNull()
  })

  /**
   * 30 Aug used to be its own one-week `Maintenance Week` phase. It is a
   * nutrition LEVER now and nothing else — the training block runs straight
   * through it, so the chip says what is being trained.
   */
  it('keeps the cut unbroken through the maintenance week', () => {
    expect(weekChip('2026-08-30', 'Onyx-5')?.phase).toBe('Cut')
  })

  it('returns null for a week outside every phase', () => {
    expect(weekChip('2020-01-05', 'Onyx-5')).toBeNull()
  })
})

describe('phase palette is one source', () => {
  it('desaturates the PPL era so two Cut eras never look alike', () => {
    expect(phaseRgb('cut', 'ppl')).not.toBe(phaseRgb('cut', 'helix'))
  })

  it('keeps the Thailand deload warm rather than PPL grey', () => {
    expect(phaseRgb('deload', 'ppl')).not.toBe(phaseRgb('cut', 'ppl'))
  })

  it('phaseBadgeStyle draws from the same table it always did', () => {
    const style = phaseBadgeStyle('cut', false, 'helix')
    expect(style.color).toBe(`rgb(${PHASE_RGB.cut})`)
  })

  /**
   * The triples used to be hand-typed decimals with the palette hex in a
   * trailing comment, and two had silently drifted from the comment beside
   * them — cut was `224,101,60` (#E0653C, eleven units of green off EMBER) and
   * peak was the neon deleted two redesigns earlier. Deriving removes the
   * possibility rather than re-checking for it.
   */
  it('derives every triple from the hex, so the two can never disagree', () => {
    for (const kind of ['cut', 'peak', 'bulk', 'deload'] as const) {
      expect(PHASE_RGB[kind]).toBe(rgbTriple(PHASE_HEX[kind]))
    }
    expect(PHASE_HEX.cut).toBe(EMBER)
    expect(PHASE_HEX.peak).toBe(PLATINUM)   // not the neon, and not gold
  })

  it('gives a hex to consumers that append an alpha rather than wrap in rgba()', () => {
    // JourneyTimeline builds `${color}30`; an rgb() triple there is garbage.
    expect(phaseHex('cut', 'helix')).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(phaseHex('deload', 'ppl')).toBe(SAND)
    expect(phaseHex('cut', 'ppl')).toBe(MUTED)
  })

  /**
   * JourneyTimeline kept its own KIND_COLOR and three of four entries disagreed
   * with this table: cut drew in STEEL (maintenance's colour), maintenance in
   * EMBER_DEEP, peak in EMBER. One phase, one colour.
   */
  it('is the only phase colour table in the app', () => {
    const files = readdirSync('src/components', { recursive: true })
      .filter((f): f is string => typeof f === 'string' && /\.tsx$/.test(f))
    const offenders = files.filter((f) => {
      const src = readFileSync(join('src/components', f), 'utf8')
      return /(?:cut|bulk|maintenance|peak)\s*:\s*['"]#[0-9A-Fa-f]{6}['"]/.test(src)
    })
    expect(offenders).toEqual([])
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
