import { describe, it, expect } from 'vitest'
import { scopeToDay } from '@/components/command-center/ProgressionAlerts'
import { bucketByExerciseDay, exerciseDayKey, lastTwoSessions } from '@/lib/hooks/useProgressionQueue'
import { progressionVerdict } from '@/lib/training/ceilings'

/**
 * The Smart-Coach queue is plan-wide by design — the Session Deck wants every
 * lift. The banner is not: a Legs B cue on an Upper A morning is an instruction
 * you cannot act on, and a dozen of them is a list you stop reading.
 */
const QUEUE = [
  { name: 'Hack Squat', dayKey: 'legs_b' },
  { name: 'Chest Press', dayKey: 'cb_a' },
  { name: 'Leg Press', dayKey: 'legs_b' },
  { name: 'Lat Pulldown', dayKey: 'cb_a' },
]

describe('scopeToDay', () => {
  it('keeps only the scheduled day’s lifts', () => {
    expect(scopeToDay(QUEUE, 'legs_b').map((a) => a.name)).toEqual(['Hack Squat', 'Leg Press'])
  })

  it('returns nothing when the day has no lifts due — the banner then hides', () => {
    expect(scopeToDay(QUEUE, 'arms')).toEqual([])
  })

  it('follows a SWAP, because the caller passes the resolved day key', () => {
    // Swapping today to Legs B must move the cues with it, not keep Upper A's.
    expect(scopeToDay(QUEUE, 'cb_a').map((a) => a.name)).toEqual(['Chest Press', 'Lat Pulldown'])
    expect(scopeToDay(QUEUE, 'legs_b').map((a) => a.name)).toEqual(['Hack Squat', 'Leg Press'])
  })

  it('keeps EVERYTHING when the day has no key — the PPL era', () => {
    // Legacy dates resolve to a bare label. Every alert carries a Helix dayKey,
    // so filtering there would empty the widget rather than scope it.
    expect(scopeToDay(QUEUE, null)).toHaveLength(4)
    expect(scopeToDay(QUEUE, undefined)).toHaveLength(4)
    expect(scopeToDay(QUEUE, '')).toHaveLength(4)
  })

  it('does not mutate or alias the input queue', () => {
    const out = scopeToDay(QUEUE, null)
    expect(out).not.toBe(QUEUE)
    expect(QUEUE).toHaveLength(4)
  })

  it('drops alerts with a null dayKey once a day IS scoped', () => {
    // A keyless alert belongs to no day, so it cannot belong to this one.
    const mixed = [...QUEUE, { name: 'Orphan', dayKey: null }]
    expect(scopeToDay(mixed, 'legs_b').map((a) => a.name)).toEqual(['Hack Squat', 'Leg Press'])
  })
})

/**
 * The QUEUE's own history must be routine-scoped too.
 *
 * Leg Press is programmed twice with different windows — 8–12 on Legs A, 12–15
 * on Legs B ("horizontal sled"). The set history used to be fetched by
 * `exercise_id` alone and shared between both targets, so the Legs A target
 * (ceiling 12) was graded against Legs B sets. Two Legs B sessions of 13×2 at
 * one load cleared a ceiling of 12 twice, and the coach said "add load" on a
 * lift that had never touched its own window.
 */
const LEG_PRESS = 'ex-leg-press'

const set = (dayKey: string | null, at: string, weightKg: number, reps: number, setType: string | null = null) => ({
  exercise_id: LEG_PRESS,
  weight_kg: weightKg,
  reps,
  set_type: setType,
  workout_sessions: { started_at: at, day_key: dayKey },
})

// Two Legs B sessions: 72.5 × 13, twice each. Under Legs B's own ceiling of 15
// this clears nothing. Under Legs A's ceiling of 12 it clears twice.
const LEGS_B_HISTORY = [
  set('legs_b', '2026-08-07T09:00:00Z', 72.5, 13),
  set('legs_b', '2026-08-07T09:00:00Z', 72.5, 13),
  set('legs_b', '2026-08-14T09:00:00Z', 72.5, 13),
  set('legs_b', '2026-08-14T09:00:00Z', 72.5, 13),
]

describe('bucketByExerciseDay', () => {
  it('keeps Legs A and Legs B apart for the same exercise', () => {
    const rows = [
      ...LEGS_B_HISTORY,
      set('legs_a', '2026-08-10T09:00:00Z', 100, 9),
    ]
    const byExDay = bucketByExerciseDay(rows)
    expect([...byExDay.keys()].sort()).toEqual([
      exerciseDayKey('legs_a', LEG_PRESS),
      exerciseDayKey('legs_b', LEG_PRESS),
    ])
  })

  it('THE BUG: Legs B sets never reach the Legs A bucket', () => {
    // This is the whole fix. Before the day_key join, `lastTwoSessions` for the
    // Legs A target returned the two Legs B sessions above and the ceiling-12
    // verdict came back "ready".
    const byExDay = bucketByExerciseDay(LEGS_B_HISTORY)
    expect(lastTwoSessions(byExDay, 'legs_a', LEG_PRESS)).toEqual([])
    expect(lastTwoSessions(byExDay, 'legs_b', LEG_PRESS)).toHaveLength(2)
  })

  it('groups sets of one session together and orders sessions oldest first', () => {
    const byExDay = bucketByExerciseDay(LEGS_B_HISTORY)
    const sessions = lastTwoSessions(byExDay, 'legs_b', LEG_PRESS)
    expect(sessions).toEqual([
      [{ weightKg: 72.5, reps: 13 }, { weightKg: 72.5, reps: 13 }],
      [{ weightKg: 72.5, reps: 13 }, { weightKg: 72.5, reps: 13 }],
    ])
  })

  it('keeps only the last two sessions, newest last', () => {
    const rows = [
      set('legs_b', '2026-07-24T09:00:00Z', 65, 12),
      ...LEGS_B_HISTORY,
    ]
    const sessions = lastTwoSessions(bucketByExerciseDay(rows), 'legs_b', LEG_PRESS)
    expect(sessions).toHaveLength(2)
    expect(sessions.every((s) => s[0].weightKg === 72.5)).toBe(true)
  })

  it('drops warm-ups — a light opener is not evidence about a ceiling', () => {
    const rows = [
      set('legs_b', '2026-08-14T09:00:00Z', 40, 20, 'warmup'),
      set('legs_b', '2026-08-14T09:00:00Z', 72.5, 13),
    ]
    expect(lastTwoSessions(bucketByExerciseDay(rows), 'legs_b', LEG_PRESS)).toEqual([
      [{ weightKg: 72.5, reps: 13 }],
    ])
  })

  it('drops sessions with no day_key rather than pooling them', () => {
    // A Notion-era row cannot be attributed to a routine, so it cannot be graded
    // against a routine's ceiling.
    const rows = [set(null, '2026-08-14T09:00:00Z', 72.5, 13)]
    expect(bucketByExerciseDay(rows).size).toBe(0)
  })
})

describe('the verdict this feeds', () => {
  it('a Legs B session of 13×2 does NOT clear the Legs B ceiling of 15', () => {
    const sessions = lastTwoSessions(bucketByExerciseDay(LEGS_B_HISTORY), 'legs_b', LEG_PRESS)
    expect(progressionVerdict(sessions, 15).state).toBe('no')
  })

  it('and it WOULD have cleared the Legs A ceiling of 12 — the false positive', () => {
    // Kept as a guard: if this ever stops being true, the bug was in the engine
    // and not in the scoping, and the fix above is aimed at the wrong thing.
    const sessions = lastTwoSessions(bucketByExerciseDay(LEGS_B_HISTORY), 'legs_b', LEG_PRESS)
    expect(progressionVerdict(sessions, 12).state).toBe('ready')
  })
})
