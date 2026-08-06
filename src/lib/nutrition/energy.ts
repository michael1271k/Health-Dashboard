/**
 * The canonical energy-expenditure arithmetic. ONE definition of TDEE, imported
 * by every surface that shows one, so the Nexus, the dashboard and the weekly
 * export can never disagree about what a day cost.
 *
 * TDEE = BMR + active energy + TEF.
 *
 * WHY TEF IS NOT OPTIONAL
 * Digestion is not free. Breaking food down and storing it burns a real fraction
 * of what was eaten — the thermic effect of food — and leaving it out understates
 * expenditure by the same amount every single day. On a ~1900 kcal intake that is
 * ~200 kcal/day, ~1400 kcal/week: roughly a fifth of a kilo of fat a week that the
 * old `BMR + active` maths credited to nothing. A deficit that is systematically
 * too small in the same direction every day is worse than a noisy one, because it
 * never averages out.
 */

/**
 * TEF as a fraction of intake.
 *
 * Mixed diets land at 10–12 %; protein alone runs 20–30 %, carbohydrate 5–10 %,
 * fat 0–3 %. 10.5 % is the mid-point for a mixed, protein-forward intake and is
 * the figure this programme has adopted.
 *
 * NOTE it is deliberately a flat fraction of TOTAL kcal rather than a per-macro
 * sum. A macro-weighted TEF is more precise in principle, but the macro splits it
 * would run on are themselves device estimates; a single stated coefficient is
 * honest about the resolution actually available and cannot drift between
 * surfaces.
 */
export const TEF_FACTOR = 0.105

/** Thermic effect of a day's intake. Null intake ⇒ null (never 0 — see below). */
export function tefKcal(intakeKcal: number | null | undefined): number | null {
  if (intakeKcal == null || !Number.isFinite(intakeKcal)) return null
  return intakeKcal * TEF_FACTOR
}

/**
 * Total daily energy expenditure. Returns null unless BMR, active energy AND
 * intake are all present.
 *
 * ALL-OR-NOTHING ON PURPOSE. A missing component treated as zero does not make
 * the estimate slightly wrong, it makes it wrong in a way that reads as a
 * finding: a day with no active-energy sync would report a 400 kcal larger
 * deficit than it earned. A null propagates; a zero lies.
 */
export function tdeeKcal(
  bmr: number | null | undefined,
  active: number | null | undefined,
  intakeKcal: number | null | undefined,
): number | null {
  const tef = tefKcal(intakeKcal)
  if (bmr == null || !Number.isFinite(bmr)) return null
  if (active == null || !Number.isFinite(active)) return null
  if (tef == null) return null
  return bmr + active + tef
}

/**
 * `BMR 1500 + active 890 + TEF 210` — one shared phrasing for the breakdown.
 *
 * Deliberately UNSEPARATED digits: its main consumer is the markdown export,
 * where every other figure on the line is printed plain, and a lone `1,500`
 * beside a plain `2600` reads as two different kinds of number.
 */
export function tdeeBreakdown(bmr: number, active: number, tef: number): string {
  const r = (v: number) => String(Math.round(v))
  return `BMR ${r(bmr)} + active ${r(active)} + TEF ${r(tef)}`
}
