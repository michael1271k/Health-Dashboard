export interface ScoringInputs {
  // Sleep
  sleepHours: number          // total sleep duration in hours
  deepMinutes: number         // deep sleep in minutes
  remMinutes: number          // REM sleep in minutes
  sleepGoalHours: number      // user goal, default 8

  // Nutrition (daily totals)
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  calorieGoal: number
  proteinGoalG: number
  carbsGoalG: number
  fatGoalG: number
  /**
   * This day was DECLARED an exception — a dinner out, a refeed, a sick day.
   * The nutrition score then grades protein and nothing else.
   *
   * It forgives the grade only. Intake still reaches the weekly average, the
   * deficit and the weight trend at full value; see
   * `lib/nutrition/exceptionDay.ts`. Absent/false is an ordinary day.
   */
  nutritionException?: boolean

  // Activity
  steps: number
  activeCal: number
  stepsGoal: number           // default 10000
  activeCalGoal: number       // default 500

  // Workout (optional — 0 means no session today)
  workoutLogged: boolean
  isRestDay: boolean          // true for Wed/Sat in the PPL+ schedule
  newPRsToday: number         // count of new PRs in today's session
  sessionVolumeKg: number     // total volume of today's session
  /**
   * Average volume of the last sessions OF THE SAME TYPE (0 when there is no
   * baseline yet). Same-type matters: an arms day is ~3 t and a leg day ~12 t,
   * so an all-sessions average graded every arms day as a shortfall and every
   * leg day as a win, no matter how either was actually executed.
   */
  trailingAvgVolumeKg: number
  /**
   * CR-10 the session was logged with (`workout_sessions.session_rpe`), from the
   * hardest session of the day. Scales the battery's workout drain — it is the
   * only subjective signal the app collects about how a session actually went,
   * and until v7 it was written every day and read by nothing.
   *
   * Absent on every Notion-era session — the rebuilt sets carry no RPE, because
   * `report_md` never recorded one — which is not the same as zero: the
   * battery falls back to `BATTERY.defaultRpe`, not to "it never happened".
   */
  sessionRpe?: number | null
  splitDay?: 'push' | 'pull' | 'legs' | 'upper' | 'lower'  // workout score; NOT battery drain since v7
  /**
   * The programme day (`cb_a` | `legs_a` | `arms` | `cb_b` | `legs_b`).
   *
   * Battery drain is CEILINGED per day type — a hard leg day can cost more than
   * a hard arms day (see `WORKOUT_MAX_BY_DAY`). Distinct from `splitDay`, which
   * is coarser ('upper' covers both A and B) and still drains nothing.
   * Absent on legacy rows; `workoutMaxFor` falls back to the upper-day figure.
   */
  sessionDayKey?: string | null
  /**
   * Is this date inside a planned maintenance / deload week?
   *
   * Resolved by `isMaintenanceDate` — the lever selection first, the phase as a
   * fallback — and passed in rather than derived here so the scorer, the export
   * and the tests all get the same answer for the same day.
   *
   * It lowers the workout drain CEILING (`MAINTENANCE_DRAIN_FACTOR`) and nothing
   * else. Recovery is deliberately untouched: it is sleep, resting HR and HRV,
   * all of which a real deload improves on their own, and a bonus on top would
   * be inventing a number the sensors are already reporting honestly.
   */
  isMaintenance?: boolean
  /** Exercises the program prescribes for the day (0/undefined = unknown). */
  plannedExercises?: number
  /** Distinct exercises actually logged. */
  loggedExercises?: number
  /** Working sets the program prescribes for the day. */
  plannedSets?: number
  /** Working sets actually logged. */
  sessionSets?: number
  /** Sets logged as taken to failure. */
  failureSets?: number

  // Recovery
  waterMl: number
  waterGoalMl: number         // default 3000

  // HR (optional)
  restingHR?: number          // today's resting HR in bpm
  baselineHR?: number         // 7-day trailing average resting HR
  // No `respiratoryRate`. It sat here as an optional input labelled "recovery
  // signal" and no scorer ever read it — nothing even constructed it. The
  // column is ingested and rendered in Vitals; it just is not part of the
  // score, and the type should not imply otherwise.
  hrvMs?: number              // today's HRV (SDNN ms)
  hrvBaseline?: number        // 7-day trailing average HRV

  /**
   * `daily_logs.sleep_onset_trouble` — the wearer said the night was hard to
   * fall into. Battery v8 takes 3 off the wake charge for it; nothing else
   * reads it. Absent/false is an ordinary night.
   */
  sleepOnsetTrouble?: boolean | null
  /**
   * The LATEST fatigue slot logged today, 1 (Fresh) .. 5 (Empty) — the same
   * `latestFatigue` rule the tracker shows as the day's summary. Battery v8's
   * stress drain reads it (0..4 points); the day score still does not, which is
   * the promise `useFatigue` makes. Absent when nothing was logged.
   */
  fatigueLevel?: number | null

  // Context modifier
  contextMode?: 'normal' | 'travel' | 'illness' | 'emergency'

  // Hours awake (for battery drain)
  hoursAwake?: number         // defaults to 16 if omitted

  // Time / day context (drives "pending vs missed" workout logic)
  isCurrentDay?: boolean      // true only for today
  localHour?: number          // 0–23 local hour, for the current day
}

// Sub-scores are 0–100 OR null (null = no data / not applicable → excluded from
// the composite, never a fake 0 or 100).
export interface ScoreComponents {
  sleepScore: number | null
  nutritionScore: number | null
  activityScore: number | null
  workoutScore: number | null   // null on rest days / travel / pending
  recoveryScore: number | null  // null when no sleep AND no HR data
  hydrationScore: number | null // null when no water goal / nothing logged yet
  totalScore: number | null     // null only if every component is null
  // True when it's the live current day and no sleep data has synced yet — the
  // UI shows "Awaiting Sleep Data" instead of a misleading composite number.
  awaitingSleep: boolean
}

export type ReadinessLevel = 'train_hard' | 'train_light' | 'rest'

export interface ReadinessResult {
  level: ReadinessLevel
  label: string         // "Train Hard" | "Train Light" | "Rest Today" (strict English)
  color: string         // HELIX palette hex
  reason: string        // 1-sentence English reason
}

export type AlertSeverity = 'warn' | 'danger' | 'info'

export interface ScoringAlert {
  severity: AlertSeverity
  message: string
}
