import { describe, it, expect } from 'vitest'
import { caloriesRemaining, type WidgetSnapshot } from '@/lib/widget/snapshot'
import { weekStartOf, weekStartDayFromEndDay } from '@/lib/utils/week'

const base: WidgetSnapshot = {
  date: '2026-07-24',
  generatedAt: '2026-07-24T10:00:00.000Z',
  battery: 72,
  score: 84,
  sleep: { minutes: 555, deepMin: 94, remMin: 122 },
  weight: { kg: 64.9, deltaKg: -0.3, measuredOn: '2026-07-22' },
  macros: {
    kcal: 1240, kcalGoal: 1955, proteinG: 128, proteinGoalG: 170,
    carbsG: 110, carbsGoalG: 195, fatG: 42, fatGoalG: 55,
  },
  water: { ml: 1800, goalMl: 3000 },
  steps: { count: 8412, goal: 10000, distanceM: 6100, activeKcal: 412 },
  workout: { label: 'Legs & Core B', dayKey: 'legs_b', logged: false, isRestDay: false },
  week: { sessions: 4, volumeKg: 38400, prs: 2, sets: 96, sessionTarget: 5 },
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
