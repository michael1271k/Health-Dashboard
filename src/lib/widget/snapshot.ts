/**
 * The Widget/Watch snapshot — a small, read-only view of "right now".
 *
 * WHY A SEPARATE ENDPOINT INSTEAD OF SHARING THE APP'S DATA:
 * a Widget or Watch extension is a separate process in a separate container. The
 * normal way to hand it data is an App Group, but App Groups are a PAID Apple
 * Developer Program capability — on a free personal team Xcode refuses to add
 * one. So the extensions can't read the app's UserDefaults, files, or Keychain,
 * and they can't run Supabase auth either (nowhere to persist a rotating refresh
 * token). They fetch this endpoint themselves with a long-lived opaque token
 * baked into the build.
 *
 * A pleasant side effect: the Watch works standalone over Wi-Fi/LTE with the
 * phone out of range, which a WatchConnectivity mirror can't do.
 *
 * The shape is deliberately flat and tiny — extensions get a few hundred
 * milliseconds and a strict memory budget. Every field is nullable: a widget
 * showing "—" is correct, a widget showing a stale or invented number is not.
 */

/**
 * Which slice of the payload a caller wants.
 *
 * The two composite widgets read disjoint halves, and an extension is measured
 * in hundreds of milliseconds and a hard memory cap. `full` is the default so
 * the Watch and the five original widget kinds are untouched by the split.
 *
 * The scope only ever trims the EXPENSIVE extras — trends, ledgers, per-family
 * rollups. Every field the original contract promised ships in every scope,
 * because a shape that changes with a query parameter is a shape the Swift
 * decoder cannot rely on.
 */
export type WidgetScope = 'lifestyle' | 'performance' | 'full'

export const WIDGET_SCOPES: readonly WidgetScope[] = ['lifestyle', 'performance', 'full']

export function parseScope(raw: string | null | undefined): WidgetScope {
  return WIDGET_SCOPES.includes(raw as WidgetScope) ? (raw as WidgetScope) : 'full'
}

/** One dated reading. Short keys: every byte crosses into a capped extension. */
export interface TrendPoint { d: string; v: number }

/** A standing record off the `personal_records` ledger, floored by the book. */
export interface WidgetRecord {
  exercise: string
  /** 'weight' | 'reps' | 'volume' | 'e1rm' — free text, so a new axis renders. */
  axis: string
  value: number
  reps: number | null
  achievedOn: string
}

/** A lift's current estimated 1RM, and its movement over the trailing window. */
export interface WidgetE1rm {
  exercise: string
  kg: number
  /** Null when the lift has no session old enough to compare against. */
  deltaKg: number | null
}

/** A muscle family's share of the training week. `sets` is fractional by design. */
export interface WidgetFamilyVolume { family: string; kg: number; sets: number }

/** Training totals for a seven-day window. */
export interface WidgetWeekTotals { sessions: number; volumeKg: number; prs: number; sets: number }

export interface WidgetSnapshot {
  /** The user's logical date this snapshot describes. */
  date: string
  generatedAt: string
  /** Which slice this payload is, echoed so a cache can be keyed on it. */
  scope: WidgetScope

  /** Drain-only day battery, 0–100. */
  battery: number | null
  /** Composite daily score, 0–100. */
  score: number | null

  sleep: {
    minutes: number | null
    deepMin: number | null
    remMin: number | null
    /** Stage totals, NOT a timeline — the Sleep Rainbow is a stacked bar, not a
     *  hypnogram, and drawing it as one would claim an ordering we do not have. */
    coreMin: number | null
    awakeMin: number | null
    score: number | null
    /** Bedtime and wake, ISO. `start_time` is the PREVIOUS evening. */
    startTime: string | null
    endTime: string | null
  }

  weight: {
    kg: number | null
    deltaKg: number | null
    measuredOn: string | null
    targetKg: number | null
    /** Last week's mean — the dotted baseline the fortnight is read against. */
    prevWeekMeanKg: number | null
    /** Up to 14 weigh-ins, oldest first. Gaps are left as gaps. */
    trend?: TrendPoint[]
  }

  macros: {
    kcal: number | null; kcalGoal: number | null
    proteinG: number | null; proteinGoalG: number | null
    carbsG: number | null; carbsGoalG: number | null
    fatG: number | null; fatGoalG: number | null
  }
  water: { ml: number | null; goalMl: number | null }
  steps: {
    count: number | null; goal: number | null; distanceM: number | null; activeKcal: number | null
    /** Seven days, oldest first. */
    trend?: TrendPoint[]
  }

  /** Today's scheduled session, and whether it's already logged. */
  workout: { label: string; dayKey: string | null; logged: boolean; isRestDay: boolean }

  /** Week-to-date training totals, and how many sessions the plan schedules. */
  week: { sessions: number; volumeKg: number; prs: number; sets: number; sessionTarget: number }
  /** The same seven figures for LAST week, so "up or down" is answerable. */
  weekPrev?: WidgetWeekTotals

  /** Performance scope only — omitted, never emptied, when not requested. */
  records?: WidgetRecord[]
  e1rm?: WidgetE1rm[]
  volumeByFamily?: WidgetFamilyVolume[]
}

/** kcal left against the goal — the small widget's headline. Null if unknown. */
export function caloriesRemaining(s: WidgetSnapshot): number | null {
  const { kcal, kcalGoal } = s.macros
  if (kcal == null || kcalGoal == null) return null
  return Math.round(kcalGoal - kcal)
}
