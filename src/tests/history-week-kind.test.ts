import { describe, it, expect } from 'vitest'
import { leverKindOn } from '@/lib/nutrition/levers'
import { historyFromRows } from '@/lib/hooks/useExerciseSetHistory'

/**
 * ── WEEK 8 MUST NOT LEARN FROM WEEK 7 ────────────────────────────────────────
 *
 * Week 7 (2026-08-30 → 09-05) is a maintenance week: full food, lighter steps,
 * and deliberately lighter loads. The deck's "Previous" column takes the most
 * recent session of the same routine and seeds today's numbers from it — so on
 * the first Upper A of Week 8 it would hand back Week 7's release loads and
 * call them the thing to beat. The target is below what was lifted a fortnight
 * earlier, and the week that follows a deload starts by going backwards.
 *
 * The mirror case is worse in a quieter way: grading a release week against
 * full-effort numbers marks a week that went exactly to plan as a decline.
 *
 * Nothing on `workout_sessions` records which kind of week a session belongs to
 * — see `save.ts`, there is no phase, lever or week column — so it is derived
 * from the session's own date by the same `leverForDate` resolution the scorer,
 * the widget and the export already run.
 */

const TODAY = '2026-09-10'

/** `workout_sets` joined to its session, as the deck query returns it. */
const row = (name: string, date: string, weightKg: number, setNumber = 1) => ({
  weight_kg: weightKg,
  reps: 8,
  rpe: null,
  set_number: setNumber,
  set_type: null,
  side: null,
  pair_id: null,
  exercises: { name },
  workout_sessions: { started_at: `${date}T09:00:00Z`, day_key: 'upper_a' },
})

const opts = (wantKind: 'deficit' | 'release') => ({
  scopeKey: 'upper_a',
  era: undefined,
  lever: { storedLeverId: 'custom', todayISO: TODAY, releaseEndsOn: null, wantKind },
})

describe('leverKindOn', () => {
  it('calls an ordinary cut week a deficit', () => {
    expect(leverKindOn('2026-08-29', 'custom', TODAY)).toBe('deficit')
  })

  it('calls the maintenance week a release', () => {
    expect(leverKindOn('2026-08-31', 'custom', TODAY)).toBe('release')
  })

  it('goes back to deficit when the release closes', () => {
    expect(leverKindOn('2026-09-07', 'custom', TODAY)).toBe('deficit')
  })

  /** Before the cut opened there is no rung at all, and no release either. */
  it('treats a pre-programme date as a deficit rather than as nothing', () => {
    expect(leverKindOn('2026-07-01', 'custom', TODAY)).toBe('deficit')
  })

  /** `custom` is your own numbers at full effort — it is not a third kind. */
  it('does not make "my own numbers" a kind of its own', () => {
    expect(leverKindOn('2026-08-25', 'custom', TODAY)).toBe('deficit')
  })
})

describe('historyFromRows · the week-kind filter', () => {
  const NAME = 'Incline DB Press'
  /** Week 6 (normal), Week 7 (maintenance) — the two candidates. */
  const rows = [
    row(NAME, '2026-09-02', 24),   // inside the release week, lighter
    row(NAME, '2026-08-26', 32),   // the last full-effort session
  ]

  it('skips the maintenance week when a normal week is asking', () => {
    const out = historyFromRows(rows, opts('deficit'))
    expect(out.get(NAME)?.date).toBe('2026-08-26')
    expect(out.get(NAME)?.sets[0].weightKg).toBe(32)
    expect(out.get(NAME)?.crossKind).toBeUndefined()
  })

  it('skips the normal weeks when a maintenance week is asking', () => {
    const out = historyFromRows(rows, opts('release'))
    expect(out.get(NAME)?.date).toBe('2026-09-02')
    expect(out.get(NAME)?.sets[0].weightKg).toBe(24)
  })

  it('is off entirely when no lever context is supplied', () => {
    // Every caller that does not know the target date must get the old answer.
    const out = historyFromRows(rows, { scopeKey: 'upper_a' })
    expect(out.get(NAME)?.date).toBe('2026-09-02')
  })

  /**
   * The first release week has no prior release week to look at. A blank
   * Previous column there is a worse answer than a labelled cross-kind one, so
   * the fallback stands in and says where it came from — the deck dims it and
   * the tooltip reads "from a different kind of week".
   */
  it('falls back across the kind boundary rather than showing nothing', () => {
    const onlyNormal = [row(NAME, '2026-08-26', 32)]
    const out = historyFromRows(onlyNormal, opts('release'))
    expect(out.get(NAME)?.date).toBe('2026-08-26')
    expect(out.get(NAME)?.crossKind).toBe(true)
  })

  it('does not mark a same-kind answer as cross-kind', () => {
    const out = historyFromRows([row(NAME, '2026-08-26', 32)], opts('deficit'))
    expect(out.get(NAME)?.crossKind).toBeUndefined()
  })

  /** The kind filter sits alongside the routine scope, it does not replace it. */
  it('still honours the routine scope', () => {
    const otherRoutine = {
      ...row(NAME, '2026-08-28', 40),
      workout_sessions: { started_at: '2026-08-28T09:00:00Z', day_key: 'lower_a' },
    }
    const out = historyFromRows([otherRoutine, ...rows], opts('deficit'))
    expect(out.get(NAME)?.date).toBe('2026-08-26')
  })

  /** A past session's own view asks about ITS week, not about today's. */
  it('keeps every set of the winning session, ordered by set number', () => {
    const multi = [
      row(NAME, '2026-08-26', 32, 3),
      row(NAME, '2026-08-26', 32, 1),
      row(NAME, '2026-08-26', 32, 2),
      row(NAME, '2026-09-02', 24, 1),
    ]
    const out = historyFromRows(multi, opts('deficit'))
    expect(out.get(NAME)?.sets).toHaveLength(3)
  })
})
