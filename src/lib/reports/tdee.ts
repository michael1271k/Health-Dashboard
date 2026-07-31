/**
 * TDEE decomposition — BMR + TEF + NEAT + EAT.
 *
 * Computed in TypeScript, deliberately. The report's whole value is that its
 * arithmetic is reproducible: an LLM asked to "work out the deficit" will
 * produce a plausible number that nobody can check, and it will produce a
 * different one next week from the same data. The model's job is the verdict;
 * the numbers arrive pre-computed.
 *
 * All inputs are per-day and nullable — a missing day must not silently read as
 * a zero-calorie, zero-step day.
 */

/** Thermic effect of food: ~10% of intake on a mixed diet. */
export const TEF_RATE = 0.10

/**
 * kcal per step. 0.04 is the common mid-range estimate for a ~62 kg adult at
 * normal walking cadence; it is a coefficient, not a measurement, and the report
 * labels it as an estimate wherever it surfaces.
 */
export const KCAL_PER_STEP = 0.04

export interface TdeeDayInput {
  date: string
  /** InBody BMR for the day, when weighed. */
  bmrKcal: number | null
  intakeKcal: number | null
  steps: number | null
  /** Strength session calories (workout_sessions.calories_burned). */
  sessionKcal: number | null
  /** Cardio ACTIVE calories for the day. */
  cardioKcal: number | null
}

export interface TdeeDay {
  date: string
  bmr: number | null
  tef: number | null
  neat: number | null
  eat: number | null
  tdee: number | null
  intake: number | null
  /** intake − tdee. Negative = deficit. */
  balance: number | null
}

export interface TdeeWeek {
  days: TdeeDay[]
  /** Means over the days that HAVE the component, not over all 7. */
  meanBmr: number | null
  meanTef: number | null
  meanNeat: number | null
  meanEat: number | null
  meanTdee: number | null
  meanIntake: number | null
  meanBalance: number | null
  /** Σ balance across days with both intake and TDEE. */
  totalBalance: number | null
  /** Weekly deficit ÷ 7700 kcal/kg — the theoretical fat change. */
  predictedFatKg: number | null
}

/** kcal in a kilogram of adipose tissue — the standard planning constant. */
export const KCAL_PER_KG_FAT = 7700

const mean = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null

export function tdeeForDay(d: TdeeDayInput): TdeeDay {
  const bmr = d.bmrKcal != null && Number.isFinite(d.bmrKcal) ? d.bmrKcal : null
  const tef = d.intakeKcal != null ? Math.round(d.intakeKcal * TEF_RATE) : null
  const neat = d.steps != null ? Math.round(d.steps * KCAL_PER_STEP) : null
  // EAT is the sum of what was logged; a day with neither is null (unknown),
  // NOT zero — "didn't train" and "didn't record" are different facts.
  const eatParts = [d.sessionKcal, d.cardioKcal].filter((v): v is number => v != null)
  const eat = eatParts.length ? Math.round(eatParts.reduce((a, b) => a + b, 0)) : null

  // TDEE needs a BMR to mean anything; the rest contribute what they have.
  const tdee = bmr == null ? null : Math.round(bmr + (tef ?? 0) + (neat ?? 0) + (eat ?? 0))
  const intake = d.intakeKcal ?? null
  const balance = tdee != null && intake != null ? Math.round(intake - tdee) : null

  return { date: d.date, bmr, tef, neat, eat, tdee, intake, balance }
}

export function tdeeForWeek(inputs: readonly TdeeDayInput[]): TdeeWeek {
  const days = inputs.map(tdeeForDay)
  const pick = (f: (d: TdeeDay) => number | null) =>
    mean(days.map(f).filter((v): v is number => v != null))

  const balances = days.map((d) => d.balance).filter((v): v is number => v != null)
  const totalBalance = balances.length ? balances.reduce((a, b) => a + b, 0) : null

  return {
    days,
    meanBmr: pick((d) => d.bmr),
    meanTef: pick((d) => d.tef),
    meanNeat: pick((d) => d.neat),
    meanEat: pick((d) => d.eat),
    meanTdee: pick((d) => d.tdee),
    meanIntake: pick((d) => d.intake),
    meanBalance: pick((d) => d.balance),
    totalBalance,
    predictedFatKg: totalBalance == null ? null : Math.round((totalBalance / KCAL_PER_KG_FAT) * 100) / 100,
  }
}
