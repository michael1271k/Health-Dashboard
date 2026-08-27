import { describe, it, expect } from 'vitest'
import { findNextSet, formatLastRpe, formatLastTime } from '@/lib/sessions/nextSet'
import type { SessionDraft, DraftSet } from '@/lib/sessions/draft'
import type { ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'

/**
 * The Live Activity's one decision, held still.
 *
 * Everything else about that feature is unrenderable here — no simulator, no
 * Lock Screen, no Dynamic Island — so the Swift is unverifiable until a device
 * build. What CAN be pinned is WHICH set the card names and WHAT it says about
 * it, which is the whole of the logic; the views only draw strings.
 */
const draftOf = (exercises: SessionDraft['exercises']): SessionDraft => ({
  splitDay: 'upper', date: '2026-08-25', notes: '',
  startedAt: '2026-08-25T09:00:00.000Z', exercises,
})
const ex = (name: string, sets: DraftSet[]) => ({ localId: name, name, sets })
const hist = (sets: ExerciseHistory['sets']): ExerciseHistory => ({ date: '2026-08-18', sets })

describe('the set you are walking towards', () => {
  it('is the first one not ticked green, in deck order', () => {
    const d = draftOf([
      ex('Incline Press', [{ weightKg: 60, reps: 8, done: true }, { weightKg: 60, reps: 8, done: true }]),
      ex('Lateral Raise Cable', [
        { weightKg: 3.75, reps: 16, done: true },
        { weightKg: 3.75, reps: 16, done: false },
      ]),
    ])
    const next = findNextSet(d, undefined)
    expect(next?.exercise).toBe('Lateral Raise Cable')
    expect(next?.setNumber).toBe(2)
    expect(next?.setTotal).toBe(2)
  })

  /**
   * ── AND IT SKIPS GHOSTS, FOR A SHARPER REASON ─────────────────────────────
   * `previousFor` below strips ghosts from LAST session's list. If the
   * numbering above still counted them, the two halves of one comparison would
   * disagree about what a set is: the card would call something "Set 3" that
   * the history side had never counted, and quote the wrong historical set for
   * it. Half of this file was converted to `isWorkingSet` and half was not.
   */
  it('skips ghost sets — they carry no ordinal either', () => {
    const d = draftOf([ex('Bench Press', [
      { weightKg: 80, reps: 6, setType: 'ghost', done: true },
      { weightKg: 80, reps: 6, done: false },
      { weightKg: 80, reps: 6, done: false },
    ])])
    const next = findNextSet(d, undefined)
    expect(next?.setNumber).toBe(1)
    expect(next?.setTotal).toBe(2)
  })

  it('numbers a ghost exactly as it numbers a warm-up', () => {
    const of = (setType: 'warmup' | 'ghost') => findNextSet(draftOf([ex('Bench Press', [
      { weightKg: 20, reps: 12, setType, done: true },
      { weightKg: 80, reps: 6, done: false },
    ])]), undefined)
    expect(of('ghost')?.setNumber).toBe(of('warmup')?.setNumber)
    expect(of('ghost')?.setTotal).toBe(of('warmup')?.setTotal)
  })

  it('skips warm-ups, because a warm-up is not a number to beat', () => {
    const d = draftOf([ex('Bench Press', [
      { weightKg: 20, reps: 12, setType: 'warmup', done: false },
      { weightKg: 80, reps: 6, done: false },
    ])])
    const next = findNextSet(d, undefined)
    // Set ONE, not set two: the warm-up carries no ordinal on the badge either.
    expect(next?.setNumber).toBe(1)
    expect(next?.setTotal).toBe(1)
  })

  it('skips cardio blocks entirely', () => {
    const d = draftOf([
      { localId: 'c', name: 'Treadmill', kind: 'cardio' as const, sets: [] },
      ex('Row', [{ weightKg: 50, reps: 10, done: false }]),
    ])
    expect(findNextSet(d, undefined)?.exercise).toBe('Row')
  })

  it('counts a unilateral pair as ONE set, the way the deck ticks it', () => {
    const d = draftOf([ex('Single Arm Pushdown', [
      { weightKg: 15, reps: 12, side: 'L', pairId: 'p1', done: true },
      { weightKg: 15, reps: 12, side: 'R', pairId: 'p1', done: true },
      { weightKg: 15, reps: 12, side: 'L', pairId: 'p2', done: false },
      { weightKg: 15, reps: 12, side: 'R', pairId: 'p2', done: false },
    ])])
    const next = findNextSet(d, undefined)
    expect(next?.setNumber).toBe(2)
    expect(next?.setTotal).toBe(2)
  })

  it('says nothing at all once every set is done', () => {
    const d = draftOf([ex('Row', [{ weightKg: 50, reps: 10, done: true }])])
    expect(findNextSet(d, undefined)).toBeNull()
  })

  it('lines last time up by WORKING set number, not by row index', () => {
    // Last week opened with a warm-up and this week does not. Matching by index
    // would put today's second working set against last week's first.
    const d = draftOf([ex('Bench Press', [
      { weightKg: 80, reps: 6, done: true },
      { weightKg: 80, reps: 6, done: false },
    ])])
    const h = new Map([['Bench Press', hist([
      { weightKg: 20, reps: 12, setType: 'warmup' },
      { weightKg: 77.5, reps: 7, rpe: 8 },
      { weightKg: 77.5, reps: 6, rpe: 9.5 },
    ])]])
    const next = findNextSet(d, h)
    expect(next?.lastWeightKg).toBe(77.5)
    expect(next?.lastReps).toBe(6)
    expect(next?.lastRpe).toBe(9.5)
  })

  it('reports nothing when last time had fewer sets than today does', () => {
    const d = draftOf([ex('Row', [
      { weightKg: 50, reps: 10, done: true },
      { weightKg: 50, reps: 10, done: false },
    ])])
    const h = new Map([['Row', hist([{ weightKg: 47.5, reps: 11 }])]])
    const next = findNextSet(d, h)
    // Not the first set's numbers wearing the second set's label.
    expect(next?.lastWeightKg).toBeNull()
    expect(formatLastTime(next)).toBe('')
  })
})

describe('what the card says about it', () => {
  const from = (w: number | null, r: number | null, rpe: number | null = null) => ({
    exercise: 'X', setNumber: 1, setTotal: 1, lastWeightKg: w, lastReps: r, lastRpe: rpe,
  })

  it('keeps a quarter-plate load exact', () => {
    // 3.75 must not render as 3.8 — the reported bug's own load.
    expect(formatLastTime(from(3.75, 16))).toBe('3.75 kg × 16')
    expect(formatLastTime(from(60, 8))).toBe('60 kg × 8')
    expect(formatLastTime(from(77.5, 6))).toBe('77.5 kg × 6')
  })

  it('never prints a weight an unloaded set does not have', () => {
    // "0 kg × 17" is the blind spot that once broke Epley, double progression
    // and every unloaded label in the app.
    expect(formatLastTime(from(0, 17))).toBe('17 reps')
    expect(formatLastTime(from(null, 17))).toBe('17 reps')
  })

  it('renders an absent fact as nothing rather than as a dash', () => {
    expect(formatLastTime(null)).toBe('')
    expect(formatLastTime(from(60, null))).toBe('')
    expect(formatLastRpe(from(60, 8, null))).toBe('')
    expect(formatLastRpe(from(60, 8, 10))).toBe('RPE 10')
  })
})
