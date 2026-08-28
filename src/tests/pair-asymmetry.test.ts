import { describe, it, expect } from 'vitest'
import { pairAsymmetry, buildCommitPayload, type SessionDraft, type DraftSet } from '@/lib/sessions/draft'

/**
 * ── THE WEAKER SIDE, ON WORK THAT CARRIES NO LOAD ────────────────────────────
 *
 * `pairAsymmetry` is the −12% L chip on a unilateral pair, and it measured
 * `weightKg × reps`. On an UNLOADED unilateral movement — a side plank, a
 * single-leg glute bridge, a suitcase carry — both sides scored zero, the
 * maximum was zero, and the function returned null. A 65-second right side
 * against a 40-second left one, which is precisely the imbalance this chip
 * exists to surface, reported nothing at all.
 *
 * This is the `unloaded-work-blind-spot` class, which this project has broken
 * more than once: a zero in the weight column means a movement without LOAD,
 * never a movement without EFFORT. When there is no load, the value column IS
 * the work — seconds for a hold, reps for bodyweight — so that is what gets
 * compared.
 */

const L = (weightKg: number, reps: number): DraftSet => ({ weightKg, reps, side: 'L', pairId: 'p' })
const R = (weightKg: number, reps: number): DraftSet => ({ weightKg, reps, side: 'R', pairId: 'p' })

describe('pairAsymmetry — loaded work', () => {
  it('names the weaker side and the gap by tonnage', () => {
    // 30×10 = 300 against 30×8 = 240 → the left is 20% down.
    expect(pairAsymmetry(L(30, 8), R(30, 10))).toEqual({ pct: 20, weak: 'L' })
  })

  it('reads a load difference as well as a rep difference', () => {
    // 27.5×10 = 275 against 30×10 = 300 → 8% down on the right.
    expect(pairAsymmetry(L(30, 10), R(27.5, 10))).toEqual({ pct: 8, weak: 'R' })
  })

  it('says nothing about a trivial gap', () => {
    // 2% — inside the rounding of a rep, and not an asymmetry worth a chip.
    expect(pairAsymmetry(L(30, 49), R(30, 50))).toBeNull()
  })

  it('says nothing about a matched pair', () => {
    expect(pairAsymmetry(L(30, 10), R(30, 10))).toBeNull()
  })
})

describe('pairAsymmetry — unloaded work (the blind spot)', () => {
  /** 2026-08-28's Side Plank: the case that reported nothing. */
  it('compares SECONDS on a timed hold that carries no load', () => {
    expect(pairAsymmetry(L(0, 40), R(0, 65))).toEqual({ pct: 38, weak: 'L' })
  })

  it('compares REPS on a bodyweight movement that carries no load', () => {
    expect(pairAsymmetry(L(0, 12), R(0, 10))).toEqual({ pct: 17, weak: 'R' })
  })

  it('still says nothing when the two unloaded sides match', () => {
    expect(pairAsymmetry(L(0, 60), R(0, 60))).toBeNull()
  })

  /**
   * A weighted variant is judged on tonnage even though the OTHER pairs of the
   * same movement may be unloaded — the rule is per pair, on what that pair
   * actually did, so a belt on one set cannot change how another is read.
   */
  it('switches back to tonnage the moment a pair carries load', () => {
    expect(pairAsymmetry(L(5, 40), R(5, 65))).toEqual({ pct: 38, weak: 'L' })
  })

  it('reports nothing when there is genuinely no work on either side', () => {
    expect(pairAsymmetry(L(0, 0), R(0, 0))).toBeNull()
  })

  it('needs both sides — half a pair is not a comparison', () => {
    expect(pairAsymmetry(undefined, R(0, 65))).toBeNull()
    expect(pairAsymmetry(L(0, 65), undefined)).toBeNull()
  })
})

/**
 * ── endedAt IS WALL CLOCK, duration_min IS WORK ──────────────────────────────
 *
 * `duration_min` is the time the workout was RUNNING: `sessionActiveSec`
 * subtracts every paused second, which is the entire point of the pause. So
 * `endedAt`, which is derived from it, has to add the pause back on — otherwise
 * a session paused for twenty minutes is recorded as having ended twenty
 * minutes before the athlete walked out.
 */
describe('buildCommitPayload — endedAt under a pause', () => {
  const draft = (over: Partial<SessionDraft>): SessionDraft => ({
    splitDay: 'legs',
    date: '2026-08-28',
    notes: '',
    startedAt: '2026-08-28T12:00:00.000Z',
    exercises: [{ localId: 'x', name: 'Leg Press', sets: [{ weightKg: 72.5, reps: 14 }] }],
    stats: {
      duration_min: 60, volume_kg: null, sets_completed: null, prs: null,
      avg_hr_bpm: null, calories_kcal: null,
    },
    ...over,
  })

  it('is startedAt + duration when the session was never paused', () => {
    const body = buildCommitPayload(draft({}))
    expect(body.endedAt).toBe('2026-08-28T13:00:00.000Z')
    expect(body.metrics?.durationMin).toBe(60)
  })

  it('adds a banked pause back on, and leaves the duration alone', () => {
    const body = buildCommitPayload(draft({ pausedMs: 20 * 60_000 }))
    // 60 minutes of work, 20 minutes standing still → out of the gym at 13:20.
    expect(body.endedAt).toBe('2026-08-28T13:20:00.000Z')
    // The stored duration is still the work, not the wall clock.
    expect(body.metrics?.durationMin).toBe(60)
  })

  it('leaves a back-dated deck exactly as it was', () => {
    const body = buildCommitPayload(draft({
      date: '2026-07-04', startedAt: '2026-07-04T09:30:00.000Z',
    }))
    expect(body.endedAt).toBe('2026-07-04T10:30:00.000Z')
  })
})
