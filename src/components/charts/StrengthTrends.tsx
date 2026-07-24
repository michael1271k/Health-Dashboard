'use client'

import { useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { usePRHistory } from '@/lib/hooks/useCharts'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'

/**
 * Per-exercise est-1RM strength trends (progressive overload). Groups recent
 * compound-lift sets by exercise and sparklines the estimated 1RM, with the
 * current value, all-time best, and Δ since the first point in range.
 */
export function StrengthTrends({ days = 120, era = 'all' }: { days?: number; era?: 'all' | 'ppl' | 'axis' }) {
  const { data, isLoading } = usePRHistory(undefined, days, era)
  const unit = useUnitSystem()

  const series = useMemo(() => {
    const byEx = new Map<string, { name: string; pts: { i: number; v: number }[] }>()
    for (const r of data ?? []) {
      const e = byEx.get(r.exercise_id) ?? { name: r.exercise_name, pts: [] }
      e.pts.push({ i: e.pts.length, v: Math.round(r.est_1rm_kg) })
      byEx.set(r.exercise_id, e)
    }
    return [...byEx.values()]
      .filter((e) => e.pts.length >= 2)
      .map((e) => {
        const current = e.pts[e.pts.length - 1].v
        return { name: e.name, pts: e.pts, current, delta: current - e.pts[0].v, best: Math.max(...e.pts.map((p) => p.v)) }
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6)
  }, [data])

  if (isLoading) return <div className="helix-card h-40 animate-pulse" />
  if (!series.length) return null

  return (
    <div className="helix-card space-y-3">
      <h2 className="font-heading font-semibold text-fluid-base text-text flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" /> Strength Trends
        <span className="text-fluid-xs text-muted font-normal">est. 1RM</span>
      </h2>
      <div className="space-y-2.5">
        {series.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-fluid-sm font-medium text-text truncate">{s.name}</div>
              <div className="text-fluid-xs text-muted">best <span className="helix-num">{displayWeight(s.best)}</span>{unit}</div>
            </div>
            <div className="w-20 h-8 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s.pts} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                  <Line dataKey="v" stroke={s.delta >= 0 ? '#4FB477' : '#D5514E'} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-right w-14 shrink-0">
              <div className="helix-num text-fluid-base font-bold text-text leading-none">{displayWeight(s.current)}<span className="text-[10px] text-muted">{unit}</span></div>
              {s.delta !== 0 && <div className={`helix-num text-[10px] ${s.delta > 0 ? 'text-success' : 'text-danger'}`}>{s.delta > 0 ? '▲' : '▼'}{displayWeight(Math.abs(s.delta))}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
