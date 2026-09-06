/**
 * The six windows every chart on this app can be asked to draw, resolved to a
 * date range and the words that name it (decision 12).
 *
 * ── WHY THIS IS NOT `useEraWindow` ───────────────────────────────────────────
 * `useEraWindow` answers ONE window — "the whole of the active plan" — and it
 * answers it through React Query, `localStorage` and a subscription, because
 * the web reads its plan selection synchronously during render. None of that
 * is the question. The question is: given a day, a plan and a lever schedule,
 * what range does "Current phase" mean, and what is it called.
 *
 * That is a pure function, it is the thing the native app needs, and it is the
 * thing a golden vector can pin. The hook keeps its subscription; this module
 * is the arithmetic underneath, ported to Swift as `OnyxCore/Time/EraWindow`.
 *
 * ── WHY THE LABEL IS DERIVED AND NEVER TYPED ─────────────────────────────────
 * The native Trends screen had a segmented control whose middle pill said
 * "Axis" — a rawValue that stopped being a product name two renames ago, left
 * in a `switch` because the string was also load-bearing for
 * `VolumeSplit.splits(forEra:)`. History said "Onyx" for the same era on the
 * next tab. A label that is spelled in a view is a label that goes stale in a
 * view, so every one of these comes from the phase table, the lever table or
 * the plan catalogue — the same places the rest of the app reads them from.
 *
 * ── AND WHY EVERY WINDOW ENDS TODAY ──────────────────────────────────────────
 * These are TRAILING windows: the reader is looking at what has happened, and
 * a window that ran past today would reserve axis space for days that do not
 * exist yet, which draws every current phase as though it were tailing off.
 */

import { phaseSpanFor } from '@/lib/phases'
import { HELIX_CUT_START } from '@/lib/programs'
import { LEVER_SCHEDULE, leverById, leverForDate } from '@/lib/nutrition/levers'
import { isoAddDays } from '@/lib/utils/week'

/** The six pills, in display order. `days` carries its own length. */
export type EraWindowMode =
  | { kind: 'currentPhase' }
  | { kind: 'currentLever' }
  | { kind: 'sinceCutStart' }
  | { kind: 'days'; n: number }
  | { kind: 'all' }

/** Display order and the default (decision 12: default Current phase). */
export const ERA_WINDOW_MODES: EraWindowMode[] = [
  { kind: 'currentPhase' },
  { kind: 'currentLever' },
  { kind: 'sinceCutStart' },
  { kind: 'days', n: 30 },
  { kind: 'days', n: 90 },
  { kind: 'all' },
]

export const DEFAULT_ERA_WINDOW: EraWindowMode = { kind: 'currentPhase' }

/**
 * What the caller knows that this module cannot derive.
 *
 * `firstDataISO` is the oldest date the CALLER holds — the first session, the
 * first weigh-in — and it is what "All" means. Without it "All" would have to
 * invent a floor, and every floor it could invent is either a date the user
 * has no data for (a chart with three empty months on the left) or the cut
 * start (which is what "Since cut" already says).
 */
export interface EraWindowInput {
  today: string
  /** `activeProgram().label` — "Onyx-5". */
  planLabel: string
  /** `user_goals.active_lever`, verbatim. */
  storedLever?: string | null
  /** `user_goals.maintenance_until` — a release that closes itself. */
  releaseEndsOn?: string | null
  /** The oldest date the caller has anything for. */
  firstDataISO?: string | null
}

export interface ResolvedEraWindow {
  /** The pill's text, and the chart caption's. */
  label: string
  /** First day in the window, inclusive. */
  startISO: string
  /** Last day, inclusive — always `today`. */
  endISO: string
  /** Inclusive day count, floored at 1. */
  days: number
}

/** Inclusive day count between two ISO dates, floored at 1. */
export function windowDays(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`)
  const to = Date.parse(`${toISO}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 1
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1)
}

/**
 * A stable key for a mode — what a picker binds its selection to.
 *
 * The span is CLAMPED the same way `resolveEraWindow` clamps it, so the key
 * names the window that would actually be drawn. Without that, `{ days: 0 }`
 * writes `days:0`, which `eraWindowFromKey` refuses — and a preference that
 * serializes but cannot be read back is a preference that silently reverts.
 */
export function eraWindowKey(mode: EraWindowMode): string {
  return mode.kind === 'days' ? `days:${Math.max(1, Math.round(mode.n))}` : mode.kind
}

/** The mode a key names, or null. */
export function eraWindowFromKey(key: string): EraWindowMode | null {
  if (key.startsWith('days:')) {
    const n = Number(key.slice(5))
    return Number.isFinite(n) && n > 0 ? { kind: 'days', n: Math.round(n) } : null
  }
  return ERA_WINDOW_MODES.find((m) => eraWindowKey(m) === key) ?? null
}

/**
 * How far back the lever walk is allowed to go: the first row of the schedule,
 * because before it there was no lever and every day answers the same `null`.
 * Without a floor, a device whose stored lever matches the oldest scheduled one
 * would walk to the epoch one day at a time.
 */
const LEVER_FLOOR = LEVER_SCHEDULE[0]?.from ?? HELIX_CUT_START

/**
 * The first day of the run ending on `today` that shares today's rung.
 *
 * A walk rather than a lookup in `LEVER_SCHEDULE`, and deliberately: the rung
 * in force is `leverForDate`, which is the SCHEDULE for past days and the
 * STORED selection for today onward. When those two disagree — the user pulled
 * a rung this morning that the schedule does not know about — the run genuinely
 * is one day long, and reading the schedule's `from` would claim a fortnight of
 * days had been eaten under a rung that was chosen at breakfast.
 */
function leverRunStart(input: EraWindowInput): string {
  const { today, storedLever, releaseEndsOn } = input
  const id = leverForDate(today, storedLever, today, releaseEndsOn)
  let start = today
  for (;;) {
    const prev = isoAddDays(start, -1)
    if (prev < LEVER_FLOOR) break
    if (leverForDate(prev, storedLever, today, releaseEndsOn) !== id) break
    start = prev
  }
  return start
}

/**
 * The window a mode names, on a given day.
 *
 * Never throws and never returns a range that runs backwards: a start after
 * `today` is clamped to `today`, so the worst a bad anchor can do is draw one
 * day.
 */
export function resolveEraWindow(mode: EraWindowMode, input: EraWindowInput): ResolvedEraWindow {
  const { today } = input
  const clamp = (startISO: string, label: string): ResolvedEraWindow => {
    const start = startISO > today ? today : startISO
    return { label, startISO: start, endISO: today, days: windowDays(start, today) }
  }

  switch (mode.kind) {
    case 'currentPhase': {
      const span = phaseSpanFor(today)
      // No phase covers the day — the gap around the Thailand trip is a real
      // one. The plan is still a true name for "everything you are running".
      if (!span) return clamp(input.firstDataISO || today, `${input.planLabel} Era`)
      return clamp(span.start, span.def.eraTag ?? span.def.name)
    }
    case 'currentLever': {
      const id = leverForDate(today, input.storedLever, today, input.releaseEndsOn)
      // `leverById` is null for `custom` and for a day before the cut opened,
      // which is the point: it names the ABSENCE of a rung.
      return clamp(leverRunStart(input), leverById(id)?.label ?? 'Custom')
    }
    case 'sinceCutStart':
      return clamp(HELIX_CUT_START, 'Since cut')
    case 'days': {
      // The label describes the window that is DRAWN, so it takes the clamped
      // span: a mode asking for 0 days draws today and must not caption it "0 d".
      const span = Math.max(1, Math.round(mode.n))
      return clamp(isoAddDays(today, -(span - 1)), `${span} d`)
    }
    case 'all':
      return clamp(input.firstDataISO || today, 'All')
  }
}

/**
 * Which ERA's splits a window's charts should offer.
 *
 * The volume chart keys its split pills off this (`splitsForEra`), and the two
 * eras bucket sessions differently — a PPL week has Push/Pull/Legs and an Onyx
 * week has none of them. A window that starts before the cut and ends today
 * spans both, so it gets both.
 */
export function eraForWindow(window: ResolvedEraWindow): 'all' | 'ppl' | 'axis' {
  if (window.startISO >= HELIX_CUT_START) return 'axis'
  if (window.endISO < HELIX_CUT_START) return 'ppl'
  return 'all'
}
