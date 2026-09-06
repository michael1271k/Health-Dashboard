/**
 * Planned against done, eight weeks of it.
 *
 * ── WHY THE PLAN IS HALF THE DATA ────────────────────────────────────────────
 * A session list cannot draw a MISSED day: a day nothing happened on has no
 * row, so a chart built from sessions alone shows a perfect record with gaps in
 * it. The block is judged on exactly the gaps — five sessions against a target
 * of five — so every cell here carries what the SCHEDULE asked for as well as
 * what landed, and the two disagreeing is the whole point of the surface. The
 * same argument `HistoryWeeks` makes for its seven-dot strip.
 *
 * ── AND WHY A DAY CAN BE "EXTRA" ─────────────────────────────────────────────
 * Training on a scheduled rest day is neither adherence nor a miss. Counting it
 * as a hit would let a week of six random sessions read as 120 % of a five-day
 * plan without saying which five; ignoring it would erase a session that
 * happened. It gets its own state, it counts towards `done`, and `adherencePct`
 * is allowed to exceed 100 — which is a true statement about a week that
 * trained more than it planned to.
 */

import { isoAddDays, weekStartOf } from '@/lib/utils/week'

export interface ConsistencyDayIn {
  date: string
  /** The plan's key for the day — `null` on a scheduled rest day. */
  dayKey: string | null
  /** Did the plan ask for a session? */
  scheduled: boolean
  /** Did one land? */
  logged: boolean
}

/**
 * `rest` nothing was asked · `done` asked and delivered · `extra` delivered
 * unasked · `missed` asked, not delivered, and the day is over · `planned`
 * asked and the day has not happened yet.
 */
export type ConsistencyState = 'rest' | 'done' | 'extra' | 'missed' | 'planned'

export interface ConsistencyCell {
  date: string
  dayKey: string | null
  state: ConsistencyState
}

export interface ConsistencyWeek {
  weekStart: string
  /** Days the plan asked for. */
  planned: number
  /** Sessions that landed, extras included. */
  done: number
  /** Seven cells, always, oldest first. */
  cells: ConsistencyCell[]
}

export interface Consistency {
  /** Exactly `weeks` weeks, oldest first, ending on the week holding `endingOn`. */
  weeks: ConsistencyWeek[]
  planned: number
  done: number
  /** done ÷ planned × 100, one decimal. Null when nothing was ever planned. */
  adherencePct: number | null
}

export interface ConsistencyOptions {
  endingOn: string
  weeks?: number
  /** 0 = Sunday, 1 = Monday — `user_goals.week_end_day`, converted. */
  startDay?: number
}

/** The state one day is in. Pure, and the only place the five words are decided. */
export function consistencyState(day: ConsistencyDayIn | undefined, date: string, endingOn: string): ConsistencyState {
  if (day?.logged) return day.scheduled ? 'done' : 'extra'
  if (!day?.scheduled) return 'rest'
  return date > endingOn ? 'planned' : 'missed'
}

export function consistencySeries(days: ConsistencyDayIn[], options: ConsistencyOptions): Consistency {
  const { endingOn, weeks = 8, startDay = 0 } = options
  const byDate = new Map(days.map((d) => [d.date, d]))
  const lastStart = weekStartOf(endingOn, startDay)

  const out: ConsistencyWeek[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = isoAddDays(lastStart, -7 * w)
    const cells: ConsistencyCell[] = []
    for (let i = 0; i < 7; i++) {
      const date = isoAddDays(weekStart, i)
      const day = byDate.get(date)
      cells.push({ date, dayKey: day?.dayKey ?? null, state: consistencyState(day, date, endingOn) })
    }
    out.push({
      weekStart,
      planned: cells.filter((c) => c.state !== 'rest' && c.state !== 'extra').length,
      done: cells.filter((c) => c.state === 'done' || c.state === 'extra').length,
      cells,
    })
  }

  const planned = out.reduce((a, w) => a + w.planned, 0)
  const done = out.reduce((a, w) => a + w.done, 0)
  return {
    weeks: out,
    planned,
    done,
    adherencePct: planned > 0 ? Math.round((done / planned) * 1000) / 10 : null,
  }
}
