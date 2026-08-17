import type { ReportTargets } from '@/lib/reports/fmtV2'

/**
 * The report asked for something; the week did something. This decides which.
 *
 * ── WHY A BAND AND NOT AN EQUALITY ───────────────────────────────────────────
 * Every target here is a daily average over a week in progress, so exact
 * agreement is meaningless — 3.19 L against a 3.2 L floor is a hit by any human
 * reading, and a row that goes red for a 0.3% shortfall trains you to stop
 * reading the rows. The bands are deliberately wide and symmetric, EXCEPT for
 * ranges, where being inside the range is the whole instruction.
 *
 * ── AND WHY OVER IS NOT ALWAYS GOOD ──────────────────────────────────────────
 * Water and steps are floors: more is fine. Calories are a CEILING during a cut
 * — 2,400 kcal against an 1,885 kcal target is not a better week, it is the
 * thing the target existed to prevent. So the direction that counts as a miss is
 * a property of the metric, not of the arithmetic.
 */

export type Verdict = 'hit' | 'near' | 'miss' | 'unknown'

/** Which way a target may be exceeded without it being a miss. */
export type TargetShape = 'floor' | 'ceiling' | 'range'

const NEAR = 0.12

export function verdictFor(
  actual: number | null | undefined,
  target: number | null | undefined,
  shape: TargetShape,
  high?: number | null,
): Verdict {
  if (actual == null || target == null || !Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) {
    return 'unknown'
  }

  if (shape === 'range' && high != null && high > 0) {
    if (actual >= target && actual <= high) return 'hit'
    const edge = actual < target ? target : high
    return Math.abs(actual - edge) / edge <= NEAR ? 'near' : 'miss'
  }

  const ratio = actual / target
  if (shape === 'floor') {
    if (ratio >= 1) return 'hit'
    return ratio >= 1 - NEAR ? 'near' : 'miss'
  }
  // ceiling
  if (ratio <= 1) return 'hit'
  return ratio <= 1 + NEAR ? 'near' : 'miss'
}

/** One line of the dashboard comparison. */
export interface TargetRow {
  key: 'water' | 'steps' | 'calories' | 'protein'
  label: string
  /** What the report asked for, already formatted. */
  target: string
  /** What the week actually shows, already formatted. Null while unknown. */
  actual: string | null
  verdict: Verdict
  /** The surface that fixes this row. */
  href: string
}

/** Live weekly averages, one per metric. Null where the week has no data yet. */
export interface WeekActuals {
  waterL: number | null
  steps: number | null
  kcal: number | null
  proteinG: number | null
}

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const thousands = (n: number) => Math.round(n).toLocaleString('en-GB')

/**
 * Build the comparison rows.
 *
 * Only metrics the report actually prescribed appear — this is a reading of a
 * document, not a scorecard the app invented, so a report that said nothing
 * about steps produces no steps row rather than a row graded against the
 * default goal.
 */
export function targetRows(
  targets: ReportTargets | null | undefined,
  actuals: WeekActuals,
  todayISO: string,
): TargetRow[] {
  if (!targets) return []
  const rows: TargetRow[] = []

  if (targets.water) {
    const { minL, maxL } = targets.water
    rows.push({
      key: 'water',
      label: 'Hydration',
      target: minL === maxL ? `${oneDp(minL)} L` : `${oneDp(minL)}–${oneDp(maxL)} L`,
      actual: actuals.waterL != null ? `${oneDp(actuals.waterL)} L` : null,
      verdict: verdictFor(actuals.waterL, minL, minL === maxL ? 'floor' : 'range', maxL),
      href: `/day/${todayISO}?section=water`,
    })
  }

  if (targets.steps != null) {
    rows.push({
      key: 'steps',
      label: 'Steps',
      target: thousands(targets.steps),
      actual: actuals.steps != null ? thousands(actuals.steps) : null,
      verdict: verdictFor(actuals.steps, targets.steps, 'floor'),
      href: '/pathfinder',
    })
  }

  if (targets.macros?.kcal != null) {
    rows.push({
      key: 'calories',
      label: 'Intake',
      target: `${thousands(targets.macros.kcal)} kcal`,
      actual: actuals.kcal != null ? `${thousands(actuals.kcal)} kcal` : null,
      verdict: verdictFor(actuals.kcal, targets.macros.kcal, 'ceiling'),
      href: '/nutrition',
    })
  }

  if (targets.macros?.proteinG != null) {
    rows.push({
      key: 'protein',
      label: 'Protein',
      target: `${Math.round(targets.macros.proteinG)} g`,
      actual: actuals.proteinG != null ? `${Math.round(actuals.proteinG)} g` : null,
      verdict: verdictFor(actuals.proteinG, targets.macros.proteinG, 'floor'),
      href: '/nutrition',
    })
  }

  // Five rows is the point at which the card stops being read; the ones that
  // survive are the ones the week is furthest from.
  const rank: Record<Verdict, number> = { miss: 0, near: 1, hit: 2, unknown: 3 }
  return rows.sort((a, b) => rank[a.verdict] - rank[b.verdict]).slice(0, 5)
}
