/**
 * Where the scale is going, and when it arrives.
 *
 * ── WHY AN EWMA AND A REGRESSION, BOTH ───────────────────────────────────────
 * They answer different questions and the tile draws both.
 *
 * The EWMA is the LINE — what to draw over the raw dots, so the shape of the
 * fortnight is legible through a kilo of water. It is local: it bends when the
 * scale bends, which is what makes a stall visible three days in rather than
 * three weeks in.
 *
 * The regression is the RATE — one number for the whole window, and the number
 * the Goal Board row already prints (`goalBoard.ts`). A tile that computed its
 * own rate off the EWMA's endpoints would disagree with the row above it on the
 * same screen, which is precisely the class of split this project has already
 * paid for once with the streak. One rate, one source; the EWMA is a curve.
 *
 * ── AND WHY THE SMOOTHING IS TIME-WEIGHTED ───────────────────────────────────
 * Weigh-ins are sparse by protocol — every second or third morning, and not at
 * all on a trip. A plain `α·x + (1−α)·s` treats a reading taken after a
 * fortnight's gap exactly like one taken the next morning, so the line drifts
 * out of date and then lurches. The weight here is `2^(−Δdays / halfLife)`:
 * after one half-life the previous state counts half, whether that half-life
 * took one reading or six.
 */

import { phaseSpanFor, type PhaseKind } from '@/lib/phases'
import { goalBoard, type GoalBoard, type GoalEnergyDay, type GoalReading } from '@/lib/charts/goalBoard'

/** How long it takes an old reading to count half. Ten days is ~a fortnight of
 *  water noise smoothed while a real 0.5 kg/week trend survives it. */
export const TRAJECTORY_HALF_LIFE_DAYS = 10

export interface TrajectoryPoint {
  d: string
  /** The morning's reading. */
  raw: number
  /** The smoothed line at that reading, two decimals. */
  ewma: number
}

export interface Trajectory {
  /** One point per reading, oldest first. Days without a weigh-in are absent. */
  points: TrajectoryPoint[]
  /** The rate, the arrival and the pace — `goalBoard`, unchanged. */
  board: GoalBoard
  /** What the title flips on. Null between phases. */
  phaseKind: PhaseKind | null
  /** The newest smoothed value — what the line ENDS at, which is not the same
   *  as the fitted `trendWeightKg` the ETA is measured from. */
  latestEwmaKg: number | null
}

export interface TrajectoryOptions {
  today: string
  targetWeightKg?: number | null
  rateMinKgWk?: number | null
  rateMaxKgWk?: number | null
  /** The week's days, for the ledger figure the Goal Board row prints. */
  energy?: GoalEnergyDay[]
  halfLifeDays?: number
}

function dayNumber(iso: string): number | null {
  const t = Date.parse(`${iso}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null
}

/**
 * The time-weighted EWMA of a weight series, oldest first.
 *
 * Readings arrive in any order and are sorted; a null weight, an unparseable
 * date and a duplicate date are dropped (last one wins for a duplicate, as a
 * `Map` would). The state carries FULL precision and only the output is
 * rounded — rounding each step compounds a hundredth per reading into a tenth
 * over a block.
 */
export function weightEwma(readings: GoalReading[], halfLifeDays = TRAJECTORY_HALF_LIFE_DAYS): TrajectoryPoint[] {
  const byDate = new Map<string, number>()
  const order: string[] = []
  for (const r of readings) {
    if (r.weightKg == null || !Number.isFinite(r.weightKg) || dayNumber(r.date) == null) continue
    if (!byDate.has(r.date)) order.push(r.date)
    byDate.set(r.date, r.weightKg)
  }
  const dates = order.slice().sort()
  const half = halfLifeDays > 0 ? halfLifeDays : TRAJECTORY_HALF_LIFE_DAYS

  const out: TrajectoryPoint[] = []
  let state: number | null = null
  let previousDay: number | null = null
  for (const d of dates) {
    const raw = byDate.get(d)!
    const day = dayNumber(d)!
    if (state == null || previousDay == null) {
      state = raw
    } else {
      const gap = Math.max(0, day - previousDay)
      const w = Math.pow(2, -gap / half)
      state = raw * (1 - w) + state * w
    }
    previousDay = day
    out.push({ d, raw, ewma: Math.round(state * 100) / 100 })
  }
  return out
}

export function trajectorySeries(readings: GoalReading[], options: TrajectoryOptions): Trajectory {
  const points = weightEwma(readings, options.halfLifeDays)
  return {
    points,
    board: goalBoard({
      readings,
      energy: options.energy ?? [],
      targetWeightKg: options.targetWeightKg ?? null,
      rateMinKgWk: options.rateMinKgWk ?? null,
      rateMaxKgWk: options.rateMaxKgWk ?? null,
      today: options.today,
    }),
    phaseKind: phaseSpanFor(options.today)?.def.kind ?? null,
    latestEwmaKg: points.length > 0 ? points[points.length - 1].ewma : null,
  }
}
