import { describe, it, expect, beforeEach } from 'vitest'
import { parseHevyWorkout } from '@/lib/hevy/parse'
import { hevyWorkoutToDraft, guessDayKey } from '@/lib/hevy/toDraft'
import { buildCommitPayload, draftTotals, peekSessionDraft, DRAFT_STORAGE_KEY } from '@/lib/sessions/draft'
import { SaveWorkoutSchema } from '@/lib/sessions/schema'

/**
 * THE design-baseline fixture: Michael's real Upper B session from 2026-07-16,
 * pasted verbatim (decorated header, cardio warm-up, single-space quirks and
 * the stats trailer). If this file's assertions break, the paste-to-deck flow
 * is broken for the exact payload the app was designed around.
 */
const JULY16 = `
upper b, Thursday 16 jul, week 0 for the Helix 5.1 cut, Upper B (Cut)
Thursday, Jul 16, 2026 at 12:43pm

Treadmill
Set 1: 0.4 km - 5min 0s

Chest Press (Machine)
Set 1: 35 kg x 12
Set 2: 37.5 kg x 12
Set 3: 37.5 kg x 12

Lat Pulldown - Close Grip (Cable)
Set 1: 45 kg x 12
Set 2: 45 kg x 12

Seated Cable Row - Bar Wide Grip
Set 1: 35 kg x 12
Set 2: 35 kg x 12

Single Arm Cable Crossover
Set 1: 7.5 kg x 12
Set 2: 7.5 kg x 15

Single Arm Lateral Raise (Cable)
Set 1: 3.75 kg x 16
Set 2: 3.75 kg x 15
Set 3: 2.5 kg x 20

Single Arm Triceps Pushdown (Cable)
Set 1: 5 kg x 15
Set 2: 6.25 kg x 14

Preacher Curl (Machine)
Set 1: 15 kg x 12
Set 2: 17.5 kg x 12
Set 3: 17.5 kg x 10

time: 1 hour 8 min, 4336.2 kg volume, 18 sets, 2 records by hevy, 125 avg bpm, 466 calories.
`

describe('parseHevyWorkout — July 16 baseline payload', () => {
  const parsed = parseHevyWorkout(JULY16)

  it('parses (the stats trailer used to void the whole parse)', () => {
    expect(parsed).not.toBeNull()
  })

  it('extracts all 7 strength exercises with 17 sets', () => {
    expect(parsed!.exercises.map((e) => e.name)).toEqual([
      'Chest Press (Machine)',
      'Lat Pulldown - Close Grip (Cable)',
      'Seated Cable Row - Bar Wide Grip',
      'Single Arm Cable Crossover',
      'Single Arm Lateral Raise (Cable)',
      'Single Arm Triceps Pushdown (Cable)',
      'Preacher Curl (Machine)',
    ])
    expect(parsed!.setCount).toBe(17)
    expect(parsed!.exercises[0].sets.map((s) => s.weightKg)).toEqual([35, 37.5, 37.5])
    expect(parsed!.exercises[4].sets.map((s) => s.reps)).toEqual([16, 15, 20])
    // Quarter-step loads survive verbatim — 0.1-quantizing (3.75→3.8) once
    // inflated the whole session's volume by ~3 kg.
    expect(parsed!.exercises[4].sets.map((s) => s.weightKg)).toEqual([3.75, 3.75, 2.5])
    expect(parsed!.exercises[5].sets.map((s) => s.weightKg)).toEqual([5, 6.25])
  })

  it('captures the treadmill as cardio, never a 0 kg × 1 junk set', () => {
    expect(parsed!.cardio).toEqual([
      { name: 'Treadmill', distanceKm: 0.4, durationSec: 300, position: 0 },
    ])
    expect(parsed!.exercises.some((e) => e.name === 'Treadmill')).toBe(false)
  })

  it('parses the stats trailer completely', () => {
    expect(parsed!.stats).toEqual({
      durationMin: 68, volumeKg: 4336.2, sets: 18, records: 2, avgBpm: 125, calories: 466,
    })
  })

  it('extracts the date (explicit-year line wins) and start time', () => {
    expect(parsed!.dateISO).toBe('2026-07-16')
    expect(parsed!.timeHHMM).toBe('12:43')
  })

  it('guesses the split from the decorated header', () => {
    expect(parsed!.splitGuess).toBe('upper')
    expect(guessDayKey(parsed!.header.join(' '))).toBe('cb_b')
  })
})

describe('parseHevyWorkout — classic multi-line format', () => {
  const CLASSIC = [
    'Push Day',
    'Saturday, 28 Jun 2026 at 10:30',
    '',
    'Bench Press (Barbell)',
    'Set 1: 60 kg × 10',
    'Set 2: 80 kg × 8',
    'Incline Bench Press (Dumbbell)',
    'Warm-up Set: 20 kg × 12',
    'Set 1: 24 kg × 12',
    'Plank',
    'Set 1: 47s',
    'Pull Ups',
    'Set 1: 12 reps',
  ].join('\n')
  const parsed = parseHevyWorkout(CLASSIC)

  it('keeps the historical behavior (title, splits, timed + bodyweight sets)', () => {
    expect(parsed!.title).toBe('Push Day')
    expect(parsed!.splitGuess).toBe('push')
    expect(parsed!.dateISO).toBe('2026-06-28')
    expect(parsed!.exercises).toHaveLength(4)
    // Plank stays a timed STRENGTH set (0 kg × 1) — not cardio.
    expect(parsed!.cardio).toHaveLength(0)
    expect(parsed!.exercises[2].sets).toEqual([{ setNumber: 1, weightKg: 0, reps: 1 }])
    expect(parsed!.exercises[3].sets[0].reps).toBe(12)
  })

  it('parses single-line "Name Set 1: …" forms', () => {
    const oneLine = parseHevyWorkout('Chest Press (Machine) Set 1: 35 kg x 12 Set 2: 37.5 kg x 12\nTreadmill / Set 1: 0.4 km - 5min 0s\nRow Set 1: 40 kg x 10')
    expect(oneLine).not.toBeNull()
    expect(oneLine!.exercises.map((e) => e.name)).toEqual(['Chest Press (Machine)', 'Row'])
    expect(oneLine!.exercises[0].sets).toHaveLength(2)
    expect(oneLine!.cardio[0]).toMatchObject({ name: 'Treadmill', distanceKm: 0.4 })
  })

  it('still rejects non-Hevy text', () => {
    expect(parseHevyWorkout('Just a sentence about my day at the gym.')).toBeNull()
    expect(parseHevyWorkout('')).toBeNull()
  })
})

describe('hevyWorkoutToDraft — deck-ready draft', () => {
  const draft = hevyWorkoutToDraft(parseHevyWorkout(JULY16)!)

  it('maps day key + split from the header text (beats the weekday schedule)', () => {
    expect(draft.dayKey).toBe('cb_b')
    expect(draft.splitDay).toBe('upper')
    expect(draft.date).toBe('2026-07-16')
    expect(draft.startedAt).toBe('2026-07-16T12:43:00.000Z')
  })

  it('canonicalizes the close-grip alias', () => {
    const lat = draft.exercises.find((e) => e.rawName === 'Lat Pulldown - Close Grip (Cable)')
    expect(lat?.name).toBe('Neutral-Grip Lat Pulldown')
  })

  it('keeps the treadmill first as a cardio card with no sets', () => {
    expect(draft.exercises[0]).toMatchObject({ name: 'Treadmill', kind: 'cardio', distanceKm: 0.4, durationSec: 300 })
    expect(draft.exercises[0].sets).toHaveLength(0)
    expect(draft.exercises).toHaveLength(8)
  })

  it('maps stats and derives a deterministic dedupe id', () => {
    expect(draft.stats).toMatchObject({ duration_min: 68, volume_kg: 4336.2, sets_completed: 18, prs: 2, avg_hr_bpm: 125, calories_kcal: 466 })
    expect(draft.clientSessionId).toBe('hevy-2026-07-16-17-4336')
    // Deterministic: the same paste always yields the same id (dedupe works).
    expect(hevyWorkoutToDraft(parseHevyWorkout(JULY16)!).clientSessionId).toBe(draft.clientSessionId)
  })

  it('commit round-trip: cardio excluded from sets, carried in notes', () => {
    const body = buildCommitPayload(draft)
    expect(SaveWorkoutSchema.safeParse(body).success).toBe(true)
    expect(body.sets).toHaveLength(17)
    expect(body.sets.some((s) => s.exerciseName === 'Treadmill')).toBe(false)
    expect(body.notes).toContain('Cardio — Treadmill: 0.4 km · 5 min')
    expect(body.clientSessionId).toBe('hevy-2026-07-16-17-4336')
    expect(body.metrics).toEqual({ durationMin: 68, avgBpm: 125, caloriesBurned: 466 })
    // exerciseOrder counts strength exercises only (cardio consumes no slot).
    expect(body.sets[0].exerciseOrder).toBe(0)
    expect(body.sets[body.sets.length - 1].exerciseOrder).toBe(6)
    // endedAt = startedAt + 68 min, on the LOGGED day — not "now".
    expect(body.endedAt).toBe('2026-07-16T13:51:00.000Z')
  })

  it('draftTotals matches Hevy volume within 1 kg', () => {
    const { volumeKg, sets } = draftTotals(draft)
    expect(sets).toBe(17)
    expect(Math.abs(volumeKg - 4336.2)).toBeLessThan(1)
  })
})

describe('draft storage v1 → v2 migration', () => {
  beforeEach(() => localStorage.clear())

  it('migrates a legacy live draft: mode/done dropped, all sets kept', () => {
    localStorage.setItem('helix_session_draft:v1', JSON.stringify({
      mode: 'live',
      splitDay: 'upper',
      date: '2026-07-16',
      notes: '',
      startedAt: '2026-07-16T12:00:00.000Z',
      exercises: [{ localId: 'x', name: 'Chest Press (Machine)', sets: [
        { weightKg: 35, reps: 12, done: true }, { weightKg: 37.5, reps: 12, done: false },
      ] }],
    }))
    const migrated = peekSessionDraft()
    expect(migrated).not.toBeNull()
    expect((migrated as unknown as Record<string, unknown>).mode).toBeUndefined()
    expect(migrated!.exercises[0].sets).toEqual([{ weightKg: 35, reps: 12 }, { weightKg: 37.5, reps: 12 }])
    // Rewritten under the v2 key; v1 removed.
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeTruthy()
    expect(localStorage.getItem('helix_session_draft:v1')).toBeNull()
  })

  it('returns null on corrupt or absent storage', () => {
    expect(peekSessionDraft()).toBeNull()
    localStorage.setItem(DRAFT_STORAGE_KEY, '{not json')
    expect(peekSessionDraft()).toBeNull()
  })
})
