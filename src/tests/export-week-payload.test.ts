import { describe, it, expect } from 'vitest'
import { weekPayload, type GoalRow } from '@/lib/hooks/useWeeklyLoop'
import { programTargets } from '@/lib/training/landmarks'

/**
 * ── TWO ARGUMENTS THAT WERE NEVER PASSED ─────────────────────────────────────
 *
 * `weekPayload` assembles one week into the export's input. Two things it should
 * have been carrying, it silently was not — and both are invisible failures,
 * because the payload it produced was perfectly well-formed either way.
 *
 *   · `weeklyVolumeByMuscle` takes user overrides as an optional third argument.
 *     The Command Center passes them; this did not. A landmark edited in
 *     Settings therefore moved the app's grading and left the export grading the
 *     same week against the program defaults — two verdicts on one week, and no
 *     way to tell which you were reading.
 *
 *   · the LEVER in force. The goal row is a single mutable record holding
 *     today's numbers, so a week in which a rung was pulled or released reported
 *     whichever set happened to be current for all seven days.
 *
 * An optional parameter that is simply never supplied cannot be caught by the
 * compiler, and could not be caught by a test either while this function was
 * module-private. It is exported now for exactly that reason.
 */

const EMPTY_RANGE = {
  logs: [], nutrition: [], sessions: [], sets: [], water: [], supps: [],
  doms: [], bodyComp: [], bodyLedger: [], cardio: [], rpe: [], skips: [],
  prAxes: [], whr: [], exceptions: [],
}
// The range is a bag of query results; the tests below only exercise the two
// arguments, so an empty week is the honest fixture.
const range = () => EMPTY_RANGE as unknown as Parameters<typeof weekPayload>[1]

const goals: GoalRow = {
  calorie_goal: 1955, protein_goal_g: 170, carbs_goal_g: 195, fat_goal_g: 55,
  steps_goal: 10000, sleep_goal_hours: 7.5, active_lever: 'custom',
}

describe('weekPayload · per-muscle targets', () => {
  it('uses the program landmarks when the user has overridden nothing', () => {
    const out = weekPayload('2026-08-16', range(), goals, [], 'cut')
    const chest = out.volumeByMuscle.find((m) => m.muscle === 'Chest')
    expect(chest?.target).toBe(programTargets('cut').Chest)
  })

  it('honours an override, so the export and the app grade the same week alike', () => {
    const out = weekPayload('2026-08-16', range(), goals, [], 'cut', { Chest: 20 })
    expect(out.volumeByMuscle.find((m) => m.muscle === 'Chest')?.target).toBe(20)
    // …and leaves every other muscle on the program's own figure.
    const lats = out.volumeByMuscle.find((m) => m.muscle === 'Lats')
    expect(lats?.target).toBe(programTargets('cut').Lats)
  })
})

describe('weekPayload · the rung in force', () => {
  it('resolves the targets PER DAY rather than printing the goal row seven times', () => {
    const out = weekPayload('2026-08-16', range(), goals, [], 'cut')
    // 16–22 Aug spans the release of Lever 1 on the 20th, so this week has two.
    expect(out.targetPeriods?.length).toBeGreaterThan(1)
    expect(out.targetPeriods?.[0].goals.calorie).toBe(1885)
  })

  it('falls back to the goal row for a period with no rung', () => {
    // `custom` means "these are my numbers" — `applyLever` must leave them.
    const out = weekPayload('2026-08-16', range(), goals, [], 'cut')
    const own = out.targetPeriods?.find((p) => p.label === 'Custom')
    expect(own?.goals).toEqual({ calorie: 1955, protein: 170, carbs: 195, fat: 55, steps: 10000 })
  })

  it('still produces periods when the goal row is missing entirely', () => {
    // A user_goals row that failed to load must not take the section with it.
    const out = weekPayload('2026-08-16', range(), null, [], 'cut')
    expect(out.targetPeriods?.length).toBeGreaterThan(0)
  })

  it('keeps the headline goal fields alongside them', () => {
    const out = weekPayload('2026-08-16', range(), goals, [], 'cut')
    expect(out.calorieGoal).toBe(1955)
    expect(out.sleepGoalHours).toBe(7.5)
  })
})
