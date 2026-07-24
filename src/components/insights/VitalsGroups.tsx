'use client'

import { HeartPulse, Wind, Flame, Sun, type LucideIcon } from 'lucide-react'
import { useVitalsDays, vitalWindow, vitalWeeklySeries, type VitalsDay, type VitalAgg, type VitalPick } from '@/lib/hooks/useVitals'
import { formatSleep } from '@/lib/utils/format'

type Better = 'up' | 'down' | 'neutral'

interface MetricDef {
  key: string
  label: string
  color: string
  agg: VitalAgg
  better: Better
  pick: VitalPick
  fmt: (v: number) => string
  deltaFmt?: (v: number) => string
}
interface Group { title: string; icon: LucideIcon; accent: string; blurb: string; metrics: MetricDef[] }

/** Zero is not a reading for these signals — treat 0 as "no data". */
const pos = (v: number | null | undefined): number | null => (v != null && v > 0 ? v : null)

const GROUPS: Group[] = [
  {
    title: 'Recovery', icon: HeartPulse, accent: '#9AA6B8',
    blurb: 'Autonomic + overnight signals — the readiness backbone.',
    metrics: [
      { key: 'hrv', label: 'HRV', color: '#9AA6B8', agg: 'avg', better: 'up', pick: (d) => pos(d.hrv_ms), fmt: (v) => `${Math.round(v)} ms` },
      { key: 'rhr', label: 'Resting HR', color: '#D5514E', agg: 'avg', better: 'down', pick: (d) => pos(d.avg_rest_heart_rate), fmt: (v) => `${Math.round(v)} bpm` },
      { key: 'hrr', label: 'HR Recovery', color: '#4FB477', agg: 'avg', better: 'up', pick: (d) => pos(d.heart_rate_recovery), fmt: (v) => `${Math.round(v)} bpm` },
      { key: 'wrist', label: 'Wrist Temp', color: '#B84F28', agg: 'avg', better: 'neutral', pick: (d) => pos(d.wrist_temp_delta), fmt: (v) => `${v.toFixed(1)}°C`, deltaFmt: (v) => `${v.toFixed(2)}°C` },
    ],
  },
  {
    title: 'Respiratory', icon: Wind, accent: '#8AA0B8',
    blurb: 'Overnight breathing — drift here often precedes illness.',
    metrics: [
      { key: 'rr', label: 'Respiratory Rate', color: '#8AA0B8', agg: 'avg', better: 'neutral', pick: (d) => pos(d.respiratory_rate), fmt: (v) => `${v.toFixed(1)} br/min` },
      { key: 'spo2', label: 'Blood O₂', color: '#8AA0B8', agg: 'avg', better: 'up', pick: (d) => pos(d.blood_oxygen), fmt: (v) => `${Math.round(v)}%`, deltaFmt: (v) => `${v.toFixed(1)}%` },
    ],
  },
  {
    title: 'Fitness Engine', icon: Flame, accent: '#E2683A',
    blurb: 'Slow-moving capacity — weekly workload and aerobic ceiling.',
    metrics: [
      { key: 'vo2', label: 'VO₂max', color: '#E2683A', agg: 'avg', better: 'up', pick: (d) => pos(d.vo2max), fmt: (v) => v.toFixed(1), deltaFmt: (v) => v.toFixed(2) },
      { key: 'train', label: 'Training', color: '#9AA6B8', agg: 'sum', better: 'up', pick: (d) => d.exercise_minutes ?? d.training_minutes, fmt: (v) => `${Math.round(v)} min` },
      { key: 'energy', label: 'Active Energy', color: '#C9A227', agg: 'sum', better: 'up', pick: (d) => d.active_energy, fmt: (v) => `${Math.round(v).toLocaleString()} kcal` },
    ],
  },
  {
    title: 'Rhythm', icon: Sun, accent: '#C9A227',
    blurb: 'Lifestyle regularity — light, movement, upright time, sleep.',
    metrics: [
      { key: 'daylight', label: 'Daylight', color: '#C9A227', agg: 'sum', better: 'up', pick: (d) => d.time_in_daylight_min, fmt: (v) => `${(v / 60).toFixed(1)} h` },
      { key: 'stand', label: 'Stand', color: '#4FB477', agg: 'avg', better: 'up', pick: (d) => d.stand_hours, fmt: (v) => `${v.toFixed(1)} h/d` },
      { key: 'steps', label: 'Steps', color: '#8AA0B8', agg: 'sum', better: 'up', pick: (d) => d.steps, fmt: (v) => `${(v / 1000).toFixed(1)}k` },
      { key: 'sleep', label: 'Sleep', color: '#B84F28', agg: 'avg', better: 'up', pick: (d) => d.sleep_minutes, fmt: (v) => formatSleep(Math.round(v)) },
    ],
  },
]

/** The four weekly-vitals groups (this-week vs last, 8-week trend) — shared by /insights. */
export function VitalsGroups() {
  const { data: days, isLoading } = useVitalsDays(56)
  const rows = days ?? []
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        // Precompute each metric's window; a group whose EVERY tile has zero
        // coverage collapses to one quiet "no data" row rather than a wall of "—".
        const metrics = g.metrics.map((m) => ({ def: m, win: vitalWindow(rows, m.pick, m.agg) }))
        const allEmpty = metrics.every(({ win }) => win.coverage === 0)
        return (
          <section key={g.title} className="helix-card space-y-2.5" style={{ borderColor: `${g.accent}22` }}>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${g.accent}1a`, color: g.accent }}>
                <g.icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="font-heading font-semibold text-fluid-base text-text leading-tight">{g.title}</h3>
                <p className="text-[11px] text-muted leading-tight">{g.blurb}</p>
              </div>
            </div>
            {allEmpty ? (
              <p className="text-fluid-xs text-muted/70 py-1">No data from Apple Health yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {metrics.map(({ def, win }) => <VitalRow key={def.key} def={def} win={win} days={rows} />)}
              </div>
            )}
          </section>
        )
      })}
      {isLoading && <div className="helix-card h-24 animate-pulse" aria-hidden="true" />}
    </div>
  )
}

function VitalRow({ def, win, days }: { def: MetricDef; win: ReturnType<typeof vitalWindow>; days: VitalsDay[] }) {
  const series = vitalWeeklySeries(days, def.pick, def.agg)
  const deltaColor = win.delta == null || win.delta === 0 || def.better === 'neutral'
    ? '#79808C'
    : (win.delta > 0) === (def.better === 'up') ? '#4FB477' : '#D5514E'

  // Tiered empty states: 0 days → "Not enough data" (dimmed, no fake value);
  // 1–3 days → show the value but flag it's still collecting; ≥4 → full caption.
  const empty = win.coverage === 0 || win.current == null
  const collecting = !empty && win.coverage < 4

  if (empty) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.015] border border-white/[0.04] px-3 py-2.5 opacity-60">
        <div className="flex-1 min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: def.color }}>{def.label}</span>
          <span className="block text-fluid-sm font-medium text-muted leading-tight">Not enough data</span>
          <span className="text-[10px] text-muted/70">Needs a few days of readings</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/[0.05] px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: def.color }}>{def.label}</span>
        <span className="helix-num block text-fluid-lg font-bold text-text leading-tight tabular-nums">
          {def.fmt(win.current!)}
        </span>
        <span className="text-[10px] text-muted">
          {collecting
            ? `Collecting · ${win.coverage}/7 days`
            : `7-day ${def.agg === 'avg' ? 'avg' : 'total'} · ${win.coverage}/7 days`}
        </span>
      </div>
      {!collecting && win.delta != null && win.delta !== 0 && (
        <span className="shrink-0 text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md"
          style={{ color: deltaColor, background: `${deltaColor}14`, border: `1px solid ${deltaColor}33` }}
          aria-label="Change vs prior week">
          {win.delta > 0 ? '+' : '−'}{(def.deltaFmt ?? def.fmt)(Math.abs(win.delta))}
        </span>
      )}
      <Spark series={series} color={def.color} />
    </div>
  )
}

function Spark({ series, color }: { series: Array<number | null>; color: string }) {
  const pts = series.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) return <div className="w-24 h-9 shrink-0" aria-hidden="true" />
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = max - min || 1
  const W = 96; const H = 36; const PAD = 3
  const denom = Math.max(1, series.length - 1)
  const x = (i: number) => (i / denom) * (W - PAD * 2) + PAD
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const line = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts[pts.length - 1].i).toFixed(1)},${H - PAD} L${x(pts[0].i).toFixed(1)},${H - PAD} Z`
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-24 h-9 shrink-0" aria-hidden="true">
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2" fill={color} />
    </svg>
  )
}
