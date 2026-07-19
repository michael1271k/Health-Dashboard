'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import { Dumbbell, TrendingUp, Layers, Activity, Repeat } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { useExerciseHistory } from '@/lib/hooks/useExerciseHistory'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { shortDate } from '@/lib/utils/day'

const ICE = '#22D3EE'

/**
 * Hevy-style per-exercise deep-dive as a chart-first bottom sheet: an est-1RM
 * trend up top, a records grid, then recent sessions. Reuses the shared
 * (portaled) Sheet so it's viewport-centred and swipe-to-dismiss on mobile.
 */
export function ExerciseHistorySheet({ exerciseId, exerciseName, open, onClose }: {
  exerciseId: string | null
  exerciseName: string
  open: boolean
  onClose: () => void
}) {
  const { data, isPending } = useExerciseHistory(open ? exerciseId : null)
  const unit = weightUnit()

  const chartData = (data?.timeline ?? [])
    .filter((p) => p.best_1rm != null)
    .map((p) => ({ date: shortDate(p.day), e1rm: displayWeight(p.best_1rm!) }))

  const recent = [...(data?.timeline ?? [])].reverse().slice(0, 8)
  const r = data?.records

  return (
    <Sheet open={open} onClose={onClose} title={exerciseName}>
      {isPending ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface-2/60" aria-hidden="true" />
      ) : (
        <div className="space-y-4">
          {/* est-1RM trend */}
          {chartData.length >= 2 ? (
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" style={{ color: ICE }} /> Estimated 1RM · {unit}
              </p>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="e1rmFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ICE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={ICE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#8B97B2', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} tickMargin={6} />
                  <YAxis tick={{ fill: '#8B97B2', fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="e1rm" name="est 1RM" unit={unit} stroke={ICE} strokeWidth={2} fill="url(#e1rmFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-fluid-sm text-muted text-center py-4">Not enough history yet — log this lift a few more times.</p>
          )}

          {/* Records grid */}
          <div className="grid grid-cols-2 gap-2">
            <Record icon={Dumbbell} label="Heaviest" value={r?.heaviest_weight != null ? `${displayWeight(r.heaviest_weight)}` : '—'} unit={unit} />
            <Record icon={TrendingUp} label="Best est-1RM" value={r?.best_1rm != null ? `${displayWeight(r.best_1rm)}` : '—'} unit={unit} highlight />
            <Record icon={Layers} label="Best set vol" value={r?.best_set_volume != null ? `${Math.round(displayWeight(r.best_set_volume) ?? 0).toLocaleString()}` : '—'} unit={unit} />
            <Record icon={Activity} label="Best session vol" value={r?.best_session_volume != null ? `${Math.round(displayWeight(r.best_session_volume) ?? 0).toLocaleString()}` : '—'} unit={unit} />
          </div>
          <Record icon={Repeat} label="Total reps (all time)" value={(r?.total_reps ?? 0).toLocaleString()} wide />

          {/* Recent sessions */}
          {recent.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Recent sessions</p>
              {recent.map((p) => (
                <div key={p.day} className="flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2 text-fluid-xs">
                  <span className="text-muted w-16 shrink-0">{shortDate(p.day)}</span>
                  <span className="flex-1 helix-num text-text tabular-nums">{p.top_weight != null ? `${displayWeight(p.top_weight)}${unit}` : '—'}</span>
                  <span className="helix-num text-muted tabular-nums">{p.session_volume != null ? `${Math.round(displayWeight(p.session_volume) ?? 0).toLocaleString()}${unit}` : '—'}</span>
                  <span className="helix-num text-muted tabular-nums shrink-0">{p.reps ?? 0} reps</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

function Record({ icon: Icon, label, value, unit, highlight, wide }: {
  icon: typeof Dumbbell; label: string; value: string; unit?: string; highlight?: boolean; wide?: boolean
}) {
  const color = highlight ? '#F5C15A' : ICE
  return (
    <div className={`rounded-xl px-3 py-2.5 ${wide ? '' : ''}`}
      style={{ background: `${color}${highlight ? '14' : '0d'}`, border: `1px solid ${color}${highlight ? '55' : '2e'}` }}>
      <span className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color }}>
        <Icon className="w-3 h-3" aria-hidden="true" /> {label}
      </span>
      <div className="helix-num font-bold text-fluid-lg text-text tabular-nums mt-0.5">
        {value}{unit && value !== '—' && <span className="text-[10px] text-muted font-normal ml-1">{unit}</span>}
      </div>
    </div>
  )
}
