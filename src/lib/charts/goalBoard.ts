/**
 * The Goal Board — the three numbers that say whether the phase is working.
 *
 * ── WHY THE TWIN ARRIVES A WAVE LATE ─────────────────────────────────────────
 * `OnyxCore/Charts/GoalBoard.swift` shipped in W5 with hand-written Swift tests
 * and no TypeScript behind it, because the row it feeds is native-only. W12
 * rebinds that row to `TrajectorySeries` and puts the same rate and the same
 * arrival date on a widget face — so the two now have to agree to the digit,
 * on a phone, in a snapshot built by a different builder. That is exactly the
 * shape of drift the golden vectors exist to catch, so the arithmetic gets a
 * definition here and Swift replays it.
 *
 * Nothing about the Swift changes. This is a transcription, and the vector is
 * the proof that it is one.
 *
 * ── THE RATE IS A REGRESSION, NOT A DIFFERENCE ───────────────────────────────
 * `weeklyRateKg` in `useEnergyBalance`, for the reason stated there: two
 * readings a fortnight apart can differ by a kilo of water, so "latest minus
 * earliest ÷ weeks" computes the rate from precisely the two noisiest numbers
 * in the window. Least squares over every reading is the whole point of having
 * weighed yourself twenty times. Under three readings it returns null — a line
 * through two points is not a trend.
 *
 * ── AND THE ETA IS MEASURED FROM THE FITTED LINE ─────────────────────────────
 * Not from the last reading. The rate is a smoothed quantity and the target is
 * a fixed one; dividing a smoothed rate into a raw distance makes the ETA jump
 * by weeks whenever the morning's reading is a bad one.
 */

import { isoAddDays } from '@/lib/utils/week'

/** Where the measured rate sits against the phase's band. */
export type GoalPace = 'onTrack' | 'under' | 'over' | 'reversed' | 'unknown'

export interface GoalReading {
  date: string
  /** A nil weight is a day with no weigh-in. Dropped, never carried forward —
   *  a carried weight flattens the slope towards zero for free. */
  weightKg: number | null
}

export interface GoalEnergyDay {
  date: string
  intakeKcal: number | null
  /** `tdeeKcal`, which is null unless BMR, active energy and intake are all in. */
  tdeeKcal: number | null
}

export interface GoalBoard {
  ratePerWeekKg: number | null
  /** Where the fitted line puts today — the weight the ETA is measured from. */
  trendWeightKg: number | null
  targetRateMinKgWk: number | null
  targetRateMaxKgWk: number | null
  targetWeightKg: number | null
  weeksToTarget: number | null
  etaISO: string | null
  /** `intake − TDEE` summed over the days given. Negative is a deficit. */
  weekBalanceKcal: number | null
  weekDaysCounted: number
  pace: GoalPace
}

export interface GoalBoardInput {
  readings: GoalReading[]
  energy: GoalEnergyDay[]
  targetWeightKg: number | null
  rateMinKgWk: number | null
  rateMaxKgWk: number | null
  today: string
}

/** Epoch day number for an ISO date, or null. */
function dayNumber(iso: string): number | null {
  const t = Date.parse(`${iso}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null
}

export interface GoalFit {
  slopePerWeek: number
  /** The fitted weight on a date, unrounded. */
  at: (iso: string) => number | null
}

/** The line, or null under three readings. */
export function fitWeight(readings: GoalReading[]): GoalFit | null {
  const points: Array<{ t: number; w: number }> = []
  for (const r of readings) {
    const day = dayNumber(r.date)
    if (r.weightKg == null || !Number.isFinite(r.weightKg) || day == null) continue
    points.push({ t: day, w: r.weightKg })
  }
  if (points.length < 3) return null
  const n = points.length
  const mt = points.reduce((a, p) => a + p.t, 0) / n
  const mw = points.reduce((a, p) => a + p.w, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.t - mt) * (p.w - mw)
    den += (p.t - mt) ** 2
  }
  if (den === 0) return null
  const slope = num / den
  return {
    slopePerWeek: Math.round(slope * 7 * 100) / 100,
    at: (iso) => {
      const d = dayNumber(iso)
      return d == null ? null : mw + slope * (d - mt)
    },
  }
}

/** The least-squares slope in kg per week, to two decimals. */
export function weeklyRateKg(readings: GoalReading[]): number | null {
  return fitWeight(readings)?.slopePerWeek ?? null
}

/**
 * The band is SIGNED, so "faster" is not "larger". A cut asking for
 * −0.50…−0.40 is over its pace at −0.7 and under it at −0.2; a bulk asking for
 * +0.20…+0.25 is the mirror. The direction the band points decides which side
 * of it is which.
 */
export function goalPace(rate: number | null, lo: number | null, hi: number | null): GoalPace {
  if (rate == null || lo == null || hi == null) return 'unknown'
  const low = Math.min(lo, hi)
  const high = Math.max(lo, hi)
  if (rate >= low && rate <= high) return 'onTrack'
  const losing = low + high < 0
  if (losing) {
    if (rate > 0) return 'reversed'
    return rate < low ? 'over' : 'under'
  }
  if (rate < 0) return 'reversed'
  return rate > high ? 'over' : 'under'
}

export function goalBoard(input: GoalBoardInput): GoalBoard {
  const { readings, energy, targetWeightKg, rateMinKgWk, rateMaxKgWk, today } = input
  const board: GoalBoard = {
    ratePerWeekKg: null,
    trendWeightKg: null,
    targetRateMinKgWk: rateMinKgWk,
    targetRateMaxKgWk: rateMaxKgWk,
    targetWeightKg,
    weeksToTarget: null,
    etaISO: null,
    weekBalanceKcal: null,
    weekDaysCounted: 0,
    pace: 'unknown',
  }

  const line = fitWeight(readings)
  if (line) {
    board.ratePerWeekKg = line.slopePerWeek
    const at = line.at(today)
    board.trendWeightKg = at == null ? null : Math.round(at * 10) / 10
  }

  // ── The ETA ────────────────────────────────────────────────────────────────
  // Only when the line is pointing at the target. A cut whose scale is going up
  // has no arrival date, and reporting a negative number of weeks — or an
  // absolute value of one — would be the app inventing an answer it does not
  // have.
  const rate = board.ratePerWeekKg
  const current = board.trendWeightKg
  if (rate != null && rate !== 0 && targetWeightKg != null && current != null) {
    const distance = targetWeightKg - current
    if (distance === 0) {
      board.weeksToTarget = 0
      board.etaISO = today
    } else if (distance > 0 === rate > 0) {
      const weeks = distance / rate
      board.weeksToTarget = Math.round(weeks * 10) / 10
      board.etaISO = isoAddDays(today, Math.trunc(Math.round(weeks * 7)))
    }
  }

  // ── The week's ledger ──────────────────────────────────────────────────────
  const counted = energy.filter((d) => d.intakeKcal != null && d.tdeeKcal != null)
  board.weekDaysCounted = counted.length
  if (counted.length > 0) {
    board.weekBalanceKcal = Math.round(
      counted.reduce((a, d) => a + (d.intakeKcal ?? 0) - (d.tdeeKcal ?? 0), 0),
    )
  }

  board.pace = goalPace(board.ratePerWeekKg, rateMinKgWk, rateMaxKgWk)
  return board
}
