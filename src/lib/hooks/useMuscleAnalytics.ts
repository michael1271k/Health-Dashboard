'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { eraForDate } from '@/lib/programs'

/** Canonicalize Hevy muscle tags into 6 display groups (v5.1 aliases included). */
const MUSCLE_MAP: Record<string, string> = {
  chest: 'Chest', pecs: 'Chest',
  back: 'Back', lats: 'Back', traps: 'Back', rhomboids: 'Back',
  shoulders: 'Shoulders', delts: 'Shoulders', rear_delts: 'Shoulders',
  biceps: 'Arms', triceps: 'Arms', forearms: 'Arms', arms: 'Arms',
  quads: 'Legs', quadriceps: 'Legs', hamstrings: 'Legs', glutes: 'Legs', calves: 'Legs', legs: 'Legs',
  core: 'Core', abs: 'Core', obliques: 'Core',
}

/** v5.1 exercise-name → muscle tags (parser aliases). Used by the catalog updater. */
export const V51_EXERCISE_ALIASES: Record<string, string[]> = {
  'Calf Press': ['calves'],
  'Hack/Smith Squat': ['quads', 'glutes'],
  'Hack Squat': ['quads', 'glutes'],
  'Smith Squat': ['quads', 'glutes'],
  'Reverse EZ-Bar Curl': ['forearms', 'biceps'],
  'Hanging Knee Raise': ['abs'],
  'Cross-Body Cable Extension': ['triceps'],
}
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'] as const
export const GROUP_COLOR: Record<string, string> = {
  Chest: '#38E1FF', Back: '#43F59B', Shoulders: '#4FC3FF', Arms: '#E8C57A', Legs: '#19E3B1', Core: '#7C8CFF',
}

export interface MuscleStat { group: string; sets: number; volume: number; daysSince: number | null }
export interface MuscleAnalytics {
  stats: MuscleStat[]
  weekly: Array<Record<string, number | string>> // { week, Chest, Back, ... } sets per group per week
}

export function useMuscleAnalytics(days = 30, era: 'all' | 'ppl' | 'axis' = 'all') {
  // logicalTodayISO in the key: freshness (daysSince) must DECAY at the 04:00
  // day boundary even when the persisted cache still holds yesterday's result.
  const today = logicalTodayISO()
  return useQuery({
    queryKey: ['muscle_analytics', days, era, today],
    staleTime: 60_000,
    queryFn: async (): Promise<MuscleAnalytics> => {
      const from = new Date(Date.now() - days * 86400000).toISOString()
      const { data, error } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, exercises!inner(muscle_groups), workout_sessions!inner(started_at)')
        .gte('workout_sessions.started_at', from)
      if (error) throw error

      const rows = ((data ?? []) as unknown as Array<{
        weight_kg: number; reps: number
        exercises: { muscle_groups: string[] | null }
        workout_sessions: { started_at: string }
      }>)
        // STRICT ERA BOUNDARY (Phase 17): workouts never mix eras in analytics.
        .filter((r) => era === 'all' || eraForDate(r.workout_sessions.started_at.slice(0, 10)) === era)

      const agg = new Map<string, { sets: number; volume: number; last: string | null }>()
      const weekMap = new Map<string, Record<string, number>>()

      for (const r of rows) {
        const groups = new Set((r.exercises.muscle_groups ?? []).map((m) => MUSCLE_MAP[m.toLowerCase()]).filter(Boolean))
        if (!groups.size) continue
        const date = r.workout_sessions.started_at.slice(0, 10)
        const week = isoWeekStart(r.workout_sessions.started_at)
        const vol = (r.weight_kg || 0) * (r.reps || 0)
        for (const g of groups) {
          const a = agg.get(g) ?? { sets: 0, volume: 0, last: null }
          a.sets += 1; a.volume += vol
          if (!a.last || date > a.last) a.last = date
          agg.set(g, a)
          const w = weekMap.get(week) ?? {}
          w[g] = (w[g] ?? 0) + 1
          weekMap.set(week, w)
        }
      }

      const todayMs = new Date(today + 'T00:00:00Z').getTime()
      const stats: MuscleStat[] = MUSCLE_GROUPS.map((g) => {
        const a = agg.get(g)
        const daysSince = a?.last ? Math.round((todayMs - new Date(a.last + 'T00:00:00Z').getTime()) / 86400000) : null
        return { group: g, sets: a?.sets ?? 0, volume: Math.round(a?.volume ?? 0), daysSince }
      })

      const weekly = [...weekMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, groups]) => ({ week: week.slice(5), ...Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, groups[g] ?? 0])) }))

      return { stats, weekly }
    },
  })
}

function isoWeekStart(iso: string): string {
  const d = new Date(iso)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()) // back to Sunday
  return d.toISOString().slice(0, 10)
}
