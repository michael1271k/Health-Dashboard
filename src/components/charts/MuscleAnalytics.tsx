'use client'

import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { useMuscleAnalytics, MUSCLE_GROUPS, GROUP_COLOR } from '@/lib/hooks/useMuscleAnalytics'
import { ChartTooltip } from './ChartTooltip'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'

/** Hevy-killer muscle analytics — balance radar, sets/muscle/week, volume heatmap, freshness. */
export function MuscleAnalyticsSection({ days }: { days: number }) {
  const { data, isLoading } = useMuscleAnalytics(days)
  const unit = useUnitSystem()
  if (isLoading) return <div className="helix-card h-64 animate-pulse" />
  if (!data || data.stats.every((s) => s.sets === 0)) {
    return <div className="helix-card p-8 text-center text-muted-vital text-fluid-sm">No workout sets in this range yet.</div>
  }

  const radarData = data.stats.map((s) => ({ group: s.group, sets: s.sets }))
  const maxVol = Math.max(...data.stats.map((s) => s.volume), 1)

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Balance radar */}
        <div className="helix-card">
          <h3 className="font-heading font-semibold text-base">Muscle Balance</h3>
          <p className="text-fluid-xs text-muted-vital mb-2">Working sets per group · {days}d</p>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="group" tick={{ fill: '#8B97B2', fontSize: 11 }} />
              <Radar dataKey="sets" stroke="#19E3B1" fill="#19E3B1" fillOpacity={0.35} isAnimationActive={false} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Sets per muscle per week */}
        <div className="helix-card">
          <h3 className="font-heading font-semibold text-base">Sets / Muscle / Week</h3>
          <p className="text-fluid-xs text-muted-vital mb-2">Hypertrophy volume distribution</p>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={data.weekly} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="week" tick={{ fill: '#8B97B2', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8B97B2', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              {MUSCLE_GROUPS.map((g) => <Bar key={g} dataKey={g} stackId="s" fill={GROUP_COLOR[g]} maxBarSize={44} />)}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {MUSCLE_GROUPS.map((g) => (
              <span key={g} className="flex items-center gap-1 text-[10px] text-muted-vital">
                <span className="w-2 h-2 rounded-full" style={{ background: GROUP_COLOR[g] }} />{g}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Volume by body part */}
        <div className="helix-card">
          <h3 className="font-heading font-semibold text-base mb-3">Volume by Body Part</h3>
          <div className="space-y-2.5">
            {[...data.stats].sort((a, b) => b.volume - a.volume).map((s) => (
              <div key={s.group}>
                <div className="flex justify-between text-fluid-xs mb-0.5">
                  <span className="text-text">{s.group}</span>
                  <span className="helix-num text-muted-vital">{((displayWeight(s.volume) ?? 0) / 1000).toFixed(1)}{unit === 'lb' ? 'k' : 't'}</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(s.volume / maxVol) * 100}%`, background: GROUP_COLOR[s.group] }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Freshness */}
        <div className="helix-card">
          <h3 className="font-heading font-semibold text-base mb-3">Muscle Freshness</h3>
          <div className="space-y-2">
            {[...data.stats].sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1)).map((s) => {
              const c = s.daysSince == null ? '#5A6B85' : s.daysSince >= 4 ? '#43F59B' : s.daysSince >= 2 ? '#FFB020' : '#FF5470'
              return (
                <div key={s.group} className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c, boxShadow: `0 0 8px ${c}88` }} />
                  <span className="flex-1 text-fluid-sm text-text">{s.group}</span>
                  <span className="helix-num text-fluid-xs text-muted-vital">
                    {s.daysSince == null ? 'never' : s.daysSince === 0 ? 'today' : `${s.daysSince}d ago`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
