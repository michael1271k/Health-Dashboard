/**
 * T4WM — Trailing-4 Weigh-in Mean, and the stall protocol.
 *
 * Daily scale weight is mostly noise: gut content, glycogen (each gram binds
 * ~3 g water), sodium, and hydration swing a lifter ±1 kg inside a day, which is
 * larger than a week's real fat loss. Comparing "this Sunday vs last Sunday"
 * therefore measures the noise, not the trend. Averaging the last four weigh-ins
 * collapses most of it while staying responsive enough to catch a genuine stall.
 */

export interface WeighIn { date: string; weightKg: number }

export interface T4wmPoint {
  date: string
  weightKg: number
  /** Mean of this weigh-in and the three before it. Null until 4 exist. */
  t4wm: number | null
}

/** Weigh-ins in date order with their trailing-4 mean. Input order is irrelevant. */
export function t4wmSeries(weighIns: readonly WeighIn[]): T4wmPoint[] {
  const sorted = [...weighIns]
    .filter((w) => Number.isFinite(w.weightKg) && w.weightKg > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  return sorted.map((w, i) => {
    if (i < 3) return { date: w.date, weightKg: w.weightKg, t4wm: null }
    const window = sorted.slice(i - 3, i + 1)
    const mean = window.reduce((a, b) => a + b.weightKg, 0) / 4
    return { date: w.date, weightKg: w.weightKg, t4wm: Math.round(mean * 100) / 100 }
  })
}

/** The most recent trailing-4 mean, or null when there are fewer than 4 weigh-ins. */
export function latestT4wm(weighIns: readonly WeighIn[]): number | null {
  const s = t4wmSeries(weighIns)
  for (let i = s.length - 1; i >= 0; i--) if (s[i].t4wm != null) return s[i].t4wm
  return null
}

/**
 * Stall protocol levers, escalating. Each is a decision the athlete makes; the
 * report states which one is in play, it does not apply anything.
 */
export type StallLever = 0 | 1 | 2 | 3

export interface StallStatus {
  /** T4WM change over the comparison window, kg. Negative = losing. */
  deltaKg: number | null
  /** Weeks of T4WM data available for the comparison. */
  weeks: number
  lever: StallLever
  label: string
  detail: string
}

export const STALL_LEVERS: Record<StallLever, { label: string; detail: string }> = {
  0: { label: 'On track', detail: 'T4WM moving at or beyond the target rate — hold everything.' },
  1: { label: 'Lever 1 · NEAT', detail: 'Trend flat for 2 weeks. Add ~1,500 steps/day before touching food.' },
  2: { label: 'Lever 2 · Intake', detail: 'Still flat after the NEAT bump. Cut ~100 kcal/day from carbs, protein untouched.' },
  3: { label: 'Lever 3 · Diet break', detail: 'Three-plus weeks stalled with adherence intact — a maintenance week, not another cut.' },
}

/**
 * Grade the stall.
 *
 * `targetRateKgWk` is signed (a cut is negative). "Stalled" means the trend
 * moved less than a THIRD of target — near-zero movement is a stall, but so is
 * losing at a quarter of the intended rate, and both need the same response.
 */
export function stallStatus(
  weighIns: readonly WeighIn[],
  targetRateKgWk: number | null,
  /** How many prior weeks were already stalled, from the previous report. */
  priorStalledWeeks = 0,
): StallStatus {
  const s = t4wmSeries(weighIns).filter((p) => p.t4wm != null)
  const weeks = s.length
  if (weeks < 2 || targetRateKgWk == null || targetRateKgWk === 0) {
    return { deltaKg: null, weeks, lever: 0, ...STALL_LEVERS[0] }
  }

  const first = s[Math.max(0, s.length - 3)].t4wm as number   // up to 2 weeks back
  const last = s[s.length - 1].t4wm as number
  const spanWeeks = Math.max(1, s.length - 1 - Math.max(0, s.length - 3))
  const deltaKg = Math.round((last - first) * 100) / 100
  const perWeek = deltaKg / spanWeeks

  // Progress in the INTENDED direction, as a fraction of target.
  const progress = perWeek / targetRateKgWk
  const stalled = progress < (1 / 3)

  if (!stalled) return { deltaKg, weeks, lever: 0, ...STALL_LEVERS[0] }

  const lever: StallLever = priorStalledWeeks >= 3 ? 3 : priorStalledWeeks >= 2 ? 2 : 1
  return { deltaKg, weeks, lever, ...STALL_LEVERS[lever] }
}
