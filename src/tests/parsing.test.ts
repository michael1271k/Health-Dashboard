import { computeNutritionScore } from '@/lib/scoring/score'
import { parseDurationMin } from '@/lib/utils/duration'
import { NUTRITION_PRESETS } from '@/lib/types/workout'

describe('Nutrition modes', () => {
  it('defines Cut / Bulk / Maintenance with correct calories', () => {
    expect(NUTRITION_PRESETS.cut.calorieGoal).toBe(1955)     // Helix Cut 5.1
    expect(NUTRITION_PRESETS.bulk.calorieGoal).toBe(2550)   // v5.1 start; titrate to 2,600–2,650
    expect(NUTRITION_PRESETS.maintenance.calorieGoal).toBe(2375)
  })

  it('AXIS macro anchors carry full macro + fiber targets', () => {
    expect(NUTRITION_PRESETS.cut.proteinGoalG).toBe(170)     // Helix Cut 5.1: 170P / 195C / 55F
    expect(NUTRITION_PRESETS.cut.carbsGoalG).toBe(195)
    expect(NUTRITION_PRESETS.cut.fatGoalG).toBe(55)
    expect(NUTRITION_PRESETS.cut.fiberGoalG).toBe(30)
    expect(NUTRITION_PRESETS.bulk.proteinGoalG).toBe(158)
    expect(NUTRITION_PRESETS.bulk.carbsGoalG).toBe(337)
    expect(NUTRITION_PRESETS.bulk.fiberGoalG).toBe(35)
  })
})

describe('computeNutritionScore — null-macro grading (bulk/maintenance)', () => {
  const base = { contextMode: 'normal' as const }

  it('grades calories only when macro goals are 0 (perfect calories → 100)', () => {
    const score = computeNutritionScore({
      ...base,
      calories: 2650, proteinG: 100, carbsG: 200, fatG: 90,
      calorieGoal: 2650, proteinGoalG: 0, carbsGoalG: 0, fatGoalG: 0,
    })
    expect(score).toBe(100)
  })

  it('still penalizes calorie deviation in calories-only mode', () => {
    const score = computeNutritionScore({
      ...base,
      calories: 3500, proteinG: 0, carbsG: 0, fatG: 0,
      calorieGoal: 2650, proteinGoalG: 0, carbsGoalG: 0, fatGoalG: 0,
    })
    expect(score).toBeLessThan(100)
  })

  it('includes protein when its goal is set (cut)', () => {
    const onTarget = computeNutritionScore({
      ...base,
      calories: 1955, proteinG: 170, carbsG: 195, fatG: 55,
      calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
    })
    const lowProtein = computeNutritionScore({
      ...base,
      calories: 1955, proteinG: 60, carbsG: 195, fatG: 55,
      calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
    })
    expect(onTarget).toBe(100)
    expect(lowProtein!).toBeLessThan(onTarget!)
  })
})

describe('parseDurationMin', () => {
  it('parses "1h 15m" → 75', () => { expect(parseDurationMin('1h 15m')).toBe(75) })
  it('parses "1:15" → 75', () => { expect(parseDurationMin('1:15')).toBe(75) })
  it('parses "75" → 75', () => { expect(parseDurationMin('75')).toBe(75) })
  it('parses "45m" → 45', () => { expect(parseDurationMin('45m')).toBe(45) })
  it('parses "2h" → 120', () => { expect(parseDurationMin('2h')).toBe(120) })
  it('returns null for empty/garbage', () => {
    expect(parseDurationMin(null)).toBeNull()
    expect(parseDurationMin('')).toBeNull()
    expect(parseDurationMin('abc')).toBeNull()
  })
})
