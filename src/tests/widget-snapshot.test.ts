import { describe, it, expect } from 'vitest'
import { caloriesRemaining, parseScope, WIDGET_SCOPES, type WidgetSnapshot } from '@/lib/widget/snapshot'
import { weekStartOf, weekStartDayFromEndDay } from '@/lib/utils/week'

const base: WidgetSnapshot = {
  date: '2026-07-24',
  generatedAt: '2026-07-24T10:00:00.000Z',
  scope: 'full',
  battery: 72,
  score: 84,
  sleep: {
    minutes: 555, deepMin: 94, remMin: 122, coreMin: 301, awakeMin: 38, score: 81,
    startTime: '2026-07-23T21:48:00.000Z', endTime: '2026-07-24T07:03:00.000Z',
  },
  weight: {
    kg: 64.9, deltaKg: -0.3, measuredOn: '2026-07-22', targetKg: 62, prevWeekMeanKg: 65.4,
    trend: [{ d: '2026-07-20', v: 65.4 }, { d: '2026-07-22', v: 64.9 }],
  },
  macros: {
    kcal: 1240, kcalGoal: 1955, proteinG: 128, proteinGoalG: 170,
    carbsG: 110, carbsGoalG: 195, fatG: 42, fatGoalG: 55,
  },
  water: { ml: 1800, goalMl: 3000 },
  steps: {
    count: 8412, goal: 10000, distanceM: 6100, activeKcal: 412,
    trend: [{ d: '2026-07-23', v: 9120 }, { d: '2026-07-24', v: 8412 }],
  },
  workout: { label: 'Legs & Core B', dayKey: 'legs_b', logged: false, isRestDay: false },
  week: { sessions: 4, volumeKg: 38400, prs: 2, sets: 96, sessionTarget: 5 },
  weekPrev: { sessions: 5, volumeKg: 41200, prs: 1, sets: 104 },
  records: [{ exercise: 'Hack Squat', axis: 'weight', value: 105, reps: 8, achievedOn: '2026-07-22' }],
  e1rm: [{ exercise: 'Hack Squat', kg: 131.3, deltaKg: 4.2 }],
  volumeByFamily: [{ family: 'Legs', kg: 12400, sets: 18.5 }],
}

/**
 * The snapshot is the ONLY thing the Widget and Watch see. Nullability is the
 * contract: a widget rendering "—" is correct, one rendering an invented number
 * is not, so the helpers must never substitute a zero for missing data.
 */
describe('widget snapshot', () => {
  it('computes calories remaining', () => {
    expect(caloriesRemaining(base)).toBe(715)
  })

  it('returns null rather than a fake number when intake is unlogged', () => {
    expect(caloriesRemaining({ ...base, macros: { ...base.macros, kcal: null } })).toBeNull()
  })

  it('returns null when no calorie goal is set', () => {
    expect(caloriesRemaining({ ...base, macros: { ...base.macros, kcalGoal: null } })).toBeNull()
  })

  it('goes negative when the goal is exceeded (never clamps to 0)', () => {
    expect(caloriesRemaining({ ...base, macros: { ...base.macros, kcal: 2100 } })).toBe(-145)
  })

  it('survives a JSON round-trip — the Swift Codable model decodes this shape', () => {
    expect(JSON.parse(JSON.stringify(base))).toEqual(base)
  })
})

/**
 * ── WHY THE SCOPE MAY ONLY EVER TRIM EXTRAS ──────────────────────────────────
 * `HelixSnapshot.swift` is a hand-written Codable mirror with non-optional
 * `sleep`, `weight`, `macros`, `water`, `steps`, `workout` and `week`. If a
 * scope omitted one of those the decode would throw, and a widget that fails to
 * decode shows the "can't reach HELIX" face — a network error for what is
 * actually a shape error, on a surface with no console to say so.
 *
 * So the scope trims the OPTIONAL extras only, and every optional is declared
 * optional on both sides.
 */
describe('widget scope', () => {
  it('defaults to full for anything it does not recognise', () => {
    expect(parseScope(null)).toBe('full')
    expect(parseScope(undefined)).toBe('full')
    expect(parseScope('')).toBe('full')
    expect(parseScope('LIFESTYLE')).toBe('full')     // case-sensitive on purpose
    expect(parseScope('../../etc/passwd')).toBe('full')
  })

  it('passes the three real scopes through', () => {
    for (const s of WIDGET_SCOPES) expect(parseScope(s)).toBe(s)
  })

  /**
   * A trimmed payload must still decode. This asserts the base contract stays
   * whole when every optional is stripped — exactly what a Performance-scoped
   * response looks like to the lifestyle half of the model.
   */
  it('stays a valid snapshot with every optional removed', () => {
    const trimmed: WidgetSnapshot = { ...base, scope: 'performance' }
    delete trimmed.weight.trend
    delete trimmed.steps.trend
    delete trimmed.records
    delete trimmed.e1rm
    delete trimmed.volumeByFamily
    delete trimmed.weekPrev

    const round = JSON.parse(JSON.stringify(trimmed)) as WidgetSnapshot
    expect(round.week.sessionTarget).toBe(5)
    expect(round.sleep.minutes).toBe(555)
    expect(round.workout.label).toBe('Legs & Core B')
    expect(caloriesRemaining(round)).toBe(715)
  })
})

/**
 * The widget's "this week" and the app's "this week" have to be the same seven
 * days. `weekStartOf` defaults to `deviceWeekStartDay()`, which has no
 * localStorage on the server and therefore always answered Sunday — so a
 * Monday-start preference put the widget's session count and volume out by up
 * to a whole session, silently, and only for users who had changed the setting.
 */
describe('the widget week honours the stored week-start preference', () => {
  it('maps week_end_day the same way the device mirror does', () => {
    expect(weekStartDayFromEndDay(0)).toBe(1)   // week ends Sunday ⇒ starts Monday
    expect(weekStartDayFromEndDay(6)).toBe(0)   // week ends Saturday ⇒ starts Sunday
  })

  it('falls back to Sunday when the column is absent, not to a crash', () => {
    expect(weekStartDayFromEndDay(null)).toBe(0)
    expect(weekStartDayFromEndDay(undefined)).toBe(0)
  })

  it('actually moves the window — Wed 2026-08-12 anchors differently', () => {
    expect(weekStartOf('2026-08-12', weekStartDayFromEndDay(6))).toBe('2026-08-09') // Sunday
    expect(weekStartOf('2026-08-12', weekStartDayFromEndDay(0))).toBe('2026-08-10') // Monday
  })
})
