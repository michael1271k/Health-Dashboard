import type { ReadinessResult } from '@/lib/scoring/types'

export interface ScheduleReadinessContext {
  dayLabel: string | null
  workoutToday: boolean
  contextMode: string
  reentry: boolean
}

/**
 * Make the readiness verdict aware of the active program schedule + travel mode.
 * Never suggests "Rest Today" on a scheduled training weekday; on a scheduled
 * rest day it says so — unless a workout was actually logged (stay flexible).
 */
export function scheduleAwareReadiness(
  base: ReadinessResult | null,
  ctx: ScheduleReadinessContext,
): ReadinessResult | null {
  if (ctx.contextMode === 'travel') {
    return {
      level: 'train_light', label: 'Travel Mode 🌴', color: '#8E9AAC',
      reason: 'Vacation protocol — 2–3 short maintenance sessions this week is plenty. Prioritize rest, sun, and enjoying the trip.',
    }
  }
  if (!ctx.dayLabel && !ctx.workoutToday) {
    return { level: 'rest', label: 'Zone-2 / Rest', color: '#79808C', reason: 'Scheduled rest in HELIX-5 — Zone-2 cardio (150–250 kcal) or full recovery.' }
  }
  if (ctx.dayLabel) {
    const name = ctx.dayLabel
    if (ctx.reentry) {
      return { level: 'train_light', label: `${name} · Re-Entry`, color: '#3D7AB8', reason: 'Re-entry week: ~90% loads, RPE cap 7–8. No PRs — groove the movements.' }
    }
    if (!base || base.level === 'train_hard') {
      return { level: 'train_hard', label: name, color: '#3E9E7A', reason: `Scheduled ${name} — recovery looks strong, train hard.` }
    }
    if (base.level === 'rest') {
      return { level: 'train_light', label: `${name} · Go Light`, color: '#D4AF37', reason: `Scheduled ${name}, but recovery is low — keep it light and technical.` }
    }
    return { ...base, label: name }
  }
  return base
}
