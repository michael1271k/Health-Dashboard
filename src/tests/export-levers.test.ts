import { describe, it, expect } from 'vitest'
import { leverPeriods, atwaterKcal, LEVER_SCHEDULE } from '@/lib/nutrition/levers'
import { buildWeeklyExport, type WeeklyExportInput, type ExportDay } from '@/lib/reports/weeklyExport'
import { headings, headerCells, rowFor, rowsOf } from './exportGrammar'

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
 * 1,885 and three at the hand-set figures, in one Sunday-start week.
 *
 * ── AND "HAND-SET" IS 1,999, NOT WHATEVER THE ROW SAYS TODAY ─────────────────
 * `custom` used to carry no numbers, so every custom day fell through to the
 * CURRENT `user_goals` row — and that row is one mutable record with no date
 * axis. Week 6 (23–29 Aug) printed `Custom — 1955 kcal` for seven days eaten at
 * 1,999, because the carbohydrate figure was retyped from 206 to 195 on 30 Aug
 * and the export read it back as though it had always said so.
 *
 * The `LEVER_SCHEDULE` row opening that stretch pins what it meant, so these
 * expect 1,999 (170·4 + 206·4 + 55·9) and not the fallback.
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
    // The stretch's own pinned figure, NOT the `OWN` fallback below.
    expect(periods[1].goals.calorie).toBe(1999)
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
    // Lever 1 and Lever 2 share the same food and differ only in steps, so a
    // 1→2 move is a real change and must split.
    const l1 = leverPeriods(['2026-08-20'], 'lever-1', '2026-08-20', OWN)[0]
    const l2 = leverPeriods(['2026-08-20'], 'lever-2', '2026-08-20', OWN)[0]
    expect(l1.goals.calorie).toBe(l2.goals.calorie)
    expect(l1.goals.steps).not.toBe(l2.goals.steps)
  })

  /** The past belongs to the schedule; only today onward follows the selection. */
  it('never lets a selection made today re-mark a finished day', () => {
    const periods = leverPeriods(['2026-08-17'], 'lever-2', TODAY, OWN)
    expect(periods[0].leverId).toBe('lever-1')   // not lever-2
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
  restingHr: null, hrvMs: null, wristTempDeltaC: null, bloodOxygenPct: null,
  waterMl: null, supplementsTaken: null,
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

describe('the levers the week actually ran under', () => {
  /**
   * v3 states the rungs in ONE of two places, never both: the header's `lever=`
   * token when the whole week ran under a single rung, and a `## LEVERS`
   * section when it did not. The section is the branch this fixture exercises —
   * a lever released mid-week is exactly the case a header token cannot state.
   */
  it('names each rung, its numbers, and the exact days it governed', () => {
    const out = buildWeeklyExport(input())
    expect(headings(out)).toContain('## LEVERS')
    const l1 = rowFor(out, 'LEVERS', 'lever-1')
    expect(l1.label).toBe('Lever 1')
    expect([l1.kcal, l1.P, l1.C, l1.F, l1.steps]).toEqual(['1885', '170', '182', '53', '10000'])
    expect(l1.dates).toBe('2026-08-16…2026-08-19')

    const custom = rowFor(out, 'LEVERS', 'custom')
    expect(custom.label).toBe('Custom')
    expect([custom.kcal, custom.P, custom.C, custom.F, custom.steps])
      .toEqual(['1999', '170', '206', '55', '10000'])
    expect(custom.dates).toBe('2026-08-20…2026-08-22')
    // A week under more than one rung says so on the header rather than naming
    // one of them, which would be a claim about the other four days.
    expect(headerCells(out)[4]).toBe('lever=mixed')
  })

  it('states the CHANGE — which morning, and by how much', () => {
    // A reader scanning the daily rows needs to know the target moved under
    // them, and the direction. v3 does not print the delta as a sentence; it
    // prints both rungs with their runs, and the change is the difference —
    // which is only true if the runs ABUT and the numbers differ.
    const out = buildWeeklyExport(input())
    const rows = rowsOf(out, 'LEVERS')
    expect(rows).toHaveLength(2)
    // The rung came off on the Thursday morning: the first run ends Wednesday
    // and the second opens the very next day, with no unattributed gap.
    expect(rows[0].dates.split('…')[1]).toBe('2026-08-19')
    expect(rows[1].dates.split('…')[0]).toBe('2026-08-20')
    // +114 kcal, and the step target did not move.
    expect(Number(rows[1].kcal) - Number(rows[0].kcal)).toBe(114)
    expect(rows[1].steps).toBe(rows[0].steps)
  })

  it('says so plainly when nothing moved', () => {
    // A week wholly inside one rung — 2–8 Aug is entirely baseline, before
    // Lever 1 was pulled on the 16th. ONE rung is stated on the header and the
    // section is not printed at all: a `## LEVERS` block with a single row
    // would be four lines saying what the header already said.
    const flat = ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08']
    const out = buildWeeklyExport({
      ...input(),
      weekStart: '2026-08-02', weekEnd: '2026-08-08',
      days: flat.map((d, i) => day(d, WEEKDAYS[i])),
      targetPeriods: leverPeriods(flat, 'custom', '2026-08-14', OWN),
    })
    expect(headings(out)).not.toContain('## LEVERS')
    expect(headerCells(out)[4]).toBe('lever=baseline 1955kcal 170P 195C 55F 10000st')
    expect(headerCells(out)[4]).not.toBe('lever=mixed')
  })

  it('falls back to the plain targets line when no periods are supplied', () => {
    // An older caller, or a payload built without goal history. It must degrade
    // to the week's own goals rather than to an empty section or a fabricated
    // rung name.
    const out = buildWeeklyExport({ ...input(), targetPeriods: undefined })
    expect(headings(out)).not.toContain('## LEVERS')
    expect(headerCells(out)[4]).toBe('lever=—')
    expect(headerCells(out)[5]).toMatch(/^goals 1955kcal 170P 10000st /)
  })

  it('keeps the sleep target, which no lever touches', () => {
    // It rides in the week's own `goals` token, beside the figures a rung does
    // move — so a released lever can never take it with it.
    for (const periods of [input().targetPeriods, undefined]) {
      const out = buildWeeklyExport({ ...input(), targetPeriods: periods })
      expect(headerCells(out)[5]).toContain('7.5h')
    }
  })
})

/**
 * ── THE WEEK 6 REGRESSION ────────────────────────────────────────────────────
 * 23–29 Aug 2026 sits wholly inside the `custom` stretch that opened on the
 * 20th. The export printed `Custom — 1955 kcal (7 days)`; the week was eaten at
 * 1,999 (170P / 206C / 55F). This is that week, and that figure.
 */
describe('a finished custom stretch answers with what it MEANT', () => {
  const W6 = [
    '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26',
    '2026-08-27', '2026-08-28', '2026-08-29',
  ]

  it('prints 1999, not whatever the goal row holds now', () => {
    const periods = leverPeriods(W6, 'custom', '2026-08-30', OWN)
    expect(periods).toHaveLength(1)
    expect(periods[0].label).toBe('Custom')
    expect(periods[0].goals).toEqual({
      calorie: 1999, protein: 170, carbs: 206, fat: 55, steps: 10000,
    })
    expect(periods[0].dates).toHaveLength(7)
  })

  it('is Atwater-exact, like every rung', () => {
    const [p] = leverPeriods(W6, 'custom', '2026-08-30', OWN)
    expect(atwaterKcal(p.goals.protein!, p.goals.carbs!, p.goals.fat!)).toBe(p.goals.calorie)
  })

  /**
   * The layer ABOVE the rung, which the export was the one resolver to skip —
   * so a restaurant Tuesday was graded at 2,400 by the scorer and reported at
   * 1,999 by the week that contained it.
   */
  it('splits on a per-day target, the way the scorer already did', () => {
    const periods = leverPeriods(W6, 'custom', '2026-08-30', OWN, {
      dailyTargets: [{ date: '2026-08-26', kcal: 2400 }],
    })
    expect(periods.map((p) => p.goals.calorie)).toEqual([1999, 2400, 1999])
    expect(periods[1].dates).toEqual(['2026-08-26'])
  })

  /** Every other caller passes it; this one silently did not. */
  it('honours the release end date, so a maintenance week stops', () => {
    const after = leverPeriods(['2026-09-06'], 'maintenance-week', '2026-08-30', OWN, {
      releaseEndsOn: '2026-09-05',
    })
    expect(after[0].leverId).not.toBe('maintenance-week')
  })
})
