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

/**
 * ── THE PR LINE PRINTS A NUMBER NOW, SO THE NUMBER HAS TO BE THE RIGHT ONE ───
 *
 * The export used to name the AXIS a record fell on and stop there. It now
 * prints the value — "Volume: 40 kg, 1RM: 54.67 kg" — which turns a label into
 * a claim, and one of the two was being derived a second time instead of asked
 * for.
 *
 * A unilateral pair is ONE set scored at the WEAKER side. `volumeCredits` files
 * that collapsed figure on whichever row COMPLETES the pair — a positional rule
 * that has nothing to do with which side was weaker — so the `is_pr` row's own
 * `weight × reps` can be the stronger side's product while the record that
 * actually entered the ledger is the weaker one's. Re-deriving it here printed
 * 60 kg beside an axis whose value was 40.
 */
describe('weekPayload · the values on a PR line', () => {
  const row = (o: Record<string, unknown>) => ({
    id: 'r1', session_id: 's1', pair_id: null, side: null,
    weight_kg: 40, reps: 11, rpe: null, est_1rm_kg: null, set_type: 'normal',
    is_pr: false, exercise_order: 1, set_number: 1,
    exercises: { name: 'Incline DB Press', muscle_groups: ['chest'] },
    ...o,
  })
  const withSets = (sets: unknown[]) => ({
    ...EMPTY_RANGE,
    sessions: [{
      id: 's1', started_at: '2026-08-16T09:00:00Z', split_day: 'upper',
      day_key: 'upper_a', total_volume_kg: 440, set_count: sets.length,
      duration_min: 60, avg_bpm: null, calories_burned: null,
      calories_estimated: false, avg_bpm_estimated: false,
    }],
    sets,
    prAxes: [{ session_id: 's1', exercise_key: 'Incline DB Press', axis: 'volume' }],
  }) as unknown as Parameters<typeof weekPayload>[1]

  it('carries the set tonnage and the Epley estimate for an ordinary set', () => {
    const out = weekPayload('2026-08-16', withSets([row({ is_pr: true })]), goals, [], 'cut')
    const pr = out.sessions[0].prs[0]
    expect(pr.volumeKg).toBe(440)              // 40 × 11
    expect(pr.e1rmKg).toBeCloseTo(54.7, 1)     // 40 × (1 + 11/30)
  })

  it('prefers the STORED estimate over recomputing it', () => {
    const out = weekPayload('2026-08-16',
      withSets([row({ is_pr: true, est_1rm_kg: 53.73 })]), goals, [], 'cut')
    expect(out.sessions[0].prs[0].e1rmKg).toBe(53.73)
  })

  it('never prints a 1RM for unloaded work, where the stored estimate is 0', () => {
    // `||` and not `??`: 0 is a number the report would happily print.
    const out = weekPayload('2026-08-16',
      withSets([row({ is_pr: true, weight_kg: 0, reps: 17, est_1rm_kg: 0 })]), goals, [], 'cut')
    expect(out.sessions[0].prs[0].e1rmKg).toBeNull()
  })

  it('scores a unilateral pair at the WEAKER side, not at the credited row', () => {
    // L 5 × 8 = 40, R 6 × 10 = 60. The pair is one 40 kg set. `is_pr` lands on
    // the row that completes the pair — here the stronger R — so a re-derived
    // `weight × reps` would print 60 against a ledger holding 40.
    const out = weekPayload('2026-08-16', withSets([
      row({ id: 'l', pair_id: 'p1', side: 'L', weight_kg: 5, reps: 8, set_number: 1 }),
      row({ id: 'r', pair_id: 'p1', side: 'R', weight_kg: 6, reps: 10, set_number: 2, is_pr: true }),
    ]), goals, [], 'cut')
    expect(out.sessions[0].prs[0].volumeKg).toBe(40)
  })
})
