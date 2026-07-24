'use client'

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts'
import { useMuscleAnalytics, GROUP_COLOR } from '@/lib/hooks/useMuscleAnalytics'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { EMERALD, GOLD, OXIDE, DIM } from '@/lib/theme/palette'

/**
 * Muscle analytics — balance radar, volume by body part, freshness.
 *
 * The stacked "Sets / Muscle / Week" bar chart that used to sit here is gone: it
 * plotted the exact series `VolumeStream` already renders as an area chart one
 * card above, so the page drew the same data twice — once badly.
 */
export function MuscleAnalyticsSection({ days, era = 'all' }: { days: number; era?: 'all' | 'ppl' | 'axis' }) {
  const { data, isLoading } = useMuscleAnalytics(days, era)
  const unit = useUnitSystem()
  if (isLoading) return <div className="helix-card h-64 animate-pulse" />
  if (!data || data.stats.every((s) => s.sets === 0)) {
    return <div className="helix-card p-8 text-center text-muted text-fluid-sm">No workout sets in this range yet.</div>
  }

  const radarData = data.stats.map((s) => ({ group: s.group, sets: s.sets }))
  const maxVol = Math.max(...data.stats.map((s) => s.volume), 1)

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Balance radar */}
        <div className="helix-card">
          <h3 className="font-heading font-semibold text-base">Muscle Balance</h3>
          <p className="text-fluid-xs text-muted mb-2">Working sets per group · {days}d</p>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="group" tick={{ fill: DIM, fontSize: 11 }} />
              <Radar dataKey="sets" stroke={EMERALD} fill={EMERALD} fillOpacity={0.35} isAnimationActive={false} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Volume by body part */}
        <div className="helix-card">
          <h3 className="font-heading font-semibold text-base mb-3">Volume by Body Part</h3>
          <div className="space-y-2.5">
            {[...data.stats].sort((a, b) => b.volume - a.volume).map((s) => (
              <div key={s.group}>
                <div className="flex justify-between text-fluid-xs mb-0.5">
                  <span className="text-text">{s.group}</span>
                  <span className="helix-num text-muted">{((displayWeight(s.volume) ?? 0) / 1000).toFixed(1)}{unit === 'lb' ? 'k' : 't'}</span>
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
              const c = s.daysSince == null ? DIM : s.daysSince >= 4 ? EMERALD : s.daysSince >= 2 ? GOLD : OXIDE
              return (
                <div key={s.group} className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c, boxShadow: `0 0 8px ${c}88` }} />
                  <span className="flex-1 text-fluid-sm text-text">{s.group}</span>
                  <span className="helix-num text-fluid-xs text-muted">
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
