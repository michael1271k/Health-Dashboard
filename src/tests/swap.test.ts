import { describe, it, expect } from 'vitest'
import {
  planRestDay, planDaySwap, dateForWeekday, weekDatesOf, describeRestPlan,
  SWAP_HORIZON_DAYS,
} from '@/lib/schedule/swap'
import { REST_OVERRIDE } from '@/lib/schedule/overrides'
import type { ScheduleDay } from '@/lib/programs'

// HELIX-5's real shape: trains Sun/Mon/Tue/Thu/Fri, rests Wed and Sat.
// Week of 2026-08-02 (Sun) … 2026-08-08 (Sat).
const PLAN: Record<number, ScheduleDay> = {
  0: { label: 'Upper A', sub: 'Chest + Back', dayKey: 'cb_a' },
  1: { label: 'Legs & Core A', sub: 'Quad Focus', dayKey: 'legs_a' },
  2: { label: 'Delts & Arms', dayKey: 'arms' },
  4: { label: 'Upper B', sub: 'Chest + Back', dayKey: 'cb_b' },
  5: { label: 'Legs & Core B', sub: 'Posterior Focus', dayKey: 'legs_b' },
}

/** A resolver over a mutable override map — the same layering scheduleDayFor does. */
function makeResolve(overrides: Record<string, string> = {}) {
  const byKey = new Map(Object.values(PLAN).map((d) => [d.dayKey as string, d]))
  const resolve = (dateISO: string): ScheduleDay | 'rest' => {
    const o = overrides[dateISO]
    if (o === REST_OVERRIDE) return 'rest'
    if (o) return byKey.get(o) ?? 'rest'
    return PLAN[new Date(`${dateISO}T12:00:00Z`).getUTCDay()] ?? 'rest'
  }
  const apply = (writes: Array<{ date: string; dayKey: string }>) => {
    for (const w of writes) overrides[w.date] = w.dayKey
  }
  return { resolve, apply, overrides }
}

describe('dateForWeekday', () => {
  it('is Sunday-anchored regardless of the date inside the week', () => {
    // Every day of the week of 2026-08-02 resolves Wednesday to the same date.
    for (const d of weekDatesOf('2026-08-05')) {
      expect(dateForWeekday(d, 3)).toBe('2026-08-05')
    }
  })

  it('enumerates Sun→Sat', () => {
    expect(weekDatesOf('2026-08-06')).toEqual([
      '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08',
    ])
  })
})

describe('planRestDay', () => {
  it('MOVES the workout to the plan\'s next rest day instead of deleting it', () => {
    const { resolve } = makeResolve()
    // Tuesday = Delts & Arms; the plan's next rest is Wednesday.
    const plan = planRestDay('2026-08-04', resolve)
    expect(plan.outcome).toBe('swapped')
    expect(plan.moved?.dayKey).toBe('arms')
    expect(plan.movedTo).toBe('2026-08-05')
    expect(plan.sameWeek).toBe(true)
    expect(plan.writes).toEqual([
      { date: '2026-08-04', dayKey: REST_OVERRIDE },
      { date: '2026-08-05', dayKey: 'arms' },
    ])
  })

  it('finds Saturday when Wednesday is already behind us', () => {
    const { resolve } = makeResolve()
    const plan = planRestDay('2026-08-07', resolve) // Friday, Legs & Core B
    expect(plan.movedTo).toBe('2026-08-08')         // Saturday
    expect(plan.sameWeek).toBe(true)
  })

  it('never searches backwards — a Friday rest does not land on Wednesday', () => {
    const { resolve } = makeResolve()
    const plan = planRestDay('2026-08-07', resolve)
    expect(plan.movedTo! > '2026-08-07').toBe(true)
  })

  it('does nothing on a day that is already rest', () => {
    const { resolve } = makeResolve()
    const plan = planRestDay('2026-08-05', resolve) // Wednesday
    expect(plan.outcome).toBe('already-rest')
    expect(plan.writes).toEqual([])
    expect(plan.moved).toBeNull()
  })

  it('chains: resting two days running pushes the first one further out', () => {
    const h = makeResolve()
    const first = planRestDay('2026-08-04', h.resolve) // Tue arms → Wed
    h.apply(first.writes)
    expect(h.resolve('2026-08-05')).toMatchObject({ dayKey: 'arms' })

    // Now rest Wednesday too. Arms is sitting there; the next free slot is Sat.
    const second = planRestDay('2026-08-05', h.resolve)
    expect(second.moved?.dayKey).toBe('arms')
    expect(second.movedTo).toBe('2026-08-08')
  })

  it('crosses into next week when this week has no rest left, and says so', () => {
    // Fill both of this week's rest days with real sessions.
    const { resolve } = makeResolve({ '2026-08-05': 'cb_a', '2026-08-08': 'cb_b' })
    const plan = planRestDay('2026-08-07', resolve)
    expect(plan.outcome).toBe('swapped')
    expect(plan.movedTo).toBe('2026-08-12') // the following Wednesday
    expect(plan.sameWeek).toBe(false)
  })

  it('reports no-slot rather than moving beyond the horizon', () => {
    const overrides: Record<string, string> = {}
    // Every day inside the horizon is a training day.
    for (let i = 0; i <= SWAP_HORIZON_DAYS + 1; i += 1) {
      const d = new Date('2026-08-04T12:00:00Z')
      d.setUTCDate(d.getUTCDate() + i)
      overrides[d.toISOString().slice(0, 10)] = 'cb_a'
    }
    const { resolve } = makeResolve(overrides)
    const plan = planRestDay('2026-08-04', resolve)
    expect(plan.outcome).toBe('no-slot')
    expect(plan.movedTo).toBeNull()
    // The day still becomes rest — the request is honoured either way.
    expect(plan.writes).toEqual([{ date: '2026-08-04', dayKey: REST_OVERRIDE }])
  })

  it('handles a PPL-era day that carries a label but no program key', () => {
    const resolve = (d: string): ScheduleDay | 'rest' => (d === '2026-06-01' ? { label: 'Push' } : 'rest')
    const plan = planRestDay('2026-06-01', resolve)
    expect(plan.outcome).toBe('unscheduled')
    expect(plan.writes).toEqual([{ date: '2026-06-01', dayKey: REST_OVERRIDE }])
  })
})

describe('planDaySwap', () => {
  it('exchanges rather than deletes — the displaced day takes the vacated slot', () => {
    const { resolve } = makeResolve()
    // Pull Friday's Legs & Core B onto Tuesday, which holds Delts & Arms.
    const writes = planDaySwap('2026-08-04', 'legs_b', resolve, dateForWeekday('2026-08-04', 5))
    expect(writes).toEqual([
      { date: '2026-08-04', dayKey: 'legs_b' },
      { date: '2026-08-07', dayKey: 'arms' },
    ])
  })

  it('rests the source slot when the target date was itself a rest day', () => {
    const { resolve } = makeResolve()
    const writes = planDaySwap('2026-08-05', 'legs_b', resolve, dateForWeekday('2026-08-05', 5))
    expect(writes).toEqual([
      { date: '2026-08-05', dayKey: 'legs_b' },
      { date: '2026-08-07', dayKey: REST_OVERRIDE },
    ])
  })

  it('follows a day that has ALREADY been moved, instead of its weekday default', () => {
    // legs_b was moved off Friday onto Saturday by an earlier swap.
    const { resolve } = makeResolve({ '2026-08-07': REST_OVERRIDE, '2026-08-08': 'legs_b' })
    const writes = planDaySwap('2026-08-04', 'legs_b', resolve, dateForWeekday('2026-08-04', 5))
    // Saturday is vacated (not Friday, which is already rest) — no duplicate.
    expect(writes).toEqual([
      { date: '2026-08-04', dayKey: 'legs_b' },
      { date: '2026-08-08', dayKey: 'arms' },
    ])
  })

  it('writes one row when the day is already on that date', () => {
    const { resolve } = makeResolve()
    const writes = planDaySwap('2026-08-04', 'arms', resolve, dateForWeekday('2026-08-04', 2))
    expect(writes).toEqual([{ date: '2026-08-04', dayKey: 'arms' }])
  })
})

describe('describeRestPlan', () => {
  it('names the session and where it went', () => {
    const { resolve } = makeResolve()
    expect(describeRestPlan(planRestDay('2026-08-04', resolve)))
      .toBe('Delts & Arms moved to Wed 5 Aug.')
  })

  it('flags a move that leaves the week', () => {
    const { resolve } = makeResolve({ '2026-08-05': 'cb_a', '2026-08-08': 'cb_b' })
    expect(describeRestPlan(planRestDay('2026-08-07', resolve))).toContain('next week')
  })

  it('admits when the session was dropped', () => {
    const overrides: Record<string, string> = {}
    for (let i = 0; i <= SWAP_HORIZON_DAYS + 1; i += 1) {
      const d = new Date('2026-08-04T12:00:00Z')
      d.setUTCDate(d.getUTCDate() + i)
      overrides[d.toISOString().slice(0, 10)] = 'cb_a'
    }
    const { resolve } = makeResolve(overrides)
    expect(describeRestPlan(planRestDay('2026-08-04', resolve))).toContain('dropped')
  })
})
