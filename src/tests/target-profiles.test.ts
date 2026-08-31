import { describe, it, expect } from 'vitest'
import {
  BUILTIN_PROFILES, matchesProfile, profileByKey, profileToDailyTarget,
} from '@/lib/nutrition/profiles'
import {
  applyDailyTarget, hasDailyTarget, tracksCarbs, tracksFat, type DailyTarget,
} from '@/lib/nutrition/dailyTargets'
import { computeNutritionScore } from '@/lib/scoring/score'
import type { LeverGoals } from '@/lib/nutrition/levers'

/** The rung underneath every one of these days. Every macro tracked. */
const RUNG: LeverGoals = { calorie: 1999, protein: 170, carbs: 206, fat: 55, steps: 10000 }

const home = BUILTIN_PROFILES.find((p) => p.key === 'home')!
const restaurant = BUILTIN_PROFILES.find((p) => p.key === 'restaurant')!

describe('the shipped profiles', () => {
  it('ships exactly the two shapes a week actually takes', () => {
    expect(BUILTIN_PROFILES.map((p) => p.key)).toEqual(['home', 'restaurant'])
  })

  it('tracks calories and protein in every shape — they are what a day is judged on', () => {
    for (const p of BUILTIN_PROFILES) {
      expect(p.kcal).toBeGreaterThan(0)
      expect(p.proteinG).toBeGreaterThan(0)
    }
  })

  it('states a home day’s full split, and a restaurant day’s protein only', () => {
    expect(home).toMatchObject({ kcal: 2150, proteinG: 170, carbsG: 244, fatG: 55 })
    // NULL, not zero. A 0 g fat target would grade the day 0/0 and call it
    // perfect — see the third-state note in `dailyTargets.ts`.
    expect(restaurant).toMatchObject({ kcal: 2400, proteinG: 170, carbsG: null, fatG: null })
  })

  it('resolves a key that names nothing to null, never to the first profile', () => {
    // A day stamped with a since-deleted profile kept its own snapshotted
    // numbers; inventing a different profile's label for it would be a lie
    // about what it was eaten against.
    expect(profileByKey(BUILTIN_PROFILES, 'home')).toBe(home)
    expect(profileByKey(BUILTIN_PROFILES, 'brunch')).toBeNull()
    expect(profileByKey(BUILTIN_PROFILES, null)).toBeNull()
  })
})

describe('applying a profile to a day', () => {
  it('snapshots the figures and stamps the key beside them', () => {
    const t = profileToDailyTarget(restaurant, '2026-09-04')
    expect(t).toMatchObject({
      date: '2026-09-04', kcal: 2400, protein_g: 170,
      profile_key: 'restaurant', track_carbs: false, track_fat: false,
    })
  })

  it('marks a macro tracked exactly when the profile states a figure for it', () => {
    const h = profileToDailyTarget(home, '2026-09-01')
    expect(h.track_carbs).toBe(true)
    expect(h.track_fat).toBe(true)
  })

  it('does not claim the day’s step goal unless the profile names one', () => {
    // A profile is a statement about food. A day that also had a step override
    // should not lose it because dinner moved.
    expect(profileToDailyTarget(restaurant, '2026-09-04').steps_goal).toBeNull()
  })
})

describe('an untracked macro', () => {
  const day = profileToDailyTarget(restaurant, '2026-09-04')

  it('counts as an override even though it sets no number of its own', () => {
    const flagOnly: DailyTarget = { date: '2026-09-04', track_fat: false }
    expect(hasDailyTarget(flagOnly)).toBe(true)
  })

  it('resolves to null — NOT to zero, and not to the rung’s figure', () => {
    const resolved = applyDailyTarget(RUNG, day)
    expect(resolved.calorie).toBe(2400)
    expect(resolved.protein).toBe(170)
    expect(resolved.carbs).toBeNull()
    expect(resolved.fat).toBeNull()
  })

  it('leaves the rung’s figure alone on a shape that tracks it', () => {
    const resolved = applyDailyTarget(RUNG, profileToDailyTarget(home, '2026-09-01'))
    expect(resolved.carbs).toBe(244)
    expect(resolved.fat).toBe(55)
  })

  it('reads as TRACKED on every row written before the flags existed', () => {
    const legacy: DailyTarget = { date: '2026-08-01', kcal: 2400 }
    expect(tracksCarbs(legacy)).toBe(true)
    expect(tracksFat(legacy)).toBe(true)
    expect(applyDailyTarget(RUNG, legacy).carbs).toBe(206)
  })
})

describe('what the scorer does with it', () => {
  /** The macro inputs for a day, with whatever goals resolution produced. */
  const inputs = (goals: LeverGoals) => ({
    calories: 2380, proteinG: 168, carbsG: 290, fatG: 96,
    calorieGoal: goals.calorie,
    proteinGoalG: goals.protein ?? 0,
    carbsGoalG: goals.carbs ?? 0,
    fatGoalG: goals.fat ?? 0,
    contextMode: 'normal' as const,
    nutritionException: false,
  })

  it('grades a restaurant day on calories and protein and nothing else', () => {
    // 290 g of carbohydrate against the rung's 206 and 96 g of fat against 55
    // are enormous misses — and on a night out they are not misses at all,
    // because nobody was aiming at either number.
    const untracked = computeNutritionScore(inputs(applyDailyTarget(RUNG, profileToDailyTarget(restaurant, '2026-09-04'))))
    const graded = computeNutritionScore(inputs(RUNG))
    expect(untracked!).toBeGreaterThan(graded!)
  })

  it('needs no change in the scorer to do it — null goal, skipped macro', () => {
    // `computeNutritionScore` only grades a macro whose goal is `> 0`, which it did
    // long before profiles existed. "Sits out of the aggregate entirely" is
    // implemented by `applyDailyTarget` returning null, nowhere else.
    const resolved = applyDailyTarget(RUNG, profileToDailyTarget(restaurant, '2026-09-04'))
    expect(resolved.carbs).toBeNull()
    expect(resolved.fat).toBeNull()
  })
})

describe('the picker’s highlight', () => {
  it('matches a day that still carries the profile’s own numbers', () => {
    expect(matchesProfile(profileToDailyTarget(home, '2026-09-01'), home)).toBe(true)
    expect(matchesProfile(profileToDailyTarget(restaurant, '2026-09-04'), restaurant)).toBe(true)
  })

  it('stops matching the moment a figure is hand-edited', () => {
    // The stamp survives — it is still true about the DECISION — but the chip
    // must not claim 2,400 over a day that now says 2,650.
    const edited = { ...profileToDailyTarget(restaurant, '2026-09-04'), kcal: 2650 }
    expect(edited.profile_key).toBe('restaurant')
    expect(matchesProfile(edited, restaurant)).toBe(false)
  })

  it('does not confuse the two shapes, or match an empty day', () => {
    expect(matchesProfile(profileToDailyTarget(home, '2026-09-01'), restaurant)).toBe(false)
    expect(matchesProfile(null, home)).toBe(false)
  })

  it('distinguishes an untracked macro from one that merely has no number', () => {
    // Same figures, one tracked and one not. Without the flags in the
    // comparison these two rows are identical, and a hand-built restaurant day
    // would highlight as Home.
    const tracked: DailyTarget = { date: 'x', kcal: 2400, protein_g: 170, track_carbs: true, track_fat: true }
    expect(matchesProfile(tracked, restaurant)).toBe(false)
  })
})
