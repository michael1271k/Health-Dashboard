'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/lib/supabase/types'

// Today's date in user's local timezone (YYYY-MM-DD)
function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA') // 'en-CA' gives YYYY-MM-DD
}

// Last 30 days for trend charts (used by Task 5 Charts hooks)
export function last30Days(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toLocaleDateString('en-CA')
}

export function useTodayScore() {
  return useQuery({
    queryKey: ['daily_scores', 'today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select('*')
        .eq('date', todayLocal())
        .maybeSingle()
      if (error) throw error
      return data as Tables<'daily_scores'> | null
    },
  })
}

export function useTodayDailyLog() {
  return useQuery({
    queryKey: ['daily_logs', 'today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('date', todayLocal())
        .maybeSingle()
      if (error) throw error
      return data as Tables<'daily_logs'> | null
    },
  })
}

export function useTodayMetrics() {
  return useQuery({
    queryKey: ['daily_metrics', 'today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_metrics')
        .select('*')
        .eq('date', todayLocal())
        .maybeSingle()
      if (error) throw error
      return data as Tables<'daily_metrics'> | null
    },
  })
}

export function useTodayNutrition() {
  return useQuery({
    queryKey: ['nutrition_entries', 'today'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nutrition_entries')
        .select('*')
        .eq('date', todayLocal())
        .eq('meal_type', 'daily')
        .maybeSingle()
      if (error) throw error
      return data as Tables<'nutrition_entries'> | null
    },
  })
}

export function useTodaySleep() {
  return useQuery({
    queryKey: ['sleep_sessions', 'today'],
    queryFn: async () => {
      const today = todayLocal()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toLocaleDateString('en-CA')

      // Sleep can be keyed to yesterday's date (HealthKit convention)
      const { data, error } = await supabase
        .from('sleep_sessions')
        .select('*')
        .gte('start_time', `${yesterdayStr}T12:00:00Z`)
        .lt('start_time', `${today}T12:00:00Z`)
        .order('duration_min', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Tables<'sleep_sessions'> | null
    },
  })
}

export function useUserGoals() {
  return useQuery({
    queryKey: ['user_goals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data as Tables<'user_goals'> | null
    },
    staleTime: 5 * 60 * 1000, // Goals rarely change — 5 min cache
  })
}

export function useRecentSessions(limit = 5) {
  return useQuery({
    queryKey: ['workout_sessions', 'recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as Tables<'workout_sessions'>[]
    },
  })
}
