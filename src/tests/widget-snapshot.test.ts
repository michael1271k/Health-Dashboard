import { describe, it, expect } from 'vitest'
import { caloriesRemaining, type WidgetSnapshot } from '@/lib/widget/snapshot'

const base: WidgetSnapshot = {
  date: '2026-07-24',
  generatedAt: '2026-07-24T10:00:00.000Z',
  battery: 72,
  score: 84,
  sleep: { minutes: 555, deepMin: 94, remMin: 122 },
  weight: { kg: 64.9, deltaKg: -0.3, measuredOn: '2026-07-22' },
  macros: { kcal: 1240, kcalGoal: 1955, proteinG: 128, proteinGoalG: 170, carbsG: 110, fatG: 42 },
  water: { ml: 1800, goalMl: 3000 },
  steps: { count: 8412, goal: 10000, distanceM: 6100, activeKcal: 412 },
  workout: { label: 'Legs & Core B', logged: false, isRestDay: false },
  week: { sessions: 4, volumeKg: 38400, prs: 2, sets: 96 },
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
