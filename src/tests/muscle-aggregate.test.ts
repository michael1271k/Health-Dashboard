import { describe, it, expect } from 'vitest'
import { aggregateMuscleSets, weekStartUTC, type MuscleSetRow } from '@/lib/charts/muscleAggregate'

const row = (o: Partial<MuscleSetRow> & Pick<MuscleSetRow, 'id' | 'groups' | 'date'>): MuscleSetRow =>
  ({ weightKg: 20, reps: 10, pairId: null, ...o })

/**
 * The arithmetic under Muscle Balance, Volume by Body Part, Muscle Freshness,
 * and the Volume Stream. It used to live inside a queryFn, so
 * none of it had ever been checked against anything but a screenshot.
 */
describe('aggregateMuscleSets', () => {
  it('counts a unilateral L/R pair as ONE set but sums BOTH sides of volume', () => {
    // A cable lateral raise logs two rows sharing a pair_id. Counting two sets
    // doubles the muscle against its weekly landmark. Its TONNAGE is one set's
    // worth too — see sessionVolumeKg; a split set must not outweigh the same
    // set logged unsided.
    const r = aggregateMuscleSets([
      row({ id: 'a', pairId: 'p1', side: 'L', groups: ['Shoulders'], date: '2026-07-28', weightKg: 5, reps: 15 }),
      row({ id: 'b', pairId: 'p1', side: 'R', groups: ['Shoulders'], date: '2026-07-28', weightKg: 5, reps: 15 }),
    ], '2026-07-28')
    const s = r.stats.find((x) => x.group === 'Shoulders')!
    expect(s.sets).toBe(1)
    expect(s.volume).toBe(75)      // ONE set of work, at the weaker side
  })

  it('scores an ASYMMETRIC pair at the weaker side, matching sessionVolumeKg', () => {
    // L 5×10, R 5×14. Summing both rows credits the strong arm's 4 extra reps to
    // the weak one; doubling the collapsed figure credits the set twice. Both
    // produced a number the session card disagreed with.
    const r = aggregateMuscleSets([
      row({ id: 'a', pairId: 'p1', side: 'L', groups: ['Arms'], date: '2026-08-06', weightKg: 5, reps: 10 }),
      row({ id: 'b', pairId: 'p1', side: 'R', groups: ['Arms'], date: '2026-08-06', weightKg: 5, reps: 14 }),
    ], '2026-08-06')
    const s = r.stats.find((x) => x.group === 'Arms')!
    expect(s.sets).toBe(1)
    expect(s.volume).toBe(50)      // min(5,5) × min(10,14), counted once
  })

  it('scores a lone side on its own — it is real work, just not a pair', () => {
    const r = aggregateMuscleSets([
      row({ id: 'a', pairId: 'p1', side: 'L', groups: ['Arms'], date: '2026-08-06', weightKg: 6, reps: 12 }),
    ], '2026-08-06')
    expect(r.stats.find((x) => x.group === 'Arms')!.volume).toBe(72)
  })

  it('leaves a pairId with no side alone — it is an ordinary set', () => {
    // The Aug-13 shape: rows carrying a pair_id from a migration but no limb.
    const r = aggregateMuscleSets([
      row({ id: 'a', pairId: 'p1', groups: ['Arms'], date: '2026-08-06', weightKg: 5, reps: 10 }),
      row({ id: 'b', pairId: 'p1', groups: ['Arms'], date: '2026-08-06', weightKg: 5, reps: 14 }),
    ], '2026-08-06')
    expect(r.stats.find((x) => x.group === 'Arms')!.volume).toBe(120)
  })

  it('credits a multi-group row to every group, once each', () => {
    const r = aggregateMuscleSets([
      row({ id: 'a', groups: ['Legs', 'Core'], date: '2026-07-28' }),
    ], '2026-07-28')
    expect(r.stats.find((x) => x.group === 'Legs')!.sets).toBe(1)
    expect(r.stats.find((x) => x.group === 'Core')!.sets).toBe(1)
  })

  it('counts bodyweight work — zero tonnage is not zero training', () => {
    // Hanging Knee Raise / Side Plank log weight_kg = 0.
    const r = aggregateMuscleSets([
      row({ id: 'a', groups: ['Core'], date: '2026-07-31', weightKg: 0, reps: 15 }),
      row({ id: 'b', groups: ['Core'], date: '2026-07-31', weightKg: 0, reps: 15 }),
    ], '2026-07-31')
    const core = r.stats.find((x) => x.group === 'Core')!
    expect(core.volume).toBe(0)
    expect(core.sets).toBe(2)
  })

  it('measures freshness from the LATEST date, not the first row seen', () => {
    const r = aggregateMuscleSets([
      row({ id: 'a', groups: ['Back'], date: '2026-07-23' }),
      row({ id: 'b', groups: ['Back'], date: '2026-07-30' }),
      row({ id: 'c', groups: ['Chest'], date: '2026-07-20' }),
    ], '2026-08-01')
    expect(r.stats.find((x) => x.group === 'Back')!.daysSince).toBe(2)
    expect(r.stats.find((x) => x.group === 'Chest')!.daysSince).toBe(12)
  })

  it('reports null freshness — not 0 — for a muscle never trained in range', () => {
    // 0 would render as "today", the exact opposite of the truth.
    const r = aggregateMuscleSets([], '2026-08-01')
    expect(r.stats.every((x) => x.daysSince === null && x.sets === 0)).toBe(true)
    expect(r.stats).toHaveLength(6)   // all six groups present, zero-filled
  })

  it('buckets the weekly stream by Sunday-anchored week', () => {
    expect(weekStartUTC('2026-08-01')).toBe('2026-07-26')  // Saturday → its Sunday
    expect(weekStartUTC('2026-07-26')).toBe('2026-07-26')  // Sunday → itself
    const r = aggregateMuscleSets([
      row({ id: 'a', groups: ['Legs'], date: '2026-07-24' }),   // week of 07-19
      row({ id: 'b', groups: ['Legs'], date: '2026-07-27' }),   // week of 07-26
      row({ id: 'c', groups: ['Legs'], date: '2026-07-31' }),   // week of 07-26
    ], '2026-08-01')
    expect(r.weekly.map((w) => w.week)).toEqual(['07-19', '07-26'])
    expect(r.weekly[0].Legs).toBe(1)
    expect(r.weekly[1].Legs).toBe(2)
  })

  it('dedupes the weekly series by pair too — the stream is SETS, not rows', () => {
    const r = aggregateMuscleSets([
      row({ id: 'a', pairId: 'p1', groups: ['Arms'], date: '2026-07-28' }),
      row({ id: 'b', pairId: 'p1', groups: ['Arms'], date: '2026-07-28' }),
      row({ id: 'c', groups: ['Arms'], date: '2026-07-28' }),
    ], '2026-07-28')
    expect(r.weekly[0].Arms).toBe(2)
  })

  it('orders the weekly stream oldest → newest', () => {
    const r = aggregateMuscleSets([
      row({ id: 'a', groups: ['Chest'], date: '2026-07-31' }),
      row({ id: 'b', groups: ['Chest'], date: '2026-07-16' }),
    ], '2026-08-01')
    expect(r.weekly.map((w) => w.week)).toEqual(['07-12', '07-26'])
  })

  it('ignores rows with no recognised group rather than inventing one', () => {
    const r = aggregateMuscleSets([row({ id: 'a', groups: [], date: '2026-07-31' })], '2026-08-01')
    expect(r.stats.every((x) => x.sets === 0)).toBe(true)
    expect(r.weekly).toEqual([])
  })
})
