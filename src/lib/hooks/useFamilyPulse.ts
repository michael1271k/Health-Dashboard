'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { logicalDaysAgoISO, logicalTodayISO } from '@/lib/utils/day'

export interface FamilyMember {
  userId: string
  displayName: string
  role: 'admin' | 'member'
  isSelf: boolean
  score: number | null
  batteryPct: number | null
  weightSpark: number[]          // ascending 14d weights (kg)
  lastSession: { split: string; date: string; volumeKg: number | null } | null
  trioStreak: number             // consecutive days (ending today) with sleep+water+food
}

/**
 * Household overview for the admin. RLS does the access control: members can
 * only ever read their own rows, so this hook naturally returns a one-member
 * "family" for them and the full household for the admin — no client-side
 * role juggling, no service keys in the browser.
 */
export function useFamilyPulse() {
  return useQuery({
    queryKey: ['family_pulse'],
    staleTime: 60_000,
    queryFn: async (): Promise<{ isAdmin: boolean; members: FamilyMember[] }> => {
      const { data: { user } } = await supabase.auth.getUser()
      const myId = user?.id ?? null

      const { data: profilesRaw, error } = await supabase
        .from('profiles').select('user_id, display_name, role').order('created_at', { ascending: true })
      if (error) throw new Error(`profiles unavailable — run the household paste-SQL (${error.message})`)
      const profiles = (profilesRaw ?? []) as Array<{ user_id: string; display_name: string | null; role: 'admin' | 'member' }>
      const isAdmin = profiles.some((p) => p.user_id === myId && p.role === 'admin')

      const from = logicalDaysAgoISO(14)
      const to = logicalTodayISO()
      const [scoresRes, logsRes, nutritionRes, sessionsRes] = await Promise.all([
        supabase.from('daily_scores').select('user_id, date, score, battery_pct').gte('date', from).lte('date', to),
        supabase.from('daily_logs').select('user_id, date, weight_kg, sleep_minutes, water_ml').gte('date', from).lte('date', to),
        supabase.from('nutrition_entries').select('user_id, date').eq('meal_type', 'daily').gte('date', from).lte('date', to),
        supabase.from('workout_sessions').select('user_id, started_at, split_day, total_volume_kg')
          .gte('started_at', `${from}T00:00:00Z`).order('started_at', { ascending: false }),
      ])

      type ScoreRow = { user_id: string; date: string; score: number | null; battery_pct: number | null }
      type LogRow = { user_id: string; date: string; weight_kg: number | null; sleep_minutes: number | null; water_ml: number | null }
      const scores = (scoresRes.data ?? []) as ScoreRow[]
      const logs = (logsRes.data ?? []) as LogRow[]
      const nutritionDays = new Set(((nutritionRes.data ?? []) as Array<{ user_id: string; date: string }>).map((r) => `${r.user_id}|${r.date}`))
      const sessions = (sessionsRes.data ?? []) as Array<{ user_id: string; started_at: string; split_day: string; total_volume_kg: number | null }>

      const members: FamilyMember[] = profiles.map((p) => {
        const myScores = scores.filter((s) => s.user_id === p.user_id)
        const todayScore = myScores.find((s) => s.date === to) ?? null
        const myLogs = logs.filter((l) => l.user_id === p.user_id).sort((a, b) => a.date.localeCompare(b.date))
        const weightSpark = myLogs.map((l) => l.weight_kg).filter((w): w is number => w != null && w >= 50)
        const last = sessions.find((s) => s.user_id === p.user_id) ?? null

        // Core-trio streak: consecutive complete days ending today.
        let trioStreak = 0
        for (let i = 0; ; i++) {
          const d = logicalDaysAgoISO(i)
          if (d < from) break
          const log = myLogs.find((l) => l.date === d)
          const complete = (log?.sleep_minutes ?? 0) > 0 && (log?.water_ml ?? 0) > 0 && nutritionDays.has(`${p.user_id}|${d}`)
          if (!complete) break
          trioStreak++
        }

        return {
          userId: p.user_id,
          displayName: p.display_name ?? 'Member',
          role: p.role,
          isSelf: p.user_id === myId,
          score: todayScore?.score ?? null,
          batteryPct: todayScore?.battery_pct ?? null,
          weightSpark,
          lastSession: last ? { split: last.split_day, date: last.started_at.slice(0, 10), volumeKg: last.total_volume_kg } : null,
          trioStreak,
        }
      })

      return { isAdmin, members }
    },
  })
}
