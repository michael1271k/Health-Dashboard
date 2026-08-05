import { paceMinPerKm, activeKcalOf } from './metrics'

/**
 * Cardio personal records — PURE, and DERIVED AT READ TIME.
 *
 * WHY NOT `personal_records`
 * That table is the lifting ledger: keyed `(user_id, exercise_key, axis)` with
 * `axis ∈ weight | reps | volume | e1rm`, and `prSeed` asserts every session on
 * or before 2026-07-31 down to the exact count of rows. Cardio's axes don't fit
 * that vocabulary, and adding rows to a table whose totals are asserted is a way
 * to break the record book for a walk. `cardio_logs` is small enough to grade on
 * every read, so cardio keeps its own engine and the two can never collide.
 *
 * WHY NOT A `cardio_prs` TABLE
 * A stored PR has to be recomputed whenever a row is edited or deleted, and the
 * failure mode is silent: a trophy for a run you removed. Deriving from the
 * ledger means the records cannot disagree with the log they come from.
 *
 * PACE IS A MINIMUM. Every other axis is a maximum. This is the one inversion in
 * the file and the one thing that gets implemented wrong.
 */

export type CardioAxis = 'distance' | 'duration' | 'pace' | 'calories'

export const CARDIO_AXIS_LABEL: Record<CardioAxis, string> = {
  distance: 'Distance',
  duration: 'Duration',
  pace: 'Pace',
  calories: 'Calories',
}

/**
 * A pace record needs real distance behind it. Without this floor, a 200 m dash
 * for a bus posts a 3:10 /km and owns the record forever — a number you can
 * never beat because you were never running that distance.
 */
export const MIN_PACE_DISTANCE_M = 1000

export interface CardioRow {
  id: string
  kind: string
  distance_m: number | null
  duration_min: number | null
  kcal?: number | null
  active_kcal?: number | null
  date?: string
}

/** The value that won an axis, and the row that set it. */
export interface CardioRecord {
  axis: CardioAxis
  value: number
  id: string
  date?: string
}

/** Axis value for one row, or null when the row can't compete on that axis. */
export function axisValue(row: CardioRow, axis: CardioAxis): number | null {
  switch (axis) {
    case 'distance':
      return row.distance_m != null && Number.isFinite(row.distance_m) && row.distance_m > 0
        ? row.distance_m : null
    case 'duration':
      return row.duration_min != null && Number.isFinite(row.duration_min) && row.duration_min > 0
        ? row.duration_min : null
    case 'calories': {
      const k = activeKcalOf(row)
      return k != null && Number.isFinite(k) && k > 0 ? k : null
    }
    case 'pace': {
      // Distance gate first: a fast pace over 200 m is not a pace record.
      if (row.distance_m == null || row.distance_m < MIN_PACE_DISTANCE_M) return null
      return paceMinPerKm(row.distance_m, row.duration_min)
    }
  }
}

/** Lower is better on pace; higher on everything else. */
export const isMinAxis = (axis: CardioAxis): boolean => axis === 'pace'

const CARDIO_AXES: readonly CardioAxis[] = ['distance', 'duration', 'pace', 'calories']

/**
 * Standing records for ONE activity kind. A run PR and a walk PR are different
 * records — 5 km jogged does not beat 5 km walked, and mixing them would let the
 * easier activity own the distance record while the harder one owns pace.
 *
 * Ties keep the EARLIER row: the record belongs to whoever set it first, and a
 * repeat performance should not quietly re-date an achievement.
 */
export function cardioRecords(rows: readonly CardioRow[], kind: string): Partial<Record<CardioAxis, CardioRecord>> {
  const mine = rows.filter((r) => r.kind === kind)
  const out: Partial<Record<CardioAxis, CardioRecord>> = {}
  for (const axis of CARDIO_AXES) {
    const min = isMinAxis(axis)
    for (const row of mine) {
      const v = axisValue(row, axis)
      if (v == null) continue
      const held = out[axis]
      if (held == null || (min ? v < held.value : v > held.value)) {
        out[axis] = { axis, value: v, id: row.id, date: row.date }
      }
    }
  }
  return out
}

/**
 * Which axes a given row currently HOLDS — what earns a trophy on its line.
 *
 * Note this answers "is this row the standing record", not "was this a record
 * when it was logged". A walk beaten last week stops showing a trophy, which is
 * the same rule the lifting ledger follows: it keeps one standing row per axis.
 */
export function axesHeldBy(rows: readonly CardioRow[], rowId: string): CardioAxis[] {
  const row = rows.find((r) => r.id === rowId)
  if (!row) return []
  const records = cardioRecords(rows, row.kind)
  return CARDIO_AXES.filter((a) => records[a]?.id === rowId)
}
