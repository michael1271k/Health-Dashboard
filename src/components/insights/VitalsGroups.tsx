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
    title: 'Recovery', icon: HeartPulse, accent: '#8E9AAC',
    blurb: 'Autonomic + overnight signals — the readiness backbone.',
    metrics: [
      { key: 'hrv', label: 'HRV', color: '#8E9AAC', agg: 'avg', better: 'up', pick: (d) => pos(d.hrv_ms), fmt: (v) => `${Math.round(v)} ms` },
      { key: 'rhr', label: 'Resting HR', color: '#C4514E', agg: 'avg', better: 'down', pick: (d) => pos(d.avg_rest_heart_rate), fmt: (v) => `${Math.round(v)} bpm` },
      { key: 'wrist', label: 'Wrist Temp', color: '#B4522A', agg: 'avg', better: 'neutral', pick: (d) => pos(d.wrist_temp_delta), fmt: (v) => `${v.toFixed(1)}°C`, deltaFmt: (v) => `${v.toFixed(2)}°C` },
    ],
  },
  {
    title: 'Respiratory', icon: Wind, accent: '#3D7AB8',
    blurb: 'Overnight breathing — drift here often precedes illness.',
    metrics: [
      { key: 'rr', label: 'Respiratory Rate', color: '#3D7AB8', agg: 'avg', better: 'neutral', pick: (d) => pos(d.respiratory_rate), fmt: (v) => `${v.toFixed(1)} br/min` },
      { key: 'spo2', label: 'Blood O₂', color: '#3D7AB8', agg: 'avg', better: 'up', pick: (d) => pos(d.blood_oxygen), fmt: (v) => `${Math.round(v)}%`, deltaFmt: (v) => `${v.toFixed(1)}%` },
    ],
  },
  {
    title: 'Fitness Engine', icon: Flame, accent: '#E0703C',
    blurb: 'Slow-moving capacity — weekly workload and aerobic ceiling.',
    metrics: [
      { key: 'train', label: 'Training', color: '#8E9AAC', agg: 'sum', better: 'up', pick: (d) => d.exercise_minutes ?? d.training_minutes, fmt: (v) => `${Math.round(v)} min` },
      { key: 'energy', label: 'Active Energy', color: '#D4AF37', agg: 'sum', better: 'up', pick: (d) => d.active_energy, fmt: (v) => `${Math.round(v).toLocaleString()} kcal` },
    ],
  },
  {
    title: 'Rhythm', icon: Sun, accent: '#D4AF37',
    blurb: 'Lifestyle regularity — light, movement, upright time, sleep.',
    metrics: [
      { key: 'daylight', label: 'Daylight', color: '#D4AF37', agg: 'sum', better: 'up', pick: (d) => d.time_in_daylight_min, fmt: (v) => `${(v / 60).toFixed(1)} h` },
      { key: 'stand', label: 'Stand', color: '#3E9E7A', agg: 'avg', better: 'up', pick: (d) => d.stand_hours, fmt: (v) => `${v.toFixed(1)} h/d` },
      { key: 'steps', label: 'Steps', color: '#3D7AB8', agg: 'sum', better: 'up', pick: (d) => d.steps, fmt: (v) => `${(v / 1000).toFixed(1)}k` },
      { key: 'sleep', label: 'Sleep', color: '#B4522A', agg: 'avg', better: 'up', pick: (d) => d.sleep_minutes, fmt: (v) => formatSleep(Math.round(v)) },
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
          /* A BAND, NOT A CARD. `p-5` on a rounded bordered box, four times down
             the page, is 40px of padding and four frames around what is already
             a list. The 2px rule in the group's accent says the same thing in
             two pixels, and the rows below it get the width back. */
          <section key={g.title} className="pl-3" style={{ borderLeft: `2px solid ${g.accent}` }}>
            <div className="flex items-baseline gap-2 mb-1">
              <g.icon className="w-3 h-3 shrink-0 translate-y-px" style={{ color: g.accent }} aria-hidden="true" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: g.accent }}>{g.title}</h3>
              <p className="text-[10px] text-muted leading-tight truncate">{g.blurb}</p>
            </div>
            {allEmpty ? (
              <p className="text-fluid-xs text-muted/70 py-1">No data from Apple Health yet.</p>
            ) : (
              <div>
                {metrics.map(({ def, win }, i) => (
                  <VitalRow key={def.key} def={def} win={win} days={rows} divide={i > 0} />
                ))}
              </div>
            )}
          </section>
        )
      })}
      {isLoading && <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-24 animate-pulse" aria-hidden="true" />}
    </div>
  )
}

function VitalRow({ def, win, days, divide }: {
  def: MetricDef; win: ReturnType<typeof vitalWindow>; days: VitalsDay[]; divide?: boolean
}) {
  const series = vitalWeeklySeries(days, def.pick, def.agg)
  const deltaColor = win.delta == null || win.delta === 0 || def.better === 'neutral'
    ? '#79808C'
    : (win.delta > 0) === (def.better === 'up') ? '#3E9E7A' : '#C4514E'

  // Tiered empty states: 0 days → "Not enough data" (dimmed, no fake value);
  // 1–3 days → show the value but flag it's still collecting; ≥4 → full caption.
  const empty = win.coverage === 0 || win.current == null
  const collecting = !empty && win.coverage < 4

  if (empty) {
    return (
      <div className={`flex items-baseline gap-3 py-2 opacity-60 ${divide ? 'border-t border-white/[0.05]' : ''}`}>
        <span className="min-w-0 flex-1 text-fluid-xs text-text/80 truncate">{def.label}</span>
        <span className="shrink-0 text-[11px] text-muted">Not enough data yet</span>
      </div>
    )
  }

  /**
   * The trace is the row's GROUND, not a 96px sidecar beside it.
   *
   * As a sidecar it competed with the value for horizontal space and got 96px of
   * it — eight weekly points across two thirds of an inch. Behind the row it
   * spans the full width for free, at an opacity low enough that the numbers
   * still read first, which is the Health.app treatment and the reason it works:
   * the shape is context, and context belongs behind the fact.
   */
  return (
    <div className={`relative py-2 ${divide ? 'border-t border-white/[0.05]' : ''}`}>
      <Spark series={series} color={def.color} />
      <div className="relative flex items-baseline gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-fluid-xs text-text/90 truncate">{def.label}</span>
          <span className="block text-[10px] text-muted leading-tight">
            {collecting
              ? `Collecting · ${win.coverage}/7 days`
              : `7-day ${def.agg === 'avg' ? 'avg' : 'total'} · ${win.coverage}/7 days`}
          </span>
        </span>
        {!collecting && win.delta != null && win.delta !== 0 && (
          <span className="shrink-0 text-[10px] font-bold tabular-nums"
            style={{ color: deltaColor }}
            aria-label="Change vs prior week">
            {win.delta > 0 ? '+' : '−'}{(def.deltaFmt ?? def.fmt)(Math.abs(win.delta))}
          </span>
        )}
        <span className="helix-num shrink-0 text-fluid-base font-bold text-text tabular-nums leading-none">
          {def.fmt(win.current!)}
        </span>
      </div>
    </div>
  )
}

/** Absolutely positioned behind the row, stretched to its full width. */
function Spark({ series, color }: { series: Array<number | null>; color: string }) {
  const pts = series.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) return null
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
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <path d={area} fill={color} opacity="0.07" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.32" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2" fill={color} opacity="0.55" />
    </svg>
  )
}
