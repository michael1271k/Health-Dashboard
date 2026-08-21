import { describe, it, expect } from 'vitest'
import { sessionPrRecords, prSetKey, type PrHistoryRow } from '@/lib/hooks/useSessionPrRecords'
import type { DetailSet, DetailExercise, SessionDetail } from '@/lib/hooks/useSessionDetail'

/**
 * ── THE LEDGER CANNOT ANSWER "BY HOW MUCH" ───────────────────────────────────
 *
 * `personal_records` stores a record's `value` and not the value it beat, and it
 * is written with an upsert-on-conflict — so recording a new best DESTROYS the
 * figure it replaced. Correct for a record book, useless for a delta.
 *
 * The live logger has the delta because `detectSessionPrs` reads the beaten
 * baseline one line before absorbing the set that beat it; it exists for the
 * duration of that commit and is never persisted.
 *
 * So the report re-derives it from the movement's whole history. These tests
 * pin the two things that can go wrong with re-deriving: judging the session
 * against ITSELF (every delta comes out zero), and judging it against its own
 * FUTURE (a July record graded on August's sets never happened).
 */

let n = 0
const set = (o: Partial<DetailSet> = {}): DetailSet => ({
  setNumber: ++n, weightKg: 60, reps: 10, rpe: null, isPr: false, est1rmKg: null,
  setType: 'normal', side: null, pairId: null, prAxes: [], ...o,
})

const exercise = (sets: DetailSet[], name = 'Chest Press', exerciseId = 'ex1'): DetailExercise => ({
  exerciseId, name, order: 1, muscleGroups: ['Chest'], isCompound: true,
  sets, workingSets: sets.length, topKg: Math.max(...sets.map((s) => s.weightKg)),
  volumeKg: 0, bestEst1rm: null, prAxes: [],
})

type Input = Pick<SessionDetail, 'id' | 'date' | 'dayKey' | 'exercises'>
const detail = (exercises: DetailExercise[], date = '2026-08-14'): Input =>
  ({ id: 's1', date, dayKey: 'upper_b', exercises })

const hist = (date: string, weightKg: number, reps: number, name = 'Chest Press'): PrHistoryRow =>
  ({ name, date, weightKg, reps, est1rmKg: null, setType: null, side: null, pairId: null })

describe('sessionPrRecords', () => {
  it('names what a record beat, and by how much', () => {
    n = 0
    const out = sessionPrRecords(
      detail([exercise([set({ weightKg: 65, reps: 8 })])]),
      [hist('2026-08-07', 60, 8), hist('2026-07-31', 57.5, 8)],
    )
    const rec = out.bySet.get(prSetKey('ex1', 1))
    expect(rec?.weight).toEqual({ value: 65, previous: 60 })
  })

  /**
   * The failure mode that makes re-derivation worthless. The session's own sets
   * are in `workout_sets` too, so a history query that does not exclude them
   * hands the detector a baseline already standing at the record's own value —
   * and every record comes back "beat 65 with 65".
   */
  it('never judges a session against itself', () => {
    n = 0
    const d = detail([exercise([set({ weightKg: 65, reps: 8 })])])
    const withOwnRows = sessionPrRecords(d, [
      hist('2026-08-07', 60, 8),
      hist('2026-08-14', 65, 8),   // this session's own row, same date
    ])
    expect(withOwnRows.bySet.get(prSetKey('ex1', 1))?.weight)
      .toEqual({ value: 65, previous: 60 })
  })

  /** A report graded against later sessions is a report grading itself on its own future. */
  it('ignores everything after the session date', () => {
    n = 0
    const out = sessionPrRecords(
      detail([exercise([set({ weightKg: 65, reps: 8 })])], '2026-08-14'),
      [hist('2026-08-07', 60, 8), hist('2026-08-21', 90, 8)],
    )
    // 90 kg was lifted a week LATER; it cannot have been the bar on 14 August.
    expect(out.bySet.get(prSetKey('ex1', 1))?.weight).toEqual({ value: 65, previous: 60 })
  })

  /**
   * ── THE SEEDED ERA IS NOT ARITHMETIC ─────────────────────────────────────
   * Sessions on or before 2026-07-31 are governed by the asserted record book
   * (`prSeed.ts`), because `workout_sets` has no per-set history before
   * 2026-07-16 — 75 of 94 sessions carry zero sets. Detection is SUPPRESSED
   * there rather than unioned with the book, so a movement the book does not
   * name gets no record however the arithmetic reads.
   *
   * That is right, and it means the medal on a July session opens nothing. A
   * sheet is better absent than confidently wrong about a month the data cannot
   * speak for.
   */
  it('defers to the record book for the seeded era rather than computing one', () => {
    n = 0
    const out = sessionPrRecords(
      detail([exercise([set({ weightKg: 65, reps: 8 })])], '2026-07-15'),
      [hist('2026-07-08', 60, 8)],
    )
    expect(out.bySet.size).toBe(0)
  })

  it('files each record against the SET that earned it, not the exercise', () => {
    n = 0
    const out = sessionPrRecords(
      detail([exercise([
        set({ weightKg: 60, reps: 8 }),
        set({ weightKg: 65, reps: 8 }),
      ])]),
      [hist('2026-08-07', 60, 8)],
    )
    // Set 1 matched the bar rather than beating it; set 2 is the record.
    expect(out.bySet.has(prSetKey('ex1', 1))).toBe(false)
    expect(out.bySet.get(prSetKey('ex1', 2))?.weight?.value).toBe(65)
  })

  it('returns an empty map rather than throwing on a session with no history', () => {
    n = 0
    // A debut movement genuinely has no baseline. `buildBaselines` handles it;
    // what must not happen is an exception on the page.
    const out = sessionPrRecords(detail([exercise([set({ weightKg: 60, reps: 8 })])]), [])
    expect(out.bySet).toBeInstanceOf(Map)
  })

  it('handles a session with no exercises at all', () => {
    expect(sessionPrRecords(detail([]), []).bySet.size).toBe(0)
  })

  /**
   * A record whose previous value cannot be established renders NOTHING —
   * `PrRecordSheet` returns null on an empty `records`. That is the correct
   * degraded state for an asserted (record-book) session, where the axis is
   * declared rather than computed, and it must not become a sheet reading
   * "beat nothing by nothing".
   */
  it('omits an axis it cannot put a previous value on', () => {
    n = 0
    const out = sessionPrRecords(detail([exercise([set({ weightKg: 60, reps: 8 })])]), [])
    const rec = out.bySet.get(prSetKey('ex1', 1))
    // Whatever axes a debut claims, none of them may carry a fabricated baseline.
    for (const v of Object.values(rec ?? {})) {
      expect(v.previous).not.toBe(v.value)
      expect(Number.isFinite(v.previous)).toBe(true)
    }
  })
})
