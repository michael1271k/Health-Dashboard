import { describe, it, expect } from 'vitest'
import { leverPeriods, LEVER_SCHEDULE } from '@/lib/nutrition/levers'
import { buildWeeklyExport, type WeeklyExportInput, type ExportDay } from '@/lib/reports/weeklyExport'

/**
 * ── A WEEK IS NOT NECESSARILY ONE TARGET ─────────────────────────────────────
 *
 * The export printed one `**Targets:** 1955 kcal · …` line, read straight off
 * `user_goals` with no lever applied. In a week where a rung was pulled or
 * released that line attributes today's numbers to Sunday, and a reader seeing
 * intake 70 kcal under target cannot tell drift from the plan.
 *
 * The live week this was found on is the fixture: Lever 1 in force from
 * 2026-08-16, released back to hand-set numbers on Thursday 2026-08-20 (which
 * `user_goals.updated_at` timestamps at 08:47 that morning). Four days at
 * 1,885 and three at 1,955, in one Sunday-start week.
 */

const WEEK = [
  '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19',
  '2026-08-20', '2026-08-21', '2026-08-22',
]
/** The user's own numbers — what `custom` resolves to. */
const OWN = { calorie: 1955, protein: 170, carbs: 195, fat: 55, steps: 10000 }
const TODAY = '2026-08-21'

describe('the rung in force, day by day', () => {
  it('splits the live week exactly where the lever came off', () => {
    const periods = leverPeriods(WEEK, 'custom', TODAY, OWN)
    expect(periods).toHaveLength(2)

    expect(periods[0].leverId).toBe('lever-1')
    expect(periods[0].goals.calorie).toBe(1885)
    expect(periods[0].dates).toEqual(['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19'])

    expect(periods[1].label).toBe('Custom')
    expect(periods[1].goals.calorie).toBe(1955)
    expect(periods[1].dates).toEqual(['2026-08-20', '2026-08-21', '2026-08-22'])
  })

  it('carries every macro, not just the calorie figure', () => {
    // A lever moves all four at once. Reporting only kcal makes a 13 g carb cut
    // invisible, and carbs are the half of a rung that costs training quality.
    const [lever1] = leverPeriods(WEEK, 'custom', TODAY, OWN)
    expect(lever1.goals).toEqual({ calorie: 1885, protein: 170, carbs: 182, fat: 53, steps: 10000 })
  })

  it('collapses a week with no change into ONE period', () => {
    const periods = leverPeriods(
      ['2026-08-16', '2026-08-17', '2026-08-18'], 'lever-1', '2026-08-19', OWN,
    )
    expect(periods).toHaveLength(1)
    expect(periods[0].leverId).toBe('lever-1')
  })

  /**
   * Two rungs that ask for identical food and identical steps are the same
   * instruction whatever they are called. Splitting on the LABEL would print
   * two blocks with the same five numbers in them.
   */
  it('groups on the resolved numbers, not on the rung name', () => {
    // Lever 2 and Lever 3 share Lever 1's food and differ only in steps, so a
    // 2→3 move is a real change and must split.
    const l2 = leverPeriods(['2026-08-20'], 'lever-2', '2026-08-20', OWN)[0]
    const l3 = leverPeriods(['2026-08-20'], 'lever-3', '2026-08-20', OWN)[0]
    expect(l2.goals.calorie).toBe(l3.goals.calorie)
    expect(l2.goals.steps).not.toBe(l3.goals.steps)
  })

  /** The past belongs to the schedule; only today onward follows the selection. */
  it('never lets a selection made today re-mark a finished day', () => {
    const periods = leverPeriods(['2026-08-17'], 'lever-3', TODAY, OWN)
    expect(periods[0].leverId).toBe('lever-1')   // not lever-3
  })

  it('is anchored on the real schedule, so a released rung stays released', () => {
    // Guards the row that was missing: without it, every past date from 16 Aug
    // answered "Lever 1" forever, including the day it came off.
    expect(LEVER_SCHEDULE.some((p) => p.from === '2026-08-20' && p.leverId === 'custom')).toBe(true)
  })
})

const day = (date: string, weekdayLabel: string): ExportDay => ({
  date, weekdayLabel, isTrainingDay: false,
  weightKg: null, calories: null, proteinG: null, carbsG: null, fatG: null,
  steps: null, distanceM: null, trainingMin: null, sleepMin: null, deepMin: null, remMin: null,
  restingHr: null, hrvMs: null, waterMl: null, supplementsTaken: null,
  activeKcal: null, bmrKcal: null, weighInSkipReason: null,
  nutritionException: null, nutritionEstimated: false,
})

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const days = WEEK.map((d, i) => day(d, WEEKDAYS[i]))

const input = (): WeeklyExportInput => ({
  weekStart: '2026-08-16', weekEnd: '2026-08-22', weekLabel: 'Week 6',
  programLabel: 'Helix Cut',
  calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 7.5,
  targetPeriods: leverPeriods(WEEK, 'custom', TODAY, OWN),
  days, sessions: [], volumeByMuscle: [], doms: [], cardio: [],
})

describe('the Targets & Levers section', () => {
  it('names each rung, its numbers, and the exact days it governed', () => {
    const out = buildWeeklyExport(input())
    expect(out).toContain('## Targets & Levers')
    expect(out).toContain('- **Lever 1** — 1885 kcal · 170P / 182C / 53F · 10000 steps')
    expect(out).toContain('    - Active: Sun 16, Mon 17, Tue 18 & Wed 19 Aug (4 days)')
    expect(out).toContain('- **Custom** — 1955 kcal · 170P / 195C / 55F · 10000 steps')
    expect(out).toContain('    - Active: Thu 20, Fri 21 & Sat 22 Aug (3 days)')
  })

  it('states the CHANGE — which morning, and by how much', () => {
    // A reader scanning the daily rows needs to know the target moved under
    // them, and the direction. "+70 kcal" is the whole story of that Thursday.
    expect(buildWeeklyExport(input()))
      .toContain('    - Changed from **Lever 1** on Thu 2026-08-20 (+70 kcal, 0 steps)')
  })

  it('says so plainly when nothing moved', () => {
    // A week wholly inside one rung — 2–8 Aug is entirely baseline, before
    // Lever 1 was pulled on the 16th.
    const flat = ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08']
    const out = buildWeeklyExport({
      ...input(),
      weekStart: '2026-08-02', weekEnd: '2026-08-08',
      days: flat.map((d, i) => day(d, WEEKDAYS[i])),
      targetPeriods: leverPeriods(flat, 'custom', '2026-08-14', OWN),
    })
    expect(out).toContain('- **Baseline** — 1955 kcal')
    expect(out).toContain('- Unchanged all week.')
    expect(out).not.toContain('Changed from')
  })

  it('falls back to the plain targets line when no periods are supplied', () => {
    // An older caller, or a payload built without goal history. It must degrade
    // to what the export always printed rather than to an empty section.
    const out = buildWeeklyExport({ ...input(), targetPeriods: undefined })
    expect(out).toContain('## Targets & Levers')
    expect(out).toContain('- **Targets:** 1955 kcal · 170 g protein · 10000 steps')
  })

  it('keeps the sleep target, which no lever touches', () => {
    expect(buildWeeklyExport(input())).toContain('- Sleep target: 7.5 h')
  })
})
