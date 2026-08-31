import { describe, it, expect } from 'vitest'
import { buildCommitPayload, type SessionDraft, type DraftExercise } from '@/lib/sessions/draft'
import { exerciseIconFor } from '@/lib/exercises/icons'
import { formatPreviousCardio } from '@/lib/hooks/usePreviousCardio'
import { setGridFor, setValueLabel } from '@/components/command-center/setGrid'

const cardio = (over: Partial<DraftExercise> = {}): DraftExercise => ({
  localId: 'c1',
  name: 'Treadmill',
  kind: 'cardio',
  distanceKm: 0.37,
  durationSec: 300,
  sets: [],
  ...over,
})

const draftWith = (ex: DraftExercise[]): SessionDraft => ({
  clientSessionId: 'test',
  splitDay: 'Upper A',
  date: '2026-08-31',
  startedAt: '2026-08-31T09:00:00.000Z',
  notes: '',
  exercises: ex,
} as unknown as SessionDraft)

/**
 * ── AN UNTICKED BLOCK IS A SKIPPED ONE ───────────────────────────────────────
 *
 * This is the whole reason `DraftExercise.done` exists. Every deck opens with
 * the template's treadmill already carrying 0.37 km and 5 minutes, so before the
 * tick a block with numbers in it was indistinguishable from a block that had
 * been walked — and it was written to `cardio_logs` either way. That row then
 * enters the Zone-2 count and the cardio records as a walk that never happened.
 */
describe('the treadmill has to be ticked', () => {
  it('drops a block that was never marked done', () => {
    const payload = buildCommitPayload(draftWith([cardio()]))
    expect(payload.cardio ?? []).toEqual([])
  })

  it('writes it once it is', () => {
    const payload = buildCommitPayload(draftWith([cardio({ done: true })]))
    expect(payload.cardio).toHaveLength(1)
    expect(payload.cardio![0]).toMatchObject({ name: 'Treadmill', distanceKm: 0.37, durationSec: 300 })
  })

  it('still drops a ticked block with no figures at all', () => {
    // The older rule, unchanged: an empty treadmill card is a card you did not
    // use, and ticking it does not invent a distance.
    const payload = buildCommitPayload(draftWith([
      cardio({ done: true, distanceKm: undefined, durationSec: undefined }),
    ]))
    expect(payload.cardio ?? []).toEqual([])
  })

  it('carries the incline through when one was set', () => {
    const payload = buildCommitPayload(draftWith([cardio({ done: true, inclinePct: 6 })]))
    expect(payload.cardio![0]).toMatchObject({ inclinePct: 6 })
  })
})

describe('the treadmill row shares the deck’s table', () => {
  it('uses the same four-track grid every set row uses', () => {
    // Sharing the template is what puts the treadmill's distance on the same
    // vertical axis as every load in the session. A grid of its own, sized to
    // three values, is exactly what would make it look like a different kind of
    // thing from the ten rows beneath it.
    expect(setGridFor('cardio')).toBe(setGridFor('loaded'))
    expect(setGridFor('cardio')).toBe(setGridFor('time'))
  })

  it('does not try to name its two value columns with one word', () => {
    expect(setValueLabel('loaded')).toBe('Reps')
    expect(setValueLabel('time')).toBe('Sec')
    expect(setValueLabel('cardio')).toBe('Min')
  })
})

describe('the previous line', () => {
  it('reads as a distance and a clock time', () => {
    expect(formatPreviousCardio({
      distanceKm: 0.37, durationMin: 5, inclinePct: null, date: '2026-08-24',
    })).toBe('0.37 km in 5:00')
  })

  it('carries a part-minute rather than rounding it away', () => {
    // A 4:30 warm-up and a 5:00 warm-up are different sessions, and the deck's
    // own unit is minutes precisely so a half minute survives.
    expect(formatPreviousCardio({
      distanceKm: 2, durationMin: 12.5, inclinePct: null, date: '2026-08-24',
    })).toBe('2.00 km in 12:30')
  })

  it('says only what it has', () => {
    expect(formatPreviousCardio({
      distanceKm: null, durationMin: 5, inclinePct: null, date: '2026-08-24',
    })).toBe('5:00')
    expect(formatPreviousCardio({
      distanceKm: null, durationMin: null, inclinePct: null, date: '2026-08-24',
    })).toBeNull()
    expect(formatPreviousCardio(null)).toBeNull()
  })
})

/**
 * The icons are a HEURISTIC over the catalogue's own naming convention — see
 * `exercises/icons.ts`. What is pinned here is the ORDER, because that is the
 * part with a wrong answer: an equipment-first list files "Cable Lateral Raise
 * (Machine)" under the machine, and "Treadmill" under nothing at all.
 */
describe('exercise glyphs', () => {
  it('recognises the treadmill before anything else', () => {
    expect(exerciseIconFor('Treadmill').label).toBe('Treadmill')
    expect(exerciseIconFor('Incline Walk').label).toBe('Treadmill')
  })

  it('prefers the specific equipment when a name carries two', () => {
    expect(exerciseIconFor('Cable Lateral Raise (Machine)').label).toBe('Cable')
    expect(exerciseIconFor('Seated Cable Row').label).toBe('Cable')
    expect(exerciseIconFor('Chest Press (Machine)').label).toBe('Machine')
    expect(exerciseIconFor('Dumbbell Bench Press').label).toBe('Dumbbell')
  })

  it('reads a timed hold as a hold, not as whatever it is held with', () => {
    expect(exerciseIconFor('Plank').label).toBe('Timed hold')
    expect(exerciseIconFor('Dead Hang').label).toBe('Timed hold')
  })

  it('never guesses equipment it cannot see', () => {
    // The fallback is an arrow, not a dumbbell: a movement this file cannot
    // place is not "probably a dumbbell exercise", and defaulting to the most
    // common equipment would put a confidently wrong claim on every unmatched
    // row.
    expect(exerciseIconFor('Zercher Something').label).toBe('Exercise')
    expect(exerciseIconFor('').label).toBe('Exercise')
    expect(exerciseIconFor(null).label).toBe('Exercise')
  })

  it('always returns an icon, for every name', () => {
    for (const name of ['', 'x', 'Squat', 'Leg Press Horizontal (Machine)']) {
      expect(exerciseIconFor(name).icon).toBeTruthy()
    }
  })
})
