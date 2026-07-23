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
  trailingAvgVolumeKg: number // avg volume over last 7 sessions (0 if <2 sessions)
  splitDay?: 'push' | 'pull' | 'legs' | 'upper' | 'lower'  // hardest split drives battery drain

  // Recovery
  waterMl: number
  waterGoalMl: number         // default 3000
  supplementsTaken: number    // count taken today
  supplementsGoal: number     // default 3

  // HR (optional)
  restingHR?: number          // today's resting HR in bpm
  baselineHR?: number         // 7-day trailing average resting HR
  respiratoryRate?: number    // breaths/min (recovery signal)
  hrvMs?: number              // today's HRV (SDNN ms)
  hrvBaseline?: number        // 7-day trailing average HRV

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
