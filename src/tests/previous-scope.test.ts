import { describe, it, expect } from 'vitest'
import { historyFromRows, type HistoryRow } from '@/lib/hooks/useExerciseSetHistory'

/**
 * ── "PREVIOUS" IS A FACT ABOUT THIS ROUTINE, NOT ABOUT THIS MOVEMENT ─────────
 *
 * The Previous column used to run unscoped, on the argument that "what did I
 * lift last time I pressed" is a question about the movement. It is not the
 * question the column asks: it sits beside SET 3 of this session, so it has to
 * answer "what was set 3 last time I did THIS session".
 *
 * 2026-08-27 is the case that proves it. Chest Press (Machine) is programmed on
 * both `cb_a` and `cb_b`; `cb_b` runs three sets, `cb_a` runs two. The unscoped
 * lookup landed on 2026-08-23 — a `cb_a` day — so set 3 had nothing to show and
 * sets 1 and 2 showed a different routine's numbers as "last time".
 *
 * The empty cell was the visible half. The filled cells were the dangerous half:
 * a blank is legible as missing, a wrong number is not legible as wrong.
 */

const row = (over: Partial<HistoryRow> & { name: string; date: string; dayKey: string | null; n: number }): HistoryRow => ({
  weight_kg: over.weight_kg ?? 40,
  reps: over.reps ?? 10,
  rpe: over.rpe ?? null,
  set_number: over.n,
  set_type: over.set_type ?? 'normal',
  side: over.side ?? null,
  pair_id: over.pair_id ?? null,
  exercises: { name: over.name },
  workout_sessions: { started_at: `${over.date}T09:00:00+00:00`, day_key: over.dayKey },
})

/** Newest-first, exactly as `created_at desc` delivers them. */
const CHEST_PRESS: HistoryRow[] = [
  // 2026-08-23 · cb_a — TWO sets. The nearest session, and the wrong one.
  row({ name: 'Chest Press (Machine)', date: '2026-08-23', dayKey: 'cb_a', n: 1, reps: 11 }),
  row({ name: 'Chest Press (Machine)', date: '2026-08-23', dayKey: 'cb_a', n: 2, reps: 10 }),
  // 2026-08-20 · cb_b — THREE sets. The right one.
  row({ name: 'Chest Press (Machine)', date: '2026-08-20', dayKey: 'cb_b', n: 1, reps: 11 }),
  row({ name: 'Chest Press (Machine)', date: '2026-08-20', dayKey: 'cb_b', n: 2, reps: 10 }),
  row({ name: 'Chest Press (Machine)', date: '2026-08-20', dayKey: 'cb_b', n: 3, reps: 10 }),
]

describe('previous-session memory is scoped to the routine', () => {
  it('answers an Upper B deck with the last Upper B, not the nearer Upper A', () => {
    const out = historyFromRows(CHEST_PRESS, { scopeKey: 'cb_b' })
    const hit = out.get('Chest Press (Machine)')!
    expect(hit.date).toBe('2026-08-20')
    expect(hit.sets).toHaveLength(3)
  })

  it('fills set 3 — the cell that was blank on 2026-08-27', () => {
    const out = historyFromRows(CHEST_PRESS, { scopeKey: 'cb_b' })
    const third = out.get('Chest Press (Machine)')!.sets[2]
    expect(third).toEqual({ weightKg: 40, reps: 10 })
  })

  it('is the bug, unscoped: the nearest session wins and it is two sets long', () => {
    // Kept as a test rather than deleted, because this is what the column did
    // and the failure was silent in both directions.
    const out = historyFromRows(CHEST_PRESS, {})
    const hit = out.get('Chest Press (Machine)')!
    expect(hit.date).toBe('2026-08-23')
    expect(hit.sets).toHaveLength(2)
  })

  it('shows nothing rather than another routine on a movement\'s first outing', () => {
    // A movement that has only ever been done on `cb_a`, opened on `cb_b`. An
    // empty column is the correct answer: there IS no previous Upper B for it,
    // and borrowing Upper A's numbers is the thing being fixed.
    const out = historyFromRows(CHEST_PRESS, { scopeKey: 'legs_a' })
    expect(out.get('Chest Press (Machine)')).toBeUndefined()
  })

  it('never reaches past a session it is being read for', () => {
    // The exclusive `before` bound, still intact under scoping: opening the
    // 2026-08-20 session must not compare it against 2026-08-27.
    const withLater: HistoryRow[] = [
      row({ name: 'Chest Press (Machine)', date: '2026-08-27', dayKey: 'cb_b', n: 1, reps: 12 }),
      ...CHEST_PRESS,
    ]
    const out = historyFromRows(withLater, { scopeKey: 'cb_b', before: '2026-08-27' })
    expect(out.get('Chest Press (Machine)')!.date).toBe('2026-08-20')
  })

  it('orders sets by set_number, not by the arbitrary batch-insert order', () => {
    const shuffled = [CHEST_PRESS[4], CHEST_PRESS[2], CHEST_PRESS[3]]
    const out = historyFromRows(shuffled, { scopeKey: 'cb_b' })
    expect(out.get('Chest Press (Machine)')!.sets.map((s) => s.reps)).toEqual([11, 10, 10])
  })

  it('carries the tag and the pair through, so seeding rebuilds the session', () => {
    const rows: HistoryRow[] = [
      row({ name: 'Single Arm Triceps Pushdown (Cable)', date: '2026-08-20', dayKey: 'arms', n: 1, weight_kg: 7.5, reps: 13, side: 'L', pair_id: 'p1' }),
      row({ name: 'Single Arm Triceps Pushdown (Cable)', date: '2026-08-20', dayKey: 'arms', n: 2, weight_kg: 7.5, reps: 13, side: 'R', pair_id: 'p1' }),
      row({ name: 'Single Arm Triceps Pushdown (Cable)', date: '2026-08-20', dayKey: 'arms', n: 3, weight_kg: 6.25, reps: 10, set_type: 'failure' }),
    ]
    const sets = historyFromRows(rows, { scopeKey: 'arms' }).get('Single Arm Triceps Pushdown (Cable)')!.sets
    expect(sets[0]).toMatchObject({ side: 'L', pairId: 'p1' })
    expect(sets[1]).toMatchObject({ side: 'R', pairId: 'p1' })
    expect(sets[2]).toMatchObject({ setType: 'failure' })
    expect(sets[2].pairId).toBeUndefined()
  })

  it('ignores a half-formed pair — a side with no id is an ordinary set', () => {
    const rows = [row({ name: 'X', date: '2026-08-20', dayKey: 'arms', n: 1, side: 'L' })]
    const set = historyFromRows(rows, {}).get('X')!.sets[0]
    expect(set.side).toBeUndefined()
    expect(set.pairId).toBeUndefined()
  })
})
