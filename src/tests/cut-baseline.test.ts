import { describe, it, expect } from 'vitest'
import { NUTRITION_PRESETS, phaseGoalsFor } from '@/lib/types/workout'
import { DEFAULT_PROGRAM_ID } from '@/lib/programs'

/**
 * The cut's calorie target is ARITHMETIC, not preference.
 *
 * 170 P · 195 C · 55 F is 680 + 780 + 495 = 1955 kcal by Atwater. The preset
 * said 1950 while `scoring/computeForDate.ts` — the fallback a user with no
 * `user_goals` row is graded against — said 1955, so the same day could be
 * scored against two different targets depending on which one answered first.
 * Five kilocalories is not the point; two sources of truth is.
 *
 * The macros are the authority here and the calorie figure is derived from them,
 * so this test is written in that direction: change a macro and the calorie
 * number must follow, not the other way round.
 *
 * BULK AND MAINTENANCE ARE DELIBERATELY NOT ASSERTED. Their stated figures are
 * band midpoints that do not match their macro split (bulk 2600 vs 2590 by
 * Atwater; maintenance 2375 vs 2395), and those are programme decisions — the
 * maintenance comment says "2,350–2,400 band" outright. Only the cut claims to
 * be its own macros, so only the cut is held to it.
 */
// `null` is the preset's "no macro target", and a cut that stopped naming its
// protein would be a different bug — so it is an assertion failure here, not a
// value to coalesce past.
const atwater = (p: number | null, c: number | null, f: number | null) => {
  expect(p).not.toBeNull(); expect(c).not.toBeNull(); expect(f).not.toBeNull()
  return p! * 4 + c! * 4 + f! * 9
}

describe('the cut baseline', () => {
  it('is the sum of its own macros', () => {
    const cut = NUTRITION_PRESETS.cut
    expect(atwater(cut.proteinGoalG, cut.carbsGoalG, cut.fatGoalG)).toBe(cut.calorieGoal)
    expect(cut.calorieGoal).toBe(1955)
  })

  it('holds for the PPL override too', () => {
    const ppl = phaseGoalsFor('ppl', 'cut')
    expect(atwater(ppl.proteinGoalG, ppl.carbsGoalG, ppl.fatGoalG)).toBe(ppl.calorieGoal)
  })

  /**
   * The default plan's cut is what both the server fallback
   * (`computeForDate.ts`) and the Settings form's pre-load DEFAULTS now read.
   * Neither may hold a literal of its own again.
   */
  it('is what the default plan resolves to', () => {
    expect(phaseGoalsFor(DEFAULT_PROGRAM_ID, 'cut').calorieGoal).toBe(1955)
  })

  it('still classifies as a cut under the day-phase bands', () => {
    // nutrition/phase.ts: <= 2050 is a cut. A baseline that drifted past that
    // would silently relabel every day.
    expect(NUTRITION_PRESETS.cut.calorieGoal).toBeLessThanOrEqual(2050)
  })
})
