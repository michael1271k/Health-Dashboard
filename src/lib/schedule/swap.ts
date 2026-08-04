/**
 * Day-swap planning — pure, so the rule can be tested without a database.
 *
 * THE BUG THIS EXISTS TO FIX. "Rest Day" used to write ONE row: `{today: rest}`.
 * That is not a swap, it is a deletion — the workout the plan had scheduled for
 * today simply stopped existing, the week lost a session, and nothing said so.
 * A rest day you take because you slept four hours is a REARRANGEMENT of the
 * week, not a cancellation of it, so taking one has to move the work somewhere.
 *
 * Where it moves to is read from the active plan, never hardcoded: the next date
 * whose effective schedule is already rest (HELIX-5 rests Wed and Sat, PPL rests
 * Fri and Sat, and a plan swapped in Settings brings its own). `resolve` is
 * injected rather than imported so the caller decides what "effective" means —
 * in the app that is `scheduleDayFor`, which already layers per-date overrides
 * over the plan's weekday default.
 *
 * No clock, no network, no React.
 */

import { isoAddDays } from '@/lib/utils/week'
import { REST_OVERRIDE } from './overrides'
import type { ScheduleDay } from '@/lib/programs'

/** One row destined for `schedule_overrides`. `dayKey` may be REST_OVERRIDE. */
export interface ScheduleWrite {
  date: string
  dayKey: string
}

/**
 * How far ahead a displaced workout may be re-homed: the rest of this week plus
 * all of the next. Beyond that the session is no longer the same training week
 * and moving it silently would misreport weekly volume, so the plan reports
 * `no-slot` and lets the UI say so.
 */
export const SWAP_HORIZON_DAYS = 13

export type RestOutcome =
  /** The date was already rest — nothing to do. */
  | 'already-rest'
  /** The workout found a home; `movedTo` says where. */
  | 'swapped'
  /** Every day inside the horizon is already spoken for. */
  | 'no-slot'
  /** A PPL-era day with no `dayKey` — there is no key to place anywhere. */
  | 'unscheduled'

export interface RestDayPlan {
  writes: ScheduleWrite[]
  /** The workout that was on the date, or null when it was already rest. */
  moved: ScheduleDay | null
  /** Where it landed, or null when nothing moved / nowhere to put it. */
  movedTo: string | null
  /** False when the only free slot was in the following week. */
  sameWeek: boolean
  outcome: RestOutcome
}

/** What is actually scheduled on a date, overrides included. */
export type ResolveDay = (dateISO: string) => ScheduleDay | 'rest'

/**
 * Sunday-anchored date for a program weekday in the week containing `dateISO`.
 *
 * Deliberately Sunday-anchored regardless of the user's display week-start
 * preference: `ProgramDay.weekday` is defined as 0=Sun…6=Sat by the plan itself,
 * so reading it against a Monday-start week would shift every day by one.
 */
export function dateForWeekday(dateISO: string, weekday: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  const anchored = new Date(d)
  anchored.setUTCDate(d.getUTCDate() - d.getUTCDay() + weekday)
  return anchored.toISOString().slice(0, 10)
}

/** The seven Sunday-anchored dates of the week containing `dateISO`. */
export function weekDatesOf(dateISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => dateForWeekday(dateISO, i))
}

const sundayOf = (dateISO: string) => dateForWeekday(dateISO, 0)

/**
 * Take a rest day on `dateISO`, moving whatever was scheduled there onto the
 * next date the plan already rests.
 *
 * The search runs FORWARD only. Pushing a session into the past is not a thing
 * that can happen, and a "next available" slot that lands on Monday when it is
 * Thursday would quietly rewrite a week that has already been reported on.
 */
export function planRestDay(
  dateISO: string,
  resolve: ResolveDay,
  horizon: number = SWAP_HORIZON_DAYS,
): RestDayPlan {
  const current = resolve(dateISO)
  if (current === 'rest') {
    return { writes: [], moved: null, movedTo: null, sameWeek: true, outcome: 'already-rest' }
  }

  const rest: ScheduleWrite = { date: dateISO, dayKey: REST_OVERRIDE }

  // A legacy PPL date resolves to a bare label ("Push") with no program key.
  // There is nothing to place, so the day just becomes rest.
  if (!current.dayKey) {
    return { writes: [rest], moved: current, movedTo: null, sameWeek: true, outcome: 'unscheduled' }
  }

  for (let i = 1; i <= horizon; i += 1) {
    const target = isoAddDays(dateISO, i)
    if (resolve(target) !== 'rest') continue
    return {
      writes: [rest, { date: target, dayKey: current.dayKey }],
      moved: current,
      movedTo: target,
      sameWeek: sundayOf(target) === sundayOf(dateISO),
      outcome: 'swapped',
    }
  }

  return { writes: [rest], moved: current, movedTo: null, sameWeek: true, outcome: 'no-slot' }
}

/**
 * Place `dayKey` onto `dateISO` as a genuine EXCHANGE.
 *
 * The old version placed the incoming day and blanket-rested its natural weekday
 * slot, which meant that pulling Friday's session onto Wednesday destroyed
 * whatever Wednesday held. Now the displaced day takes the vacated slot, so the
 * week keeps the same set of sessions in a different order — which is what the
 * word "swap" means.
 *
 * `naturalDate` is the incoming day's own weekday slot, used only when the day
 * isn't currently placed anywhere in this week (so a day already moved once is
 * not duplicated onto two dates).
 */
export function planDaySwap(
  dateISO: string,
  dayKey: string,
  resolve: ResolveDay,
  naturalDate: string | null,
): ScheduleWrite[] {
  const incoming: ScheduleWrite = { date: dateISO, dayKey }
  const source = findInWeek(dateISO, dayKey, resolve) ?? naturalDate
  if (!source || source === dateISO) return [incoming]

  const displaced = resolve(dateISO)
  const displacedKey = displaced === 'rest' ? REST_OVERRIDE : (displaced.dayKey ?? REST_OVERRIDE)
  return [incoming, { date: source, dayKey: displacedKey }]
}

/** Where `dayKey` currently sits in this week, if anywhere. */
function findInWeek(dateISO: string, dayKey: string, resolve: ResolveDay): string | null {
  for (const d of weekDatesOf(dateISO)) {
    if (d === dateISO) continue
    const s = resolve(d)
    if (s !== 'rest' && s.dayKey === dayKey) return d
  }
  return null
}

/** "Wed 6 Aug" — the shape a swap confirmation needs. */
export function shortDayLabel(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/** One sentence describing what a rest-day plan did, for the UI to echo back. */
export function describeRestPlan(plan: RestDayPlan): string {
  const name = plan.moved?.label ?? 'The session'
  switch (plan.outcome) {
    case 'already-rest':
      return 'Already a rest day.'
    case 'swapped':
      return `${name} moved to ${shortDayLabel(plan.movedTo as string)}${plan.sameWeek ? '' : ' — next week'}.`
    case 'no-slot':
      return `Rest day set. No free rest slot in the next ${SWAP_HORIZON_DAYS} days, so ${name} was dropped.`
    case 'unscheduled':
    default:
      return 'Rest day set.'
  }
}
