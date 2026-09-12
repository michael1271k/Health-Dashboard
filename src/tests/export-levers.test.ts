import { describe, it, expect } from 'vitest'
import { leverPeriods, atwaterKcal, LEVER_SCHEDULE } from '@/lib/nutrition/levers'
import { buildWeeklyExport, type WeeklyExportInput, type ExportDay } from '@/lib/reports/weeklyExport'
import { sectionLines, weekField, dayField, NO_DATA } from './exportGrammar'

/** The `- **Rung** — …` bullets under `## THE WEEK`, one per rung in force. */
const rungs = (out: string): string[] =>
  sectionLines(out, 'THE WEEK').filter((l) => l.startsWith('- **')).map((l) => l.slice(2))

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
   * v4 states the rungs in ONE of two places, never both: on the `**Plan**` row
   * when the whole week ran under a single rung — numbers and all, because a
   * bulleted list of one item repeats the line above it — and as a bullet per
   * run when it did not. The bullets are the branch this fixture exercises: a
   * lever released mid-week is exactly the case one line cannot state.
   */
  it('names each rung, its numbers, and the exact days it governed', () => {
    const out = buildWeeklyExport(input())
    const rows = rungs(out)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toBe('**Lever 1** — 1,885 kcal · 170 P / 182 C / 53 F · 10,000 steps · 16 Aug → 19 Aug')
    expect(rows[1]).toBe('**Custom** — 1,999 kcal · 170 P / 206 C / 55 F · 10,000 steps · 20 Aug → 22 Aug')
    // A week under more than one rung says how many rather than naming one of
    // them, which would be a claim about the other four days.
    expect(weekField(out, 'Plan')).toContain('**Levers** 2 rungs this week')
    expect(weekField(out, 'Plan')).not.toContain('Lever 1')
  })

  it('states the CHANGE — which morning, and by how much', () => {
    // A reader scanning the daily rows needs to know the target moved under
    // them, and the direction. The document does not print the delta as a
    // sentence; it prints both rungs with their runs, and the change is the
    // difference — which is only true if the runs ABUT and the numbers differ.
    const rows = rungs(buildWeeklyExport(input()))
    // The rung came off on the Thursday morning: the first run ends Wednesday
    // and the second opens the very next day, with no unattributed gap.
    expect(rows[0]).toContain('· 16 Aug → 19 Aug')
    expect(rows[1]).toContain('· 20 Aug → 22 Aug')
    // +114 kcal, and the step target did not move.
    const kcal = (r: string) => Number(/([\d,]+) kcal/.exec(r)![1].replace(/,/g, ''))
    expect(kcal(rows[1]) - kcal(rows[0])).toBe(114)
    expect(rows[0]).toContain('10,000 steps')
    expect(rows[1]).toContain('10,000 steps')
  })

  it('says so plainly when nothing moved', () => {
    // A week wholly inside one rung — 2–8 Aug is entirely baseline, before
    // Lever 1 was pulled on the 16th. ONE rung is stated on the plan row with
    // its numbers, and no bullet is printed at all.
    const flat = ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08']
    const out = buildWeeklyExport({
      ...input(),
      weekStart: '2026-08-02', weekEnd: '2026-08-08',
      days: flat.map((d, i) => day(d, WEEKDAYS[i])),
      targetPeriods: leverPeriods(flat, 'custom', '2026-08-14', OWN),
    })
    expect(rungs(out)).toHaveLength(0)
    expect(weekField(out, 'Plan'))
      .toContain('**Lever** Baseline — 1,935 kcal · 170 P / 190 C / 55 F · 10,000 steps')
    expect(weekField(out, 'Plan')).not.toContain('rungs this week')
  })

  it('falls back to the plain goals row when no periods are supplied', () => {
    // An older caller, or a payload built without goal history. It must degrade
    // to the week's own goals rather than to an empty list or a fabricated rung.
    const out = buildWeeklyExport({ ...input(), targetPeriods: undefined })
    expect(rungs(out)).toHaveLength(0)
    expect(weekField(out, 'Plan')).toContain(`**Lever** ${NO_DATA}`)
    expect(weekField(out, 'Standing goals')).toMatch(/^1,955 kcal · 170 P · 10,000 steps/)
  })

  it('keeps the sleep target, which no lever touches', () => {
    // It rides in the week's own standing goals, beside the figures a rung does
    // move — so a released lever can never take it with it.
    for (const periods of [input().targetPeriods, undefined]) {
      const out = buildWeeklyExport({ ...input(), targetPeriods: periods })
      expect(weekField(out, 'Standing goals')).toContain('7.5 h sleep')
    }
  })

  it('grades each day against the rung that was in force on it', () => {
    // The whole point of the split. Monday sat under Lever 1 and Friday under
    // the hand-set numbers, so the two days cannot share a denominator.
    const out = buildWeeklyExport({
      ...input(),
      days: days.map((d) => (d.date === '2026-08-17' || d.date === '2026-08-21'
        ? { ...d, calories: 1900 } : d)),
    })
    expect(dayField(out, '2026-08-17', 'Intake')).toContain('1,900 / 1,885 kcal')
    expect(dayField(out, '2026-08-21', 'Intake')).toContain('1,900 / 1,999 kcal')
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
