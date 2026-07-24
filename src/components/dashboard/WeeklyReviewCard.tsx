'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { TrendingUp, Moon, Dumbbell, Droplets } from 'lucide-react'
import { logicalTodayISO } from '@/lib/utils/day'

/** Most recent Sunday (this logical week's start), so the review resets weekly. */
function startOfWeekISO(): string {
  const d = new Date(logicalTodayISO() + 'T00:00:00')
  d.setDate(d.getDate() - d.getDay()) // getDay(): 0 = Sunday
  return d.toLocaleDateString('en-CA')
}

function todayISO(): string {
  return logicalTodayISO()
}

interface WeekStats {
  avgScore: number | null
  avgSleepH: number | null
  sessionsLogged: number
  avgWaterMl: number | null
  newPRsCount: number
}

function useWeekStats() {
  return useQuery<WeekStats>({
    queryKey: ['weekly_review'],
    queryFn: async () => {
      const since = startOfWeekISO()
      const until = todayISO()

      const [scores, sleep, sessions, water, prs] = await Promise.all([
        supabase
          .from('daily_scores')
          .select('score')
          .gte('date', since)
          .lte('date', until),
        supabase
          .from('sleep_sessions')
          .select('duration_min')
          .gte('start_time', `${since}T00:00:00Z`)
          .lte('start_time', `${until}T23:59:59Z`),
        supabase
          .from('workout_sessions')
          .select('id')
          .gte('started_at', `${since}T00:00:00Z`)
          .lte('started_at', `${until}T23:59:59Z`),
        supabase
          .from('water_intake')
          .select('amount_ml, date')
          .gte('date', since)
          .lte('date', until),
        supabase
          .from('workout_sets')
          .select('id')
          .eq('is_pr', true)
          .gte('created_at', `${since}T00:00:00Z`)
          .lte('created_at', `${until}T23:59:59Z`),
      ])

      const scoreRows = ((scores.data ?? []) as Array<{ score: number | null }>)
        .filter((r) => typeof r.score === 'number' && Number.isFinite(r.score)) as Array<{ score: number }>
      const avgScore = scoreRows.length
        ? Math.round(scoreRows.reduce((s, r) => s + r.score, 0) / scoreRows.length)
        : null

      const sleepRows = (sleep.data ?? []) as Array<{ duration_min: number }>
      const avgSleepH = sleepRows.length
        ? Math.round((sleepRows.reduce((s, r) => s + r.duration_min / 60, 0) / sleepRows.length) * 10) / 10
        : null

      // Water: sum per day, then average across days
      const waterRows = (water.data ?? []) as Array<{ amount_ml: number; date: string }>
      const waterByDay = new Map<string, number>()
      for (const r of waterRows) {
        waterByDay.set(r.date, (waterByDay.get(r.date) ?? 0) + r.amount_ml)
      }
      const waterVals = [...waterByDay.values()]
      const avgWaterMl = waterVals.length
        ? Math.round(waterVals.reduce((s, v) => s + v, 0) / waterVals.length)
        : null

      return {
        avgScore,
        avgSleepH,
        sessionsLogged: (sessions.data ?? []).length,
        avgWaterMl,
        newPRsCount: (prs.data ?? []).length,
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}

interface StatRowProps {
  icon: typeof TrendingUp
  iconColor: string
  label: string
  value: string
}

function StatRow({ icon: Icon, iconColor, label, value }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconColor}`} aria-hidden="true" />
        <span className="text-sm text-muted">{label}</span>
      </div>
      <span className="helix-num text-sm font-semibold text-text">{value}</span>
    </div>
  )
}

export function WeeklyReviewCard() {
  const { data, isLoading } = useWeekStats()

  if (isLoading) {
    return (
      <div className="helix-card h-48 animate-pulse">
        <div className="h-5 w-32 bg-surface-2 rounded mb-4" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-full bg-surface-2 rounded mb-2" />
        ))}
      </div>
    )
  }

  return (
    <div className="helix-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-semibold text-base text-text">Weekly Review</h3>
        <span className="text-xs text-muted">This week</span>
      </div>
      <div>
        <StatRow
          icon={TrendingUp}
          iconColor="text-primary"
          label="Avg Daily Score"
          value={data?.avgScore != null ? `${data.avgScore}` : '—'}
        />
        <StatRow
          icon={Moon}
          iconColor="text-[#E2683A]"
          label="Avg Sleep"
          value={data?.avgSleepH != null ? `${data.avgSleepH}h` : '—'}
        />
        <StatRow
          icon={Dumbbell}
          iconColor="text-[#8AA0B8]"
          label="Sessions"
          value={`${data?.sessionsLogged ?? 0}`}
        />
        <StatRow
          icon={Droplets}
          iconColor="text-[#8AA0B8]"
          label="Avg Water"
          value={data?.avgWaterMl != null ? `${Math.round(data.avgWaterMl / 100) / 10}L` : '—'}
        />
      </div>
      {(data?.newPRsCount ?? 0) > 0 && (
        <div className="mt-3 pt-3 border-t border-border text-center">
          <span className="text-xs font-semibold text-[#C9A227]">
            {data!.newPRsCount} new PR{data!.newPRsCount !== 1 ? 's' : ''} this week
          </span>
        </div>
      )}
    </div>
  )
}
