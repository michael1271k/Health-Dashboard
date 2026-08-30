import { describe, it, expect } from 'vitest'
import {
  isMaintenanceDate, maintenanceSpanFor, maintenanceBands, maintenanceLeverOn,
} from '@/lib/nutrition/maintenance'
import { leverForDate, applyLever, leverById } from '@/lib/nutrition/levers'
import { applyDailyTarget, hasDailyTarget } from '@/lib/nutrition/dailyTargets'
import { workoutDrain, workoutMaxFor, MAX_TOTAL_DRAIN, MAINTENANCE_DRAIN_FACTOR } from '@/lib/scoring/battery'

/**
 * Week 7 opened on 2026-08-30 and the app graded it as a failure: the volume
 * dropped 32% because the plan asked it to, the step goal still said 10,000 and
 * the calorie target still said 1,955. Everything below is one of the reasons.
 */

const MAINT = '2026-08-30'   // Sunday, the first day of the maintenance week
const CUT = '2026-08-27'     // the Thursday before it

describe('is this date a deload?', () => {
  it('answers from the LEVER first, so a week pulled today counts today', () => {
    // PHASES is a compiled constant and cannot know about a selection made this
    // morning. The lever can, which is the whole reason the maintenance week is
    // a lever and not a phase.
    expect(maintenanceLeverOn(MAINT, 'maintenance-week', null, MAINT)).toBe(true)
    expect(maintenanceLeverOn(CUT, 'maintenance-week', null, MAINT)).toBe(false)
  })

  it('falls back to the PHASE, which is what covers the deloads that predate levers', () => {
    // The Thailand trip (2026-06-28, two weeks) is a real `PHASES` entry with no
    // schedule row. It used to fall through to 'cut' and be graded against a
    // prescription nobody intended to follow.
    expect(isMaintenanceDate('2026-07-01', null, null, '2026-07-01')).toBe(true)
    expect(maintenanceSpanFor('2026-07-01')).toEqual({ start: '2026-06-28', end: '2026-07-11' })
  })

  it('says no on an ordinary cut day', () => {
    expect(isMaintenanceDate(CUT, 'custom', null, CUT)).toBe(false)
    expect(maintenanceSpanFor(CUT)).toBeNull()
  })

  /**
   * `LEVER_SCHEDULE` closes a release with a second hand-written row and its own
   * comment admits the failure mode: "forgetting is the default outcome". A
   * toggle cannot add a row to a compiled constant, so the end date is data.
   */
  it('a release stops applying after its end date', () => {
    const until = '2026-09-05'
    expect(leverForDate('2026-09-01', 'maintenance-week', MAINT, until)).toBe('maintenance-week')
    // Past the end date the SELECTION stops being honoured and the schedule —
    // which resumes `custom` on 2026-09-06 — answers instead.
    expect(leverForDate('2026-09-10', 'maintenance-week', MAINT, until)).toBe('custom')
  })

  it('an absent end date changes nothing, which is how every deficit rung behaves', () => {
    expect(leverForDate('2026-12-01', 'lever-1', MAINT, null)).toBe('lever-1')
    // And an end date never truncates a DEFICIT rung: only a release ends.
    expect(leverForDate('2026-12-01', 'lever-1', MAINT, '2026-09-05')).toBe('lever-1')
  })
})

describe('the rung the maintenance week actually runs', () => {
  it('replaces all five targets, steps included', () => {
    expect(applyLever(
      { calorie: 1955, protein: 170, carbs: 195, fat: 55, steps: 10000 },
      'maintenance-week',
    )).toEqual({ calorie: 2151, protein: 170, carbs: 244, fat: 55, steps: 7500 })
  })

  it('brings the step goal DOWN, which is the half that used to be missing', () => {
    // A 10k floor on a rest-focused week grades most of its days as a miss, and
    // a target you are expected to fail is not a target.
    expect(leverById('maintenance-week')?.stepsGoal).toBe(7500)
    expect(leverById('baseline')?.stepsGoal).toBe(10000)
  })
})

describe('a day may override the rung', () => {
  it('overrides field by field, so raising the calories leaves protein alone', () => {
    const rung = { calorie: 2151, protein: 170, carbs: 244, fat: 55, steps: 7500 }
    expect(applyDailyTarget(rung, { date: MAINT, kcal: 2400 })).toEqual({
      calorie: 2400, protein: 170, carbs: 244, fat: 55, steps: 7500,
    })
  })

  it('treats a stored zero as a broken row, not as a fast', () => {
    const rung = { calorie: 2151, protein: 170, carbs: 244, fat: 55, steps: 7500 }
    expect(applyDailyTarget(rung, { date: MAINT, kcal: 0 })).toEqual(rung)
    expect(hasDailyTarget({ date: MAINT, kcal: 0 })).toBe(false)
    expect(hasDailyTarget({ date: MAINT })).toBe(false)
    expect(hasDailyTarget(null)).toBe(false)
  })

  it('an all-null row is not an override', () => {
    const rung = { calorie: 2151, protein: 170, carbs: 244, fat: 55, steps: 7500 }
    expect(applyDailyTarget(rung, { date: MAINT, kcal: null, protein_g: null })).toEqual(rung)
  })
})

describe('the battery on a deload', () => {
  /**
   * The relative-volume term already handles the drop. This is asserted rather
   * than "fixed", because the temptation was to add a maintenance bonus on top
   * of an engine that was already correct.
   */
  it('already drains less for a lighter session, with no maintenance flag at all', () => {
    const normal = workoutDrain(20000, 20000, 8, 'cb_a')
    const deload = workoutDrain(13600, 20000, 8, 'cb_a')   // today's 32% drop
    expect(deload).toBeLessThan(normal)
    expect(deload / normal).toBeCloseTo(0.68, 2)
  })

  it('lowers the CEILING too, which the relative term cannot express', () => {
    expect(workoutMaxFor('legs_a', true)).toBe(30 * MAINTENANCE_DRAIN_FACTOR)
    expect(workoutMaxFor('legs_a', false)).toBe(30)
    // A session at its own ceiling still costs less on a deload week.
    expect(workoutDrain(28000, 20000, 10, 'legs_a', true))
      .toBeLessThan(workoutDrain(28000, 20000, 10, 'legs_a', false))
  })

  /**
   * v6 broke by letting the worst-case drain reach 104.2 against a 100 charge
   * budget. The factor may only ever lower the worst case.
   */
  it('cannot push the drain budget past the charge budget', () => {
    expect(MAINTENANCE_DRAIN_FACTOR).toBeLessThan(1)
    expect(MAX_TOTAL_DRAIN).toBeLessThan(100)
    for (const day of ['legs_a', 'legs_b', 'cb_a', 'cb_b', 'arms', null]) {
      expect(workoutMaxFor(day, true)).toBeLessThanOrEqual(workoutMaxFor(day, false))
    }
  })
})

describe('the chart band', () => {
  it('clamps to dates that are actually on the axis', () => {
    // A band drawn to a phase boundary outside the plotted points lands nowhere.
    const dates = ['2026-08-28', '2026-08-30', '2026-09-01']
    expect(maintenanceBands(dates)).toEqual([{ start: '2026-08-30', end: '2026-09-01' }])
  })

  it('does not merge two blocks separated by a cut', () => {
    // The Thailand deload and the scheduled maintenance week are months apart.
    const dates = ['2026-07-01', '2026-08-01', '2026-08-30']
    expect(maintenanceBands(dates)).toEqual([
      { start: '2026-07-01', end: '2026-07-01' },
      { start: '2026-08-30', end: '2026-08-30' },
    ])
  })

  it('is empty on a week with no deload in it', () => {
    expect(maintenanceBands(['2026-08-24', '2026-08-26', '2026-08-28'])).toEqual([])
  })
})
