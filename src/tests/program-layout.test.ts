import { describe, it, expect } from 'vitest'
import {
  parseLayout, effectiveWeekday, dayKeyForWeekday, fullLayout, moveDay,
  isAuthoredLayout, canonicalLayout, type DayLayout,
} from '@/lib/schedule/layout'
import { planPermanentMove, blockForPlacement, describeBlock, dateForWeekday, type LoggedDay } from '@/lib/schedule/swap'
import { REST_OVERRIDE } from '@/lib/schedule/overrides'
import { APEX51 } from '@/lib/programs'
import type { ScheduleDay } from '@/lib/programs'

/**
 * `ProgramDay.weekday` is a hardcoded constant, so "move this day forever" had
 * nowhere to live and was a code edit. The layout is that missing tier. Its two
 * dangers are (1) a moved day answering at BOTH weekdays — its old slot and its
 * new one, i.e. a duplicated session — and (2) a permanent change silently
 * rewriting days of the current week that already happened.
 *
 * HELIX-5 as authored: cb_a Sun(0) · legs_a Mon(1) · arms Tue(2) · cb_b Thu(4)
 * · legs_b Fri(5). Wed(3) and Sat(6) rest.
 */

describe('parseLayout — a corrupt row must degrade, never throw', () => {
  it('keeps well-formed weekdays', () => {
    expect(parseLayout({ arms: 3, cb_a: 0 })).toEqual({ arms: 3, cb_a: 0 })
  })

  it('drops out-of-range, non-integer and non-numeric values', () => {
    expect(parseLayout({ a: 7, b: -1, c: 2.5, d: '3', e: null, arms: 3 })).toEqual({ arms: 3 })
  })

  it('returns {} for anything that is not an object', () => {
    // This runs during render behind scheduleDayFor — a bad payload has to fall
    // back to the authored plan, not take the page down.
    expect(parseLayout(null)).toEqual({})
    expect(parseLayout('nope')).toEqual({})
    expect(parseLayout([1, 2])).toEqual({})
  })

  it('refuses a duplicate weekday rather than letting two days claim one slot', () => {
    // The single-row design exists to make this unreachable; if it appears
    // anyway, the second day falls back to its authored slot.
    expect(parseLayout({ arms: 3, cb_b: 3 })).toEqual({ arms: 3 })
  })
})

describe('effectiveWeekday / dayKeyForWeekday', () => {
  const arms = APEX51.days.find((d) => d.key === 'arms')!

  it('answers the authored weekday when the layout is silent', () => {
    expect(effectiveWeekday(arms, {})).toBe(2)
  })

  it('answers the remapped weekday when it is not', () => {
    expect(effectiveWeekday(arms, { arms: 3 })).toBe(3)
  })

  it('a moved day no longer answers at its OLD weekday', () => {
    // The duplicated-session bug: matching on `d.weekday` would leave arms
    // scheduled on BOTH Tuesday and Wednesday.
    const layout: DayLayout = { arms: 3 }
    expect(dayKeyForWeekday(APEX51, layout, 3)).toBe('arms')
    expect(dayKeyForWeekday(APEX51, layout, 2)).toBeNull()
  })
})

describe('moveDay is an EXCHANGE', () => {
  it('trades slots when the target weekday is occupied', () => {
    // arms Tue(2) → Thu(4), where cb_b lives. cb_b must take Tuesday, not vanish.
    const next = moveDay(APEX51, {}, 'arms', 4)
    expect(next.arms).toBe(4)
    expect(next.cb_b).toBe(2)
  })

  it('just moves when the target weekday is a rest day', () => {
    const next = moveDay(APEX51, {}, 'arms', 3)
    expect(next.arms).toBe(3)
    // Nothing else shifted; Tuesday simply becomes rest.
    expect(dayKeyForWeekday(APEX51, next, 2)).toBeNull()
    expect(next.cb_b).toBe(4)
  })

  it('stays a bijection — five days, five distinct weekdays, always', () => {
    let layout: DayLayout = {}
    for (const [key, wd] of [['arms', 4], ['cb_a', 5], ['legs_b', 0], ['arms', 3]] as const) {
      layout = moveDay(APEX51, layout, key, wd)
      const slots = Object.values(layout)
      expect(new Set(slots).size).toBe(slots.length)
      expect(Object.keys(layout).sort()).toEqual(APEX51.days.map((d) => d.key).sort())
    }
  })

  it('is a no-op for a day of another plan, or for its current slot', () => {
    expect(moveDay(APEX51, {}, 'not_a_day', 3)).toEqual(fullLayout(APEX51, {}))
    expect(moveDay(APEX51, {}, 'arms', 2)).toEqual(fullLayout(APEX51, {}))
  })

  it('stores the layout WHOLE, so the row describes the week on its own', () => {
    const next = moveDay(APEX51, {}, 'arms', 3)
    expect(Object.keys(next).sort()).toEqual(['arms', 'cb_a', 'cb_b', 'legs_a', 'legs_b'])
  })
})

describe('isAuthoredLayout / canonicalLayout', () => {
  it('recognises a layout that says nothing new', () => {
    expect(isAuthoredLayout(APEX51, {})).toBe(true)
    expect(isAuthoredLayout(APEX51, fullLayout(APEX51, {}))).toBe(true)
    expect(isAuthoredLayout(APEX51, { arms: 3 })).toBe(false)
  })

  it('compares independently of key order — Postgres reorders jsonb keys', () => {
    // JSON.stringify would report a difference that does not exist; this is the
    // exact false negative that bit the routine-template backfill.
    const a: DayLayout = { cb_a: 0, legs_a: 1, arms: 2 }
    const b: DayLayout = { arms: 2, cb_a: 0, legs_a: 1 }
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
    expect(canonicalLayout(a)).toBe(canonicalLayout(b))
  })
})

// ── Logged sessions ──────────────────────────────────────────────────────────

describe('a logged session blocks the move that would misreport it', () => {
  const logged: LoggedDay[] = [{ date: '2026-08-11', dayKey: 'arms' }]

  it('refuses a target that already logged a DIFFERENT day', () => {
    const block = blockForPlacement('2026-08-11', 'legs_a', logged, null)
    expect(block).toEqual({ kind: 'target-logged', date: '2026-08-11', dayKey: 'arms' })
  })

  it('allows the no-op — placing the day that is already there', () => {
    expect(blockForPlacement('2026-08-11', 'arms', logged, null)).toBeNull()
  })

  it('refuses moving a day OFF a date whose session is committed', () => {
    // The session keeps its own day_key on the old date and a fresh slot opens
    // on the new one, so the week counts arms twice.
    const block = blockForPlacement('2026-08-13', 'arms', logged, '2026-08-11')
    expect(block).toEqual({ kind: 'source-logged', date: '2026-08-11', dayKey: 'arms' })
  })

  it('allows a move whose source and target are both untouched', () => {
    expect(blockForPlacement('2026-08-13', 'legs_a', logged, '2026-08-10')).toBeNull()
  })

  it('names what is in the way', () => {
    const block = blockForPlacement('2026-08-11', 'legs_a', logged, null)!
    expect(describeBlock(block, () => 'Delts & Arms')).toContain('Delts & Arms')
  })
})

// ── The permanent tier ───────────────────────────────────────────────────────

/** Resolve against a hypothetical layout, the way useProgramLayout does. */
function makeResolve() {
  return (dateISO: string, layout: DayLayout): ScheduleDay | 'rest' => {
    const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay()
    const day = APEX51.days.find((d) => effectiveWeekday(d, layout) === weekday)
    return day ? { label: day.label, sub: day.sub, dayKey: day.key } : 'rest'
  }
}

describe('planPermanentMove protects the part of the week that already happened', () => {
  // Week of Sun 2026-08-09 … Sat 2026-08-15. "Today" is Thursday 2026-08-13.
  const today = '2026-08-13'
  const base = { program: APEX51, layout: {} as DayLayout, todayISO: today, resolveWith: makeResolve() }

  it('needs NO writes when the change only affects days still ahead', () => {
    // cb_b Thu(4) → Sat(6): Sunday–Wednesday keep their meaning exactly.
    const plan = planPermanentMove({ ...base, dayKey: 'cb_b', weekday: 6, logged: [] })
    expect(plan.block).toBeNull()
    expect(plan.layout?.cb_b).toBe(6)
    expect(plan.writes).toEqual([])
  })

  it('pins a spent day whose meaning the change would rewrite', () => {
    // arms Tue(2) → Wed(3). Tuesday 2026-08-11 is in the past, so without a pin
    // it would start claiming "rest" for a day that was Delts & Arms.
    const plan = planPermanentMove({ ...base, dayKey: 'arms', weekday: 3, logged: [] })
    expect(plan.layout?.arms).toBe(3)
    expect(plan.writes).toContainEqual({ date: '2026-08-11', dayKey: 'arms' })
    // Wednesday 2026-08-12 was rest and is also past — it must stay rest.
    expect(plan.writes).toContainEqual({ date: '2026-08-12', dayKey: REST_OVERRIDE })
    expect(plan.pinned).toEqual(expect.arrayContaining(['2026-08-11', '2026-08-12']))
  })

  it('leaves untouched past days alone — pins only what would actually change', () => {
    const plan = planPermanentMove({ ...base, dayKey: 'arms', weekday: 3, logged: [] })
    // Sunday and Monday keep cb_a / legs_a either way, so nothing is written.
    expect(plan.writes.map((w) => w.date)).not.toContain('2026-08-09')
    expect(plan.writes.map((w) => w.date)).not.toContain('2026-08-10')
  })

  it('needs no special case for a LOGGED today — the block rule already covers it', () => {
    // An exchange changes the meaning of exactly two weekdays: the source's and
    // the target's. So today's meaning can only move if today is one of them —
    // and both are refused outright once today carries a session. This is why
    // the pin loop is a plain `d < todayISO` and not `|| logged.has(d)`.
    const logged: LoggedDay[] = [{ date: today, dayKey: 'cb_b' }]
    // today (Thu) as the TARGET:
    expect(planPermanentMove({ ...base, dayKey: 'legs_b', weekday: 4, logged }).block?.kind)
      .toBe('target-logged')
    // today (Thu) as the SOURCE — cb_b lives on Thursday:
    expect(planPermanentMove({ ...base, dayKey: 'cb_b', weekday: 6, logged }).block?.kind)
      .toBe('source-logged')
    // and a move that touches neither leaves today alone:
    const elsewhere = planPermanentMove({ ...base, dayKey: 'cb_a', weekday: 6, logged })
    expect(elsewhere.block).toBeNull()
    expect(elsewhere.writes.map((w) => w.date)).not.toContain(today)
  })

  it('refuses outright when the move would contradict a logged session', () => {
    // Tuesday logged arms; trying to make Tuesday legs_a permanently.
    const logged: LoggedDay[] = [{ date: '2026-08-11', dayKey: 'arms' }]
    const plan = planPermanentMove({ ...base, dayKey: 'legs_a', weekday: 2, logged })
    expect(plan.block?.kind).toBe('target-logged')
    expect(plan.layout).toBeNull()
    expect(plan.writes).toEqual([])
  })

  it('anchors the target weekday inside THIS week', () => {
    // dateForWeekday is Sunday-anchored regardless of the display preference,
    // because ProgramDay.weekday is defined 0=Sun by the plan itself.
    expect(dateForWeekday(today, 3)).toBe('2026-08-12')
    expect(dateForWeekday(today, 6)).toBe('2026-08-15')
  })
})
