import { describe, it, expect } from 'vitest'
import {
  PROGRAMS,
  DEFAULT_PROGRAM_ID,
  scheduleDayIn,
  isTrainingDayIn,
  sessionTargetIn,
  type ScheduleContext,
} from '@/lib/programs'

/**
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `scheduleDayFor`, `isTrainingDay` and `activeProgram()` all resolve the active
 * plan through `getActiveProgramId()` and the per-date swaps through
 * `getScheduleOverride()`. Both read **localStorage**, which does not exist on a
 * server. So every server caller — `/api/widget/snapshot` and
 * `/api/compute-score` alike — silently got:
 *
 *   · the DEFAULT plan, whatever plan the user is actually running,
 *   · the BULK phase, whatever phase they are actually in,
 *   · and an EMPTY override map, so every swap and every cleared day vanished.
 *
 * The widget therefore announced the wrong session on any non-default plan, and
 * the scorer graded rest days against a week the athlete was not training. The
 * fix is not "read localStorage harder" — it is to make the rule a pure function
 * of an explicitly-supplied context, so a server can hand it the DB rows and a
 * browser can hand it the caches, and both get the same answer.
 *
 * These tests pin the pure core. The localStorage-backed wrappers are thin
 * delegations to it and are covered by the existing schedule tests.
 */

const HELIX = PROGRAMS[DEFAULT_PROGRAM_ID]

function ctx(over: Partial<ScheduleContext> = {}): ScheduleContext {
  return { programId: DEFAULT_PROGRAM_ID, phase: 'cut', overrides: {}, layout: {}, ...over }
}

// A HELIX-era Sunday (weekday 0) and the Wednesday of the same week.
const SUNDAY = '2026-08-09'
const WEDNESDAY = '2026-08-12'

describe('the schedule context resolves without a browser', () => {
  it('answers the authored weekday when nothing is overridden', () => {
    const day = scheduleDayIn(ctx(), SUNDAY)
    expect(day).not.toBe('rest')
    const authored = HELIX.days.find((d) => d.weekday === 0)
    expect(authored).toBeDefined()
    expect((day as { dayKey?: string }).dayKey).toBe(authored!.key)
  })

  it('rests on a weekday the plan does not schedule', () => {
    // HELIX-5 trains Sun/Mon/Tue/Thu/Fri — Wednesday is Zone-2 rest.
    expect(scheduleDayIn(ctx(), WEDNESDAY)).toBe('rest')
    expect(isTrainingDayIn(ctx(), WEDNESDAY)).toBe(false)
  })

  /**
   * The swap is the whole reason the server answer was wrong. `schedule_overrides`
   * is a real table with real rows; the server just never read it.
   */
  it('lets a per-date override beat the weekday default', () => {
    const target = HELIX.days.find((d) => d.weekday !== 0)!
    const day = scheduleDayIn(ctx({ overrides: { [SUNDAY]: target.key } }), SUNDAY)
    expect((day as { dayKey?: string }).dayKey).toBe(target.key)
    expect((day as { label: string }).label).toBe(target.label)
  })

  it('lets an override place a session onto a rest day', () => {
    const target = HELIX.days[0]
    expect(isTrainingDayIn(ctx({ overrides: { [WEDNESDAY]: target.key } }), WEDNESDAY)).toBe(true)
  })

  it("treats the literal 'rest' override as a cleared training day", () => {
    expect(scheduleDayIn(ctx({ overrides: { [SUNDAY]: 'rest' } }), SUNDAY)).toBe('rest')
    expect(isTrainingDayIn(ctx({ overrides: { [SUNDAY]: 'rest' } }), SUNDAY)).toBe(false)
  })

  it('ignores an override naming a day the active plan does not contain', () => {
    // A stale row from a plan the user has since left must not fabricate a
    // session out of a key this program has never heard of.
    const day = scheduleDayIn(ctx({ overrides: { [SUNDAY]: 'not_a_real_day' } }), SUNDAY)
    expect((day as { dayKey?: string }).dayKey).toBe(HELIX.days.find((d) => d.weekday === 0)!.key)
  })

  /**
   * The permanent remap (`program_day_layout`) is the other half of the same
   * blindness: a day moved off Tuesday forever still answered on Tuesday
   * server-side, because the layout store is localStorage too.
   */
  it('honours a permanent layout remap', () => {
    const sundayDay = HELIX.days.find((d) => d.weekday === 0)!
    const moved = ctx({ layout: { [sundayDay.key]: 3 } })   // Sunday's session → Wednesday
    expect(scheduleDayIn(moved, SUNDAY)).toBe('rest')
    expect((scheduleDayIn(moved, WEDNESDAY) as { dayKey?: string }).dayKey).toBe(sundayDay.key)
  })

  /**
   * Pre-2026-07-15 is the PPL era; the active plan has no authority there.
   *
   * This used to assert Sunday → 'Upper' and Friday → rest, from a `PPL_WEEKDAY`
   * map that contradicted `PPL_LEGACY.days` in the same file. The logged sessions
   * settle it — dominant `split_day` per weekday before the cut opened:
   * Sun push ×11 · Mon pull ×8 · Tue legs ×9 · Thu push ×10 · Fri pull ×9.
   * The map matched none of them and called Friday, which carried 14 sessions,
   * a rest day.
   */
  it('resolves PPL-era dates from the legacy PLAN, not the active one', () => {
    expect(scheduleDayIn(ctx(), '2026-06-14')).toMatchObject({ label: 'Push', dayKey: 'ppl_push_sun' })  // Sunday
    expect(scheduleDayIn(ctx(), '2026-06-15')).toMatchObject({ label: 'Pull' })                          // Monday
    expect(scheduleDayIn(ctx(), '2026-06-16')).toMatchObject({ label: 'Legs' })                          // Tuesday
    expect(scheduleDayIn(ctx(), '2026-06-18')).toMatchObject({ label: 'Push' })                          // Thursday
  })

  it('Friday was a training day in the PPL era, not a rest day', () => {
    expect(scheduleDayIn(ctx(), '2026-06-19')).toMatchObject({ label: 'Pull' })
    expect(isTrainingDayIn(ctx(), '2026-06-19')).toBe(true)
  })

  it('rests Wednesday and Saturday, as the legacy plan is authored', () => {
    expect(scheduleDayIn(ctx(), '2026-06-17')).toBe('rest')   // Wednesday
    expect(scheduleDayIn(ctx(), '2026-06-20')).toBe('rest')   // Saturday
    expect(isTrainingDayIn(ctx(), '2026-06-20')).toBe(false)
  })

  it('gives PPL dates a dayKey, so the colour system can tint them', () => {
    // `DAY_COLOR` has carried ppl_push_sun … ppl_pull_fri all along; the weekday
    // table returned a bare label, so nothing could ever look them up.
    const day = scheduleDayIn(ctx(), '2026-06-19') as { dayKey?: string }
    expect(day.dayKey).toBe('ppl_pull_fri')
  })

  it('still lets an override win inside the PPL era', () => {
    expect(isTrainingDayIn(ctx({ overrides: { '2026-06-19': HELIX.days[0].key } }), '2026-06-19')).toBe(true)
  })

  it('falls back to the default plan when the id is unknown, never throws', () => {
    expect(() => scheduleDayIn(ctx({ programId: 'deleted_plan' }), SUNDAY)).not.toThrow()
    expect(scheduleDayIn(ctx({ programId: 'deleted_plan' }), SUNDAY)).not.toBe('rest')
  })
})

/**
 * `week.sessionTarget` is the denominator on the widget's "3/5 sessions". Read
 * off `activeProgram()` it was the DEFAULT plan's day count for everyone —
 * right for the default plan by luck, wrong for every other one, and wrong in
 * the direction that makes a finished week look unfinished.
 */
describe('sessionTargetIn counts the days of the plan actually being run', () => {
  it('matches the plan it is given', () => {
    for (const id of Object.keys(PROGRAMS)) {
      expect(sessionTargetIn({ ...ctx(), programId: id })).toBe(PROGRAMS[id].days.length)
    }
  })

  it('counts scheduled DAYS, not days that survive a cut trim', () => {
    // A cut drops bulk-only lifts, and can empty an exercise list — it never
    // deletes a training day. The target must not shrink because of the phase.
    const bulk = sessionTargetIn({ ...ctx(), phase: 'bulk' })
    const cut = sessionTargetIn({ ...ctx(), phase: 'cut' })
    expect(cut).toBe(bulk)
  })

  it('falls back to the default plan rather than reporting zero sessions', () => {
    expect(sessionTargetIn({ ...ctx(), programId: 'deleted_plan' })).toBe(HELIX.days.length)
  })
})
