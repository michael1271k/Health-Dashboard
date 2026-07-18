'use client'

import { useQuery } from '@tanstack/react-query'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'
import { Gauge, Scale, Moon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

function daysAgoISO(n: number): string {
  return new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA')
}

interface Series { label: string; icon: LucideIcon; color: string; unit?: string; points: number[] }

function useTrendSeries() {
  return useQuery({
    queryKey: ['trends', 'strip'],
    queryFn: async (): Promise<Series[]> => {
      const fromDate = daysAgoISO(30)
      const fromTs = `${fromDate}T00:00:00Z`
      const [scoresRes, bodyRes, sleepRes] = await Promise.all([
        supabase.from('daily_scores').select('date, score').gte('date', fromDate).order('date', { ascending: true }),
        supabase.from('body_composition').select('date, weight_kg').gte('date', fromDate).order('date', { ascending: true }),
        supabase.from('sleep_sessions').select('start_time, duration_min').gte('start_time', fromTs).order('start_time', { ascending: true }),
      ])
      const scores = (scoresRes.data ?? []) as Array<{ score: number | null }>
      const body = (bodyRes.data ?? []) as Array<{ weight_kg: number | null }>
      const sleep = (sleepRes.data ?? []) as Array<{ duration_min: number | null }>
      return [
        { label: 'Score', icon: Gauge, color: '#34D399', points: scores.map((r) => r.score ?? 0).filter(Number.isFinite) },
        { label: 'Weight', icon: Scale, color: '#34D399', unit: 'kg', points: body.map((r) => r.weight_kg ?? 0).filter((n) => n > 0) },
        { label: 'Sleep', icon: Moon, color: '#38BDF8', unit: 'h', points: sleep.map((r) => Math.round(((r.duration_min ?? 0) / 60) * 10) / 10).filter((n) => n > 0) },
      ]
    },
    staleTime: 5 * 60_000,
  })
}

function Spark({ s }: { s: Series }) {
  const Icon = s.icon
  const data = s.points.map((v, i) => ({ i, v }))
  const latest = s.points.length ? s.points[s.points.length - 1] : null
  const first = s.points.length ? s.points[0] : null
  const delta = latest != null && first != null ? latest - first : null
  const gid = `spark-${s.label}`

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-fluid-xs text-muted">
          <Icon className="w-3.5 h-3.5" style={{ color: s.color }} aria-hidden="true" /> {s.label}
        </span>
        <span className="helix-num text-fluid-sm font-semibold text-text">
          {latest != null ? `${latest}${s.unit ?? ''}` : '—'}
          {delta != null && delta !== 0 && (
            <span className={`ml-1 text-fluid-xs ${delta > 0 ? 'text-success' : 'text-danger'}`}>
              {delta > 0 ? '▲' : '▼'}{Math.abs(Math.round(delta * 10) / 10)}
            </span>
          )}
        </span>
      </div>
      <div className="h-9">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area dataKey="v" stroke={s.color} strokeWidth={2} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center text-fluid-xs text-muted/60">Not enough data yet</div>
        )}
      </div>
    </div>
  )
}

/** Desktop command-center sidecar: 30-day sparklines for score, weight, sleep. */
export function TrendStrip() {
  const { data, isLoading } = useTrendSeries()
  return (
    <div className="helix-card gap-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-heading font-semibold text-fluid-base">30-Day Trends</h2>
        <span className="text-fluid-xs text-muted uppercase tracking-wider">score · weight · sleep</span>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 bg-surface-2 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {(data ?? []).map((s) => <Spark key={s.label} s={s} />)}
        </div>
      )}
    </div>
  )
}
