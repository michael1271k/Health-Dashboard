'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { computeInsights, type DayPoint, type SessionPoint, type Insight } from '@/lib/coach/insights'
import { computeReadiness } from '@/lib/scoring/readiness'
import type { ReadinessResult } from '@/lib/scoring/types'
import type { Tables } from '@/lib/supabase/types'
import { programDayFor, DEFAULT_PROGRAM_ID, eraForDate, isReentryWeek } from '@/lib/programs'
import { WEEKDAY_SPLIT, PPL_SPLITS, type SplitDay } from '@/lib/types/workout'
import { logicalTodayISO, logicalDaysAgoISO } from '@/lib/utils/day'

function daysAgoISO(n: number): string {
  return logicalDaysAgoISO(n)
}

/** Today's scheduled training-day label (program/era aware), or null on rest days. */
function todayDayLabel(todayISO: string): string | null {
  const weekday = new Date(`${todayISO}T12:00:00Z`).getUTCDay()
  if (eraForDate(todayISO) === 'ppl') {
    const s = WEEKDAY_SPLIT[weekday]
    return s === 'rest' || !s ? null : PPL_SPLITS[s as SplitDay]?.label ?? null
  }
  const d = programDayFor(DEFAULT_PROGRAM_ID, weekday)
  return d === 'rest' ? null : d.label
}

/**
 * Make the readiness verdict aware of the active program schedule + travel mode.
 * Never suggests "Rest Today" on a scheduled training weekday; on a scheduled
 * rest day it says so — unless a workout was actually logged (stay flexible).
 */
function scheduleAwareReadiness(
  base: ReadinessResult | null,
  ctx: { dayLabel: string | null; workoutToday: boolean; contextMode: string; reentry: boolean },
): ReadinessResult | null {
  if (ctx.contextMode === 'travel') {
    return {
      level: 'train_light', label: 'Travel Mode 🌴', color: '#19E3D0',
      reason: 'Vacation protocol — 2–3 short maintenance sessions this week is plenty. Prioritize rest, sun, and enjoying the trip.',
    }
  }
  if (!ctx.dayLabel && !ctx.workoutToday) {
    return { level: 'rest', label: 'Zone-2 / Rest', color: '#8B97B2', reason: 'Scheduled rest in APEX-5.1 — Zone-2 cardio (150–250 kcal) or full recovery.' }
  }
  if (ctx.dayLabel) {
    const name = ctx.dayLabel
    if (ctx.reentry) {
      return { level: 'train_light', label: `${name} · Re-Entry`, color: '#4FC3FF', reason: 'Re-entry week: ~90% loads, RPE cap 7–8. No PRs — groove the movements.' }
    }
    if (!base || base.level === 'train_hard') {
      return { level: 'train_hard', label: name, color: '#19E3B1', reason: `Scheduled ${name} — recovery looks strong, train hard.` }
    }
    if (base.level === 'rest') {
      return { level: 'train_light', label: `${name} · Go Light`, color: '#FFB020', reason: `Scheduled ${name}, but recovery is low — keep it light and technical.` }
    }
    return { ...base, label: name }
  }
  return base
}

export interface InsightsResult {
  readiness: ReadinessResult | null
  insights: Insight[]
}

/**
 * Pulls ~30 days of daily_logs + nutrition + sessions + today's score and runs
 * the deterministic correlation engine client-side (zero serverless cost).
 */
export function useInsights() {
  return useQuery({
    queryKey: ['coach', 'insights'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<InsightsResult> => {
      const from = daysAgoISO(30)
      const fromTs = `${from}T00:00:00Z`
      const today = logicalTodayISO()

      const [logsRes, nutritionRes, sessionsRes, scoreRes, goalsRes] = await Promise.all([
        supabase.from('daily_logs')
          .select('date, sleep_minutes, avg_rest_heart_rate, avg_heart_rate, respiratory_rate, weight_kg')
          .gte('date', from).order('date', { ascending: true }),
        supabase.from('nutrition_entries')
          .select('date, calories').eq('meal_type', 'daily')
          .gte('date', from).order('date', { ascending: true }),
        supabase.from('workout_sessions')
          .select('started_at, total_volume_kg, notes')
          .gte('started_at', fromTs).order('started_at', { ascending: true }),
        supabase.from('daily_scores').select('*').eq('date', today).maybeSingle(),
        supabase.from('user_goals').select('calorie_goal, context_mode').maybeSingle(),
      ])

      const logs = (logsRes.data ?? []) as Array<{
        date: string; sleep_minutes: number | null; avg_rest_heart_rate: number | null
        avg_heart_rate: number | null; respiratory_rate: number | null; weight_kg: number | null
      }>
      const nutrition = (nutritionRes.data ?? []) as Array<{ date: string; calories: number | null }>
      const calByDate = new Map(nutrition.map((n) => [n.date, n.calories]))
      const goals = goalsRes.data as { calorie_goal: number | null; context_mode: string | null } | null
      const calorieGoal = goals?.calorie_goal ?? null

      const days: DayPoint[] = logs.map((l) => ({
        date: l.date,
        sleepMin: l.sleep_minutes,
        restHr: l.avg_rest_heart_rate ?? l.avg_heart_rate,
        respiratory: l.respiratory_rate,
        weightKg: l.weight_kg,
        calories: calByDate.get(l.date) ?? null,
        calorieGoal,
      }))

      const sessions: SessionPoint[] = ((sessionsRes.data ?? []) as Array<{
        started_at: string; total_volume_kg: number | null; notes: string | null
      }>)
        .filter((s) => s.total_volume_kg != null && !s.notes?.startsWith('__seed_'))
        .map((s) => ({ date: s.started_at.slice(0, 10), volumeKg: s.total_volume_kg as number }))

      const score = scoreRes.data as Tables<'daily_scores'> | null
      const baseReadiness = score
        ? computeReadiness(
            { sleepScore: score.sleep_score ?? 0, recoveryScore: score.recovery_score ?? 0 },
            score.battery_pct ?? 0,
          )
        : null
      const todayISO = logicalTodayISO()
      const contextMode = goals?.context_mode ?? 'normal'
      const readiness = scheduleAwareReadiness(baseReadiness, {
        dayLabel: todayDayLabel(todayISO),
        workoutToday: sessions.some((s) => s.date === todayISO),
        contextMode,
        reentry: isReentryWeek(todayISO),
      })

      return { readiness, insights: computeInsights({ days, sessions, contextMode }) }
    },
  })
}
