import { describe, it, expect } from 'vitest'
import { regionalLoad, regionOpacity, ZONE_COLOR } from '@/lib/charts/muscleLoad'

/**
 * The Muscle Contour Map read "Legs 100%, Core 8%". Neither number described
 * training: the scale was `group tonnage / biggest group's tonnage`, so the top
 * of the scale was pinned to whichever muscle happens to move the most kilos,
 * and bodyweight core work (logged at weight_kg = 0) contributed nothing at all.
 */
describe('regionalLoad', () => {
  // A real 30-day window: ~4.3 weeks of Helix 5.1.
  const stats = [
    { group: 'Legs', sets: 60 },      // 14.0/wk vs MAV 20 → building
    { group: 'Core', sets: 39 },      //  9.1/wk vs MAV 14 → building
    { group: 'Chest', sets: 30 },     //  7.0/wk vs MAV 16 → under (MEV 10)
    { group: 'Back', sets: 78 },      // 18.2/wk vs MAV 18 → optimal
  ]

  it('grades against the muscle OWN ceiling, not against other muscles', () => {
    const r = regionalLoad(stats, 30)
    const by = new Map(r.map((x) => [x.group, x]))
    // Legs no longer pegs the scale just for being legs.
    expect(by.get('Legs')!.ratio).toBeLessThan(1)
    // Back, at a genuinely higher share of its own range, now outranks Legs.
    expect(by.get('Back')!.ratio).toBeGreaterThan(by.get('Legs')!.ratio)
  })

  it('normalises the window to sets per WEEK', () => {
    const [legs] = regionalLoad([{ group: 'Legs', sets: 60 }], 30)
    expect(legs.setsPerWeek).toBeCloseTo(14, 1)
    // The same 60 sets over a 90-day plan era is a third of the weekly rate.
    const [era] = regionalLoad([{ group: 'Legs', sets: 60 }], 90)
    expect(era.setsPerWeek).toBeCloseTo(4.7, 1)
  })

  it('never inflates a sub-week window into a fictional weekly rate', () => {
    // Checking on a Tuesday: 3 days in, 6 sets. Not "14 sets/week".
    const [chest] = regionalLoad([{ group: 'Chest', sets: 6 }], 3)
    expect(chest.setsPerWeek).toBe(6)
  })

  it('reads bodyweight core work, which tonnage could not see at all', () => {
    // Hanging Knee Raise and Side Plank are weight_kg = 0. Their tonnage is
    // zero; their SETS are not.
    const [core] = regionalLoad([{ group: 'Core', sets: 39 }], 30)
    expect(core.setsPerWeek).toBeGreaterThan(9)
    expect(core.zone).toBe('building')
  })

  it('places each zone on the MEV → MAV → MRV band', () => {
    // Chest: MEV 10, MAV 16, MRV 22.
    const z = (setsPerWeek: number) => regionalLoad([{ group: 'Chest', sets: setsPerWeek }], 7)[0].zone
    expect(z(0)).toBe('na')
    expect(z(6)).toBe('under')
    expect(z(12)).toBe('building')
    expect(z(18)).toBe('optimal')
    expect(z(30)).toBe('over')
  })

  it('is "na", not zero-heat, for a group with no landmark', () => {
    const [x] = regionalLoad([{ group: 'Neck', sets: 4 }], 7)
    expect(x.zone).toBe('na')
    expect(ZONE_COLOR.na).toBe('rgba(255,255,255,0.05)')
  })

  it('keeps a lightly-trained muscle visible but distinct from an untrained one', () => {
    const trained = regionalLoad([{ group: 'Chest', sets: 2 }], 7)[0]
    const untrained = regionalLoad([{ group: 'Chest', sets: 0 }], 7)[0]
    expect(regionOpacity(untrained)).toBe(0)
    expect(regionOpacity(trained)).toBeGreaterThan(0.25)
    expect(regionOpacity(trained)).toBeLessThan(regionOpacity(regionalLoad([{ group: 'Chest', sets: 16 }], 7)[0]))
  })

  it('caps the opacity ramp so an over-reaching muscle stays readable', () => {
    const wild = regionalLoad([{ group: 'Chest', sets: 200 }], 7)[0]
    expect(wild.ratio).toBeGreaterThan(1)          // the NUMBER is honest
    expect(regionOpacity(wild)).toBeLessThanOrEqual(0.85)
  })
})
