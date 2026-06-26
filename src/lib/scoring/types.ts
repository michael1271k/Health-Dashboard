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

  // Recovery
  waterMl: number
  waterGoalMl: number         // default 3000
  supplementsTaken: number    // count taken today
  supplementsGoal: number     // default 3

  // HR (optional)
  restingHR?: number          // today's resting HR in bpm
  baselineHR?: number         // 7-day trailing average resting HR

  // Context modifier
  contextMode?: 'normal' | 'travel' | 'illness' | 'emergency'

  // Hours awake (for battery drain)
  hoursAwake?: number         // defaults to 16 if omitted
}

export interface ScoreComponents {
  sleepScore: number      // 0–100
  nutritionScore: number  // 0–100
  activityScore: number   // 0–100
  workoutScore: number    // 0–100  (neutral on rest days, not penalized)
  recoveryScore: number   // 0–100
  totalScore: number      // 0–100 weighted composite (adaptive re-weighting)
}

export type ReadinessLevel = 'train_hard' | 'train_light' | 'rest'

export interface ReadinessResult {
  level: ReadinessLevel
  label: string         // "Train Hard" | "Train Light" | "Rest Today"
  labelHe: string       // Hebrew label
  color: string         // APEX palette hex
  reason: string        // 1-sentence English reason
}

export type AlertSeverity = 'warn' | 'danger' | 'info'

export interface ScoringAlert {
  severity: AlertSeverity
  message: string
}
