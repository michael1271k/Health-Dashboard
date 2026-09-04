'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { computeInsights, type DayPoint, type SessionPoint, type Insight } from '@/lib/coach/insights'
import { computeReadiness } from '@/lib/scoring/readiness'
import type { ReadinessResult } from '@/lib/scoring/types'
import { scheduleAwareReadiness } from '@/lib/coach/scheduleReadiness'
import type { Tables } from '@/lib/supabase/types'
import { scheduleDayFor, isReentryWeek } from '@/lib/programs'
import { logicalTodayISO, logicalDaysAgoISO } from '@/lib/utils/day'
import { validWeight } from '@/lib/utils/units'

function daysAgoISO(n: number): string {
  return logicalDaysAgoISO(n)
}

/** Today's scheduled training-day label (shared era-aware helper), or null on rest days. */
function todayDayLabel(todayISO: string): string | null {
  const d = scheduleDayFor(todayISO)
  return d === 'rest' ? null : d.label
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
      const from = daysAgoISO(60)   // 60d window feeds the Fuel→Force correlator
      const fromTs = `${from}T00:00:00Z`
      const today = logicalTodayISO()

      const [logsRes, nutritionRes, sessionsRes, scoreRes, goalsRes] = await Promise.all([
        supabase.from('daily_logs')
          .select('date, sleep_minutes, avg_rest_heart_rate, avg_heart_rate, respiratory_rate, weight_kg, nutrition_exception')
          .gte('date', from).order('date', { ascending: true }),
        supabase.from('nutrition_entries')
          .select('date, calories, carbs_g').eq('meal_type', 'daily')
          .gte('date', from).order('date', { ascending: true }),
        supabase.from('workout_sessions')
          .select('started_at, total_volume_kg, notes')
          .gte('started_at', fromTs).order('started_at', { ascending: true }),
        supabase.from('daily_scores').select('*').eq('date', today).maybeSingle(),
        supabase.from('user_goals').select('calorie_goal, context_mode').maybeSingle(),
      ])

      // PostgREST 400s the WHOLE select for one unknown column. Losing sleep,
      // resting HR and weight — the inputs to most of the engine — because
      // `nutrition_exception` is not migrated yet would be a poor trade, so the
      // narrow select is retried on error.
      let logsRows = logsRes.data
      if (logsRes.error) {
        const retry = await supabase.from('daily_logs')
          .select('date, sleep_minutes, avg_rest_heart_rate, avg_heart_rate, respiratory_rate, weight_kg')
          .gte('date', from).order('date', { ascending: true })
        logsRows = retry.data
      }
      const logs = (logsRows ?? []) as Array<{
        date: string; sleep_minutes: number | null; avg_rest_heart_rate: number | null
        avg_heart_rate: number | null; respiratory_rate: number | null; weight_kg: number | null
        nutrition_exception?: string | null
      }>
      const nutrition = (nutritionRes.data ?? []) as Array<{ date: string; calories: number | null; carbs_g: number | null }>
      const calByDate = new Map(nutrition.map((n) => [n.date, n.calories]))
      const carbsByDate = new Map(nutrition.map((n) => [n.date, n.carbs_g]))
      const goals = goalsRes.data as { calorie_goal: number | null; context_mode: string | null } | null
      const calorieGoal = goals?.calorie_goal ?? null

      const days: DayPoint[] = logs.map((l) => ({
        date: l.date,
        sleepMin: l.sleep_minutes,
        restHr: l.avg_rest_heart_rate ?? l.avg_heart_rate,
        respiratory: l.respiratory_rate,
        weightKg: validWeight(l.weight_kg),
        calories: calByDate.get(l.date) ?? null,
        calorieGoal,
        carbsG: carbsByDate.get(l.date) ?? null,
        exception: l.nutrition_exception ?? null,
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

      return { readiness, insights: computeInsights({ days, sessions, contextMode, todayISO }) }
    },
  })
}
