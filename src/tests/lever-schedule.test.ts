import { describe, it, expect } from 'vitest'
import {
  LEVER_SCHEDULE, scheduledLeverOn, leverForDate, leverById, applyLever,
} from '@/lib/nutrition/levers'

/**
 * THE LEVER IS DATE-BOUND.
 *
 * `user_goals.active_lever` is one mutable value, and every grader read it —
 * including graders of days that finished weeks ago. Pulling Lever 1 on 16 Aug
 * therefore did not tighten the cut going forward; it silently re-marked the
 * month behind it against a 1,885 kcal target that did not exist when those
 * days were eaten.
 *
 * The split: the PAST belongs to the schedule, TODAY AND AFTER belong to the
 * selection you are currently holding.
 */
const TODAY = '2026-08-19'

describe('the schedule', () => {
  it('is ordered oldest first, which `scheduledLeverOn` relies on', () => {
    const froms = LEVER_SCHEDULE.map((p) => p.from)
    expect([...froms].sort()).toEqual(froms)
  })

  it('puts the baseline on the cut and Lever 1 from 16 Aug', () => {
    expect(scheduledLeverOn('2026-07-15')).toBe('baseline')
    expect(scheduledLeverOn('2026-08-15')).toBe('baseline')
    expect(scheduledLeverOn('2026-08-16')).toBe('lever-1')
    expect(scheduledLeverOn('2026-08-19')).toBe('lever-1')
  })

  /**
   * A rung coming OFF is an event too, and for a day this one was not recorded.
   * The schedule held the pull (16 Aug) and nothing else, so every past date
   * from then on answered "Lever 1" — including 20 Aug, the morning
   * `user_goals` was set back to 1,955 kcal. A day eaten at the baseline was
   * being graded 70 kcal over a target that no longer existed.
   */
  it('records the release, not just the pull', () => {
    expect(scheduledLeverOn('2026-08-20')).toBe('custom')
    expect(scheduledLeverOn('2026-09-01')).toBe('custom')
    // The last Lever 1 day and the first custom day are adjacent — no gap, no
    // overlap. A schedule with either would make one date ungradeable.
    expect(scheduledLeverOn('2026-08-19')).not.toBe(scheduledLeverOn('2026-08-20'))
  })

  /**
   * `custom` names the ABSENCE of a rung, so nothing may be read off it — the
   * user's own stored goals stand. This is what stops the release row silently
   * re-imposing baseline's 8k step target on a week held at 10k.
   */
  it('resolves custom to no rung, so the stored goals survive', () => {
    expect(leverById('custom')).toBeNull()
  })

  it('is null before the block opened — there was no rung to be on', () => {
    expect(scheduledLeverOn('2026-07-14')).toBeNull()
  })
})

describe('leverForDate', () => {
  it('grades a finished day against the rung that was in force THEN', () => {
    // The selection you are holding today is Lever 3; 20 July was still 1,955.
    expect(leverForDate('2026-07-20', 'lever-3', TODAY)).toBe('baseline')
    expect(leverById(leverForDate('2026-07-20', 'lever-3', TODAY))?.calorieGoal).toBe(1955)
  })

  it('grades 16 Aug onward against Lever 1, even with nothing stored', () => {
    // A database that never ran the `active_lever` DDL still moves on the date.
    expect(leverForDate('2026-08-16', null, TODAY)).toBe('lever-1')
    expect(leverById(leverForDate('2026-08-17', undefined, TODAY))?.calorieGoal).toBe(1885)
  })

  it('gives today and the future to the selection you are holding', () => {
    expect(leverForDate(TODAY, 'lever-2', TODAY)).toBe('lever-2')
    expect(leverForDate('2026-09-30', 'lever-2', TODAY)).toBe('lever-2')
  })

  it('never lets a new selection reach backwards', () => {
    const before = leverForDate('2026-08-01', 'baseline', TODAY)
    expect(leverForDate('2026-08-01', 'lever-3', TODAY)).toBe(before)
  })

  it('treats `custom` as a real selection today and not in the past', () => {
    expect(leverForDate(TODAY, 'custom', TODAY)).toBe('custom')
    expect(leverForDate('2026-08-01', 'custom', TODAY)).toBe('baseline')
  })

  it('ignores a value the column may not hold', () => {
    expect(leverForDate(TODAY, 'lever-9', TODAY)).toBe('lever-1')
  })
})

describe('what the grader actually sees', () => {
  const goals = { calorie: 2400, protein: 100, carbs: 300, fat: 80, steps: 6000 }

  it('a July day is graded at 1955 and an August one at 1885', () => {
    expect(applyLever(goals, leverForDate('2026-07-20', 'lever-1', TODAY)).calorie).toBe(1955)
    expect(applyLever(goals, leverForDate('2026-08-17', 'lever-1', TODAY)).calorie).toBe(1885)
  })

  it('`custom` today leaves your own numbers alone', () => {
    expect(applyLever(goals, leverForDate(TODAY, 'custom', TODAY))).toBe(goals)
  })
})
