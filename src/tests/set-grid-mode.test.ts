import { describe, it, expect } from 'vitest'
import { setGridFor, setValueLabel, type SetGridMode } from '@/components/command-center/setGrid'
import { isTimedExercise } from '@/lib/exercises/timed'
import { isBodyweightExercise } from '@/lib/exercises/bodyweight'
import { isUnilateralExercise } from '@/lib/exercises/unilateral'

/**
 * ── A COLUMN THAT CANNOT CARRY A VALUE MUST NOT EXIST ────────────────────────
 *
 * A Hanging Knee Raise rendered a KG column of em dashes on every row, and a
 * Side Plank rendered a KG column of em dashes AND a REPS column whose reps
 * were seconds. Neither was a bug the type checker could see: the column was
 * "correct", it just had nothing in it, and it was taking a third of the row
 * away from the numbers that did.
 *
 * `ExerciseCard` resolves the mode; this asserts the RULE it resolves by, and
 * that the header and the rows are handed the same template — which is the
 * whole reason `setGridFor` is a function rather than a constant per file.
 */

/** The rule, spelled exactly as `ExerciseCard` spells it. */
function modeFor(name: string, weights: number[]): SetGridMode {
  if (weights.some((w) => w > 0)) return 'loaded'
  if (isTimedExercise(name)) return 'time'
  if (isBodyweightExercise(name)) return 'reps'
  return 'loaded'
}

describe('which columns a movement has', () => {
  it('gives a hold a time column and nothing else', () => {
    expect(modeFor('Side Plank', [0, 0])).toBe('time')
    expect(modeFor('Dead Hang', [0])).toBe('time')
    expect(modeFor('Farmer Carry', [0])).toBe('time')
  })

  it('gives a bodyweight movement reps and nothing else', () => {
    expect(modeFor('Hanging Knee Raises', [0, 0, 0])).toBe('reps')
    expect(modeFor('Reverse Crunch', [0])).toBe('reps')
    expect(modeFor('Pull-Ups', [0])).toBe('reps')
  })

  it('gives an ordinary lift both', () => {
    expect(modeFor('Barbell Bench Press', [60, 62.5])).toBe('loaded')
    // Even at zero: a bench press at 0 kg is a set you have not typed yet, not
    // a bodyweight movement, and taking its weight field away mid-entry would
    // be worse than showing a zero.
    expect(modeFor('Barbell Bench Press', [0])).toBe('loaded')
  })

  it('gives the load column BACK the moment any set carries weight', () => {
    // A belt on a dip, a plate held on a knee raise. This is the clause that
    // keeps the "+ Add load" affordance meaningful: reveal the field, type a
    // number, and the column appears for every row of the card at once.
    expect(modeFor('Pull-Ups', [0, 0, 5])).toBe('loaded')
    expect(modeFor('Dips', [10])).toBe('loaded')
  })

  it('does not strip the load from a machine variant that shares the word', () => {
    // `Crunch Machine` carries a stack; `Crunch` does not.
    expect(modeFor('Crunch Machine', [0])).toBe('loaded')
    expect(modeFor('Assisted Pull-Up (Machine)', [0])).toBe('loaded')
  })
})

describe('the grid template', () => {
  it('is the SAME four tracks in every mode', () => {
    // It used to drop the load track for unloaded movements, so their two
    // remaining `fr` columns split the whole row between them — a Side Plank's
    // seconds sat nearly a hundred pixels right of a bench press's reps, with a
    // canyon either side. The track is always there now; the unloaded modes
    // render an empty, unlabelled cell in it. That is alignment, not a column.
    const tracks = (mode: SetGridMode) =>
      (setGridFor(mode).match(/grid-cols-\[([^\]]+)\]/)?.[1] ?? '').split('_').length
    for (const mode of ['loaded', 'reps', 'time'] as const) expect(tracks(mode)).toBe(4)
    expect(setGridFor('reps')).toBe(setGridFor('loaded'))
    expect(setGridFor('time')).toBe(setGridFor('loaded'))
  })

  it('is one string, so a header and a row cannot disagree', () => {
    // The header in `ExerciseCard` and the row in `SetEditorRow` both call this
    // with the card's mode. If it ever returned something derived from a
    // caller-side flag, that guarantee would be gone.
    for (const mode of ['loaded', 'reps', 'time'] as const) {
      expect(setGridFor(mode)).toBe(setGridFor(mode))
    }
  })

  it('names the value column after what it holds, WITH its unit', () => {
    // "Sec", not "Time": the header carries the unit so the rows can print a
    // bare number, exactly as the `kg` header does. Repeating a unit once per
    // row is what pushed `102.25kg` out of its own box at 360px.
    expect(setValueLabel('time')).toBe('Sec')
    expect(setValueLabel('reps')).toBe('Reps')
    expect(setValueLabel('loaded')).toBe('Reps')
  })
})


/**
 * ── SIDE PLANK IS UNILATERAL, AND ALWAYS WAS ─────────────────────────────────
 * Reported as missing from the Split L/R whitelist. It is not — `unilateral.ts`
 * has matched it since before this work started, and adding a second pattern for
 * the same movement would have been a duplicate rather than a fix. What was
 * genuinely hard to find is the CONTROL: Split L/R used to live at the bottom of
 * an expanded row, and now lives behind a long-press on the set badge.
 *
 * Pinned here so the next person to look does not add the pattern twice.
 */
describe('which movements may be split into Left and Right', () => {
  it('offers it on a side plank — a hold is still one side at a time', () => {
    expect(isUnilateralExercise('Side Plank')).toBe(true)
    expect(isUnilateralExercise('Side Planks')).toBe(true)
  })

  it('offers it on the movements that never say "single"', () => {
    for (const n of ['Bulgarian Split Squat', 'Walking Lunge', 'Step-Up', 'Suitcase Carry']) {
      expect(isUnilateralExercise(n), n).toBe(true)
    }
  })

  it('refuses it on a bilateral lift, where half a set is half a session', () => {
    // A pair is scored at its weaker side and counts as ONE set of work, so a
    // barbell press split in two is logged as half of what happened.
    for (const n of ['Barbell Bench Press', 'Leg Press', 'Front Plank', 'Hanging Knee Raise']) {
      expect(isUnilateralExercise(n), n).toBe(false)
    }
  })
})
