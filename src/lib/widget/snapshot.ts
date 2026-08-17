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
 * One scope per widget FAMILY, because an extension is measured in hundreds of
 * milliseconds and a hard memory cap, and no family reads more than its own
 * quarter. `full` is the default so the Watch is untouched by the split.
 *
 *   · `lifestyle`   — Fuel: macros, water, steps, battery
 *   · `training`    — Training: today's session, the month calendar, volume, streak
 *   · `performance` — records, 1RM movement, the week's muscle-family split
 *   · `body`        — weight, composition, sleep stages, the score breakdown
 *
 * The scope only ever trims the EXPENSIVE extras — trends, ledgers, calendars,
 * per-family rollups. Every field the original contract promised ships in every
 * scope, because a shape that changes with a query parameter is a shape the
 * Swift decoder cannot rely on.
 */
export type WidgetScope = 'lifestyle' | 'performance' | 'training' | 'body' | 'full'

export const WIDGET_SCOPES: readonly WidgetScope[] = [
  'lifestyle', 'performance', 'training', 'body', 'full',
]

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
  /**
   * The per-DAY best estimate over the trailing window, oldest first.
   *
   * A number and an arrow say the lift moved; the series says whether it climbed
   * steadily or spiked once and gave it back, which is the difference between
   * progressing and having a good day.
   */
  trend?: TrendPoint[]
}

/** A muscle family's share of the training week. `sets` is fractional by design. */
export interface WidgetFamilyVolume { family: string; kg: number; sets: number }

/** Training totals for a seven-day window. */
export interface WidgetWeekTotals { sessions: number; volumeKg: number; prs: number; sets: number }

/**
 * TODAY's session, once it exists.
 *
 * Distinct from `workout`, which describes what the PLAN says. This describes
 * what happened, and is null until something has. The route already read this
 * table for the week aggregates and simply threw the per-day row away.
 */
export interface WidgetToday {
  durationMin: number | null
  sessionRpe: number | null
  volumeKg: number | null
  setCount: number | null
  prCount: number | null
}

/**
 * One day of the training calendar.
 *
 * `dayKey` is the PLAN's key for that date — resolved through
 * `serverScheduleContext`, so a swap moves it — and it is what the widget tints
 * the ring with (`DAY_COLOR`). `logged` is whether a session actually landed.
 * The two disagreeing is the whole point of the surface.
 */
export interface WidgetCalendarDay {
  d: string
  dayKey: string | null
  /** The plan's own name for the day — "Legs & Core B". Null on a rest day. */
  label: string | null
  /** False on a scheduled rest day. */
  scheduled: boolean
  logged: boolean
  volumeKg: number | null
}

/**
 * Cardio, as the Cardio focus needs it.
 *
 * ── ZONE 2 IS A SESSION COUNT, NOT A MINUTE TOTAL ────────────────────────────
 * `useCardio.ts` defines it: a session of `ZONE2_MIN_MINUTES` (20) or more
 * counts as one, and the weekly target is `ZONE2_WEEKLY_TARGET` (2). Shipping
 * minutes as "Zone 2" would put one definition on the home screen and another in
 * the CardioLogger — the same failure the streak had, with a different noun. The
 * route imports both constants rather than restating them.
 *
 * `weekMinutes` ships alongside because it is genuinely useful context, clearly
 * labelled as minutes, and cannot be mistaken for the target.
 */
export interface WidgetCardio {
  /** The most recent session, however long ago. Null on a fresh install. */
  last: {
    kind: string
    date: string
    distanceM: number | null
    durationMin: number | null
    /**
     * Minutes per kilometre, from `lib/cardio/metrics.ts` — never recomputed on
     * the Swift side. Pace there is a MINIMUM with a 1 km floor, and a second
     * implementation is a second chance to get that wrong.
     */
    paceMinPerKm: number | null
  } | null
  /** Sessions this week at or over the Zone-2 minimum. */
  weekSessions: number
  /** `ZONE2_WEEKLY_TARGET`, shipped so the widget never hardcodes a 2. */
  weekTarget: number
  /** Every cardio minute this week, Zone 2 or not. */
  weekMinutes: number
  /** Seven days of minutes, oldest first. Days with no cardio are omitted. */
  trend?: TrendPoint[]
}

/**
 * Consistency, in two numbers.
 *
 * `current` counts backwards from today over SCHEDULED training days only, so
 * Wednesday and Saturday rest never breaks a streak — a streak that a rest day
 * could end would be measuring the calendar rather than the athlete. `best` is
 * the longest such run on record.
 */
export interface WidgetStreak { current: number; best: number }

/** The five sub-scores behind the composite, each 0–100. */
export interface WidgetScores {
  sleep: number | null
  nutrition: number | null
  activity: number | null
  workout: number | null
  recovery: number | null
}

/** Today's readiness verdict, as `computeReadiness` grades it. */
export interface WidgetReadiness {
  level: string
  label: string
  color: string
  reason: string
}

/**
 * Body composition beyond the scale weight.
 *
 * Three DIFFERENT measurements, never interchangeable: `smmKg` is skeletal
 * muscle (~27 kg, entered by hand), `muscleKg` is lean soft tissue (~50 kg,
 * labelled as such), `ffmKg` is fat-free mass (~53 kg, derived).
 */
export interface WidgetBody {
  fatPct: number | null
  muscleKg: number | null
  smmKg: number | null
  ffmKg: number | null
  /**
   * Movement since the previous DIFFERENT reading of that field — not since the
   * previous row. `body_composition` carries values forward, so row-to-row would
   * report 0.0 on every day between weigh-ins and call it "held steady".
   */
  fatPctDelta: number | null
  muscleKgDelta: number | null
  smmKgDelta: number | null
  ffmKgDelta: number | null
  /** Up to 14 body-fat readings, oldest first. Gaps are left as gaps. */
  fatTrend?: TrendPoint[]
}

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
    /** The user's own target, in minutes. The Small sleep face hardcoded 480. */
    goalMin: number | null
    /**
     * Seven nights of duration, oldest first, bucketed by `nightOf`.
     *
     * Body scope only. One night is a reading; seven is the thing you can act
     * on — and it is what fills the Sleep Large, which was otherwise the Medium
     * with an inch of obsidian under it.
     */
    trend?: TrendPoint[]
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
    /** Seven days of intake, oldest first. Lifestyle scope. */
    kcalTrend?: TrendPoint[]
  }
  water: {
    ml: number | null; goalMl: number | null
    /** Seven days of intake, oldest first. Lifestyle scope. */
    trend?: TrendPoint[]
  }
  steps: {
    count: number | null; goal: number | null; distanceM: number | null; activeKcal: number | null
    /** Seven days, oldest first. */
    trend?: TrendPoint[]
  }

  /**
   * Today's scheduled session, whether it's already logged, and what the plan
   * asks of it.
   *
   * ── WHY THE PRESCRIPTION IS IN HERE ──────────────────────────────────────────
   * The Today face renders its stat row only once a session exists, so on an
   * unlogged training day — the state you actually look at the widget in — it
   * was a title, "not logged yet", and two-thirds of a Spacer. There was nothing
   * to put there because the payload never carried the plan's own ask.
   *
   * `prescribedFor` (lib/programs.ts) has answered this the whole time; the
   * route simply never called it.
   */
  workout: {
    label: string; dayKey: string | null; logged: boolean; isRestDay: boolean
    /**
     * What the plan prescribes for today, in the ACTIVE phase — cut drops
     * bulk-only lifts to zero sets and they fall out of both counts.
     *
     * Null on a rest day and when the key resolves to no program day. Never 0,
     * which on a training day reads as "nothing to do" rather than "unknown".
     */
    plannedExercises: number | null
    plannedSets: number | null
    /**
     * Tonnage the last time this same `dayKey` was trained — the number that
     * answers "what am I chasing". Null when this split has no earlier session
     * inside the window the route already reads.
     */
    lastVolumeKg: number | null
  }

  /** Week-to-date training totals, and how many sessions the plan schedules. */
  week: { sessions: number; volumeKg: number; prs: number; sets: number; sessionTarget: number }
  /** The same seven figures for LAST week, so "up or down" is answerable. */
  weekPrev?: WidgetWeekTotals

  /** Performance scope only — omitted, never emptied, when not requested. */
  records?: WidgetRecord[]
  e1rm?: WidgetE1rm[]
  volumeByFamily?: WidgetFamilyVolume[]

  /**
   * Today's logged session, or null on a day with none.
   *
   * Cheap enough to ship in every scope: it comes from `workout_sessions` rows
   * the route already fetches for the week totals.
   */
  today: WidgetToday | null

  /** Consistency. Cheap — derived from the calendar the training scope builds. */
  streak?: WidgetStreak

  /** Training scope — cardio's own slice. Off `cardio_logs`, one extra read. */
  cardio?: WidgetCardio

  /**
   * Training scope — scheduled-vs-logged days, oldest first.
   *
   * ── WHY THIS IS NO LONGER A PURE TRAILING WINDOW ─────────────────────────────
   * It was 42 days ending TODAY, which is exactly what the streak needs and
   * exactly what a month grid cannot use: the back half of the current month is
   * in the future and therefore absent, so the calendar face could only ever
   * draw a rolling six weeks. The window is now the trailing 42 days UNION the
   * current calendar month, so both surfaces get the days they need out of one
   * array. Future days carry the plan's answer and `logged: false`.
   */
  calendar?: WidgetCalendarDay[]
  /** Training scope — eight weekly tonnage totals, oldest first, `d` = week start. */
  volumeTrend?: TrendPoint[]

  /** Body scope — composition beyond the scale weight. */
  body?: WidgetBody
  /** Body scope — the five sub-scores behind `score`. */
  scores?: WidgetScores
  /** Body scope — today's readiness verdict. */
  readiness?: WidgetReadiness
}

/** kcal left against the goal — the small widget's headline. Null if unknown. */
export function caloriesRemaining(s: WidgetSnapshot): number | null {
  const { kcal, kcalGoal } = s.macros
  if (kcal == null || kcalGoal == null) return null
  return Math.round(kcalGoal - kcal)
}
