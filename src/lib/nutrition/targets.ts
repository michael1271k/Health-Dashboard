/**
 * What a date is graded against, in one value. The golden source for
 * `HelixCore/Nutrition/Targets.swift`, which every native reader — scorer,
 * widget snapshot, Nutrition tab, Pulse strip — resolves through.
 *
 * The chain, stated once: your own numbers → the rung in force ON THAT DATE
 * (`goalsForDate`) → the day's own `daily_targets` row on top
 * (`applyDailyTarget`). Water and sleep have no rung and no day override; they
 * pass through from the row.
 */

import { goalsForDate, leverForDate, type LeverGoals, type LeverId } from './levers'
import { applyDailyTarget, type DailyTarget } from './dailyTargets'
import { BUILTIN_PROFILES, matchesProfile, type TargetProfile } from './profiles'

export interface TargetSources {
  /** The user's own five numbers, before any rung. */
  own: LeverGoals
  waterMl: number | null
  sleepHours: number | null
  /** `user_goals.active_lever` / `maintenance_until`, as stored. */
  activeLever: string | null
  maintenanceUntil: string | null
  /** The date's `daily_targets` row, or null. */
  dayTarget: DailyTarget | null
  /** The user's STORED profiles; the built-ins fill in behind them. */
  profiles: TargetProfile[]
}

export interface ResolvedTargets {
  /** Zero is an unset row, not a fast. */
  kcal: number
  protein: number | null
  carbs: number | null
  fat: number | null
  steps: number | null
  waterMl: number | null
  sleepHours: number | null
  /** The rung in force on the date, or null before the cut opened. */
  leverId: LeverId | null
  /** The profile the day's figures MATCH — not the stamp — or null. */
  profileKey: string | null
}

/** Saved profiles first, then the built-ins they have not replaced (by key). */
export function mergedProfiles(stored: readonly TargetProfile[]): TargetProfile[] {
  const known = new Set(stored.map((p) => p.key))
  return [...stored, ...BUILTIN_PROFILES.filter((p) => !known.has(p.key))]
}

export function resolveTargets(s: TargetSources, dateISO: string, todayISO: string): ResolvedTargets {
  const goals = applyDailyTarget(
    goalsForDate(dateISO, s.activeLever, todayISO, s.own, s.maintenanceUntil),
    s.dayTarget,
  )
  return {
    kcal: goals.calorie,
    protein: goals.protein,
    carbs: goals.carbs,
    fat: goals.fat,
    steps: goals.steps,
    waterMl: s.waterMl,
    sleepHours: s.sleepHours,
    leverId: leverForDate(dateISO, s.activeLever, todayISO, s.maintenanceUntil),
    profileKey: mergedProfiles(s.profiles).find((p) => matchesProfile(s.dayTarget, p))?.key ?? null,
  }
}
