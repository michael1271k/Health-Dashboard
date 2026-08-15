'use client'

import { useState } from 'react'
import { HeartPulse, Wind, Flame, Sun, type LucideIcon } from 'lucide-react'
import { useVitalsDays, vitalWindow, vitalWeeklySeries, type VitalsDay, type VitalAgg, type VitalPick } from '@/lib/hooks/useVitals'
import { formatSleep } from '@/lib/utils/format'
import { Sheet } from '@/components/ui/Sheet'
import { Tile } from '@/components/ui/Zone'
import { MUTED, EMERALD, OXIDE } from '@/lib/theme/palette'

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
  /**
   * The today strip draws value and unit as two elements at two sizes, so it
   * needs the bare number — `fmt` bakes the unit in and the two cannot be
   * separated by string surgery ("97%" has no space to split on).
   */
  short?: (v: number) => string
  unit?: string
}
interface Group { title: string; icon: LucideIcon; accent: string; blurb: string; metrics: MetricDef[] }

/** Zero is not a reading for these signals — treat 0 as "no data". */
const pos = (v: number | null | undefined): number | null => (v != null && v > 0 ? v : null)

const M: Record<'hrv' | 'rhr' | 'spo2' | 'rr', MetricDef> = {
  hrv: { key: 'hrv', label: 'HRV', color: '#8E9AAC', agg: 'avg', better: 'up', pick: (d) => pos(d.hrv_ms), fmt: (v) => `${Math.round(v)} ms`, short: (v) => `${Math.round(v)}`, unit: 'ms' },
  rhr: { key: 'rhr', label: 'Resting HR', color: '#C4514E', agg: 'avg', better: 'down', pick: (d) => pos(d.avg_rest_heart_rate), fmt: (v) => `${Math.round(v)} bpm`, short: (v) => `${Math.round(v)}`, unit: 'bpm' },
  spo2: { key: 'spo2', label: 'Blood O₂', color: '#3D7AB8', agg: 'avg', better: 'up', pick: (d) => pos(d.blood_oxygen), fmt: (v) => `${Math.round(v)}%`, deltaFmt: (v) => `${v.toFixed(1)}%`, short: (v) => `${Math.round(v)}`, unit: '%' },
  rr: { key: 'rr', label: 'Respiratory Rate', color: '#3D7AB8', agg: 'avg', better: 'neutral', pick: (d) => pos(d.respiratory_rate), fmt: (v) => `${v.toFixed(1)} br/min`, short: (v) => v.toFixed(1), unit: 'br/min' },
}

/**
 * The four signals the page answers with FIRST.
 *
 * Health.app's pattern, and the reason it works: the headline reading is above
 * the fold with no chart attached, and the shape of it is one scroll below. A
 * page that opens on four grouped lists makes the reader assemble the summary
 * themselves out of rows that all look equally important.
 */
const TODAY: MetricDef[] = [M.hrv, M.rhr, M.spo2, M.rr]

const GROUPS: Group[] = [
  {
    title: 'Recovery', icon: HeartPulse, accent: '#8E9AAC',
    blurb: 'Autonomic + overnight signals — the readiness backbone.',
    metrics: [
      M.hrv,
      M.rhr,
      { key: 'wrist', label: 'Wrist Temp', color: '#B4522A', agg: 'avg', better: 'neutral', pick: (d) => pos(d.wrist_temp_delta), fmt: (v) => `${v.toFixed(1)}°C`, deltaFmt: (v) => `${v.toFixed(2)}°C` },
    ],
  },
  {
    title: 'Respiratory', icon: Wind, accent: '#3D7AB8',
    blurb: 'Overnight breathing — drift here often precedes illness.',
    metrics: [M.rr, M.spo2],
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

/** The newest day that actually carries a reading for this metric. */
export function latestReading(days: VitalsDay[], pick: VitalPick): { value: number; date: string } | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const v = pick(days[i])
    if (v != null) return { value: v, date: days[i].date }
  }
  return null
}

/** min / max / mean over the weekly series — the numbers the Sheet adds. */
export function seriesStats(series: Array<number | null>): { min: number; max: number; mean: number; n: number } | null {
  const xs = series.filter((v): v is number => v != null)
  if (!xs.length) return null
  return {
    min: Math.min(...xs),
    max: Math.max(...xs),
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
    n: xs.length,
  }
}

function deltaColorOf(delta: number | null, better: Better): string {
  if (delta == null || delta === 0 || better === 'neutral') return MUTED
  return (delta > 0) === (better === 'up') ? EMERALD : OXIDE
}

/** The four weekly-vitals groups (this-week vs last, 8-week trend) — shared by /insights. */
export function VitalsGroups() {
  const { data: days, isLoading } = useVitalsDays(56)
  const rows = days ?? []
  const [open, setOpen] = useState<MetricDef | null>(null)

  // The skeleton stands in for the REAL height — a today strip plus four
  // groups — so arriving data doesn't shove the page down under the reader.
  if (isLoading && !rows.length) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TODAY.map((m) => <div key={m.key} className="h-[74px] rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="pl-3" style={{ borderLeft: `2px solid ${g.accent}33` }}>
            <div className="h-3 w-32 rounded bg-white/[0.04] animate-pulse mb-2" />
            <div className="rounded bg-white/[0.03] animate-pulse" style={{ height: g.metrics.length * 52 }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Tier 1: today, no charts ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TODAY.map((m) => {
          const latest = latestReading(rows, m.pick)
          const win = vitalWindow(rows, m.pick, m.agg)
          const d = win.delta
          return (
            <Tile
              key={m.key}
              label={m.label}
              accent={m.color}
              value={latest ? (m.short ?? m.fmt)(latest.value) : null}
              unit={latest ? m.unit : undefined}
              sub={d != null && d !== 0
                ? `${d > 0 ? '+' : '−'}${(m.deltaFmt ?? m.fmt)(Math.abs(d))} vs last week`
                : latest ? 'No change vs last week' : 'No reading yet'}
            />
          )
        })}
      </div>

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
            {/* `shrink-0` on the title and `min-w-0` on the blurb, or flexbox
                compresses the four-character heading before it truncates the
                sentence that was always the expendable one. */}
            <div className="flex items-baseline gap-2 mb-1 min-w-0">
              <g.icon className="w-3 h-3 shrink-0 translate-y-px" style={{ color: g.accent }} aria-hidden="true" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] shrink-0" style={{ color: g.accent }}>{g.title}</h3>
              <p className="text-[10px] text-muted leading-tight truncate min-w-0">{g.blurb}</p>
            </div>
            {allEmpty ? (
              <p className="text-fluid-xs text-muted/70 py-1">No data from Apple Health yet.</p>
            ) : (
              <div>
                {metrics.map(({ def, win }, i) => (
                  <VitalRow key={def.key} def={def} win={win} days={rows} divide={i > 0} onOpen={() => setOpen(def)} />
                ))}
              </div>
            )}
          </section>
        )
      })}

      <Sheet open={open != null} onClose={() => setOpen(null)} title={open?.label ?? ''} accent={open?.color}>
        {open && <VitalDetail def={open} days={rows} />}
      </Sheet>
    </div>
  )
}

/**
 * One metric, one 52px lane.
 *
 * ── WHY THE HEIGHT IS FIXED, AND WHY THE TRACE HAS ITS OWN COLUMN ────────────
 * The trace used to be the row's GROUND — `absolute inset-0` with
 * `preserveAspectRatio="none"`, a 96×36 viewBox stretched across the whole row.
 * That put the line under the label, the caption, the delta chip and the value
 * at once, and stretching a 36pt-tall viewBox to a content-derived height meant
 * the y-scale changed with the viewport and with how many words the caption
 * wrapped to. Two rows drawn at two heights are not comparable, which is the
 * only thing a sparkline is for.
 *
 * A fixed row and a real grid column fix both by construction: the trace cannot
 * reach the text because it does not share a box with it, and `meet` keeps its
 * aspect so the same delta draws the same slope in every row on the page.
 */
function VitalRow({ def, win, days, divide, onOpen }: {
  def: MetricDef; win: ReturnType<typeof vitalWindow>; days: VitalsDay[]; divide?: boolean; onOpen: () => void
}) {
  const series = vitalWeeklySeries(days, def.pick, def.agg)
  const deltaColor = deltaColorOf(win.delta, def.better)

  // Tiered empty states: 0 days → "Not enough data" (dimmed, no fake value);
  // 1–3 days → show the value but flag it's still collecting; ≥4 → full caption.
  const empty = win.coverage === 0 || win.current == null
  const collecting = !empty && win.coverage < 4
  const border = divide ? 'border-t border-white/[0.05]' : ''

  if (empty) {
    return (
      <div className={`h-[52px] flex items-center gap-3 opacity-60 ${border}`}>
        <span className="min-w-0 flex-1 text-fluid-xs text-text/80 truncate">{def.label}</span>
        <span className="shrink-0 text-[11px] text-muted">Not enough data yet</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full h-[52px] grid grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-3 text-left
                  active:opacity-80 transition-opacity ${border}`}
      title={`${def.label} — 8-week trend`}
    >
      <span className="min-w-0">
        <span className="block text-fluid-xs text-text/90 truncate leading-tight">{def.label}</span>
        <span className="block text-[10px] text-muted leading-tight truncate">
          {collecting
            ? `Collecting · ${win.coverage}/7 days`
            : `7-day ${def.agg === 'avg' ? 'avg' : 'total'} · ${win.coverage}/7 days`}
        </span>
      </span>

      <Spark series={series} color={def.color} />

      <span className="flex items-baseline gap-2 justify-end">
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
      </span>
    </button>
  )
}

/** The tapped row's depth: the 8-week shape at a readable size, plus its range. */
function VitalDetail({ def, days }: { def: MetricDef; days: VitalsDay[] }) {
  const series = vitalWeeklySeries(days, def.pick, def.agg)
  const stats = seriesStats(series)
  const win = vitalWindow(days, def.pick, def.agg)
  const latest = latestReading(days, def.pick)

  return (
    <div className="px-4 pb-5 space-y-4">
      <div className="flex items-end gap-3">
        <span className="helix-num text-fluid-2xl font-bold text-text tabular-nums leading-none">
          {win.current != null ? def.fmt(win.current) : '—'}
        </span>
        <span className="text-[11px] text-muted pb-0.5">
          7-day {def.agg === 'avg' ? 'average' : 'total'}
        </span>
        {win.delta != null && win.delta !== 0 && (
          <span className="ml-auto text-fluid-xs font-bold tabular-nums pb-0.5"
            style={{ color: deltaColorOf(win.delta, def.better) }}>
            {win.delta > 0 ? '+' : '−'}{(def.deltaFmt ?? def.fmt)(Math.abs(win.delta))}
          </span>
        )}
      </div>

      <div className="h-[96px]">
        <Spark series={series} color={def.color} className="w-full h-full" dots />
      </div>

      {stats ? (
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Low" value={def.fmt(stats.min)} accent={def.color} />
          <Tile label="Average" value={def.fmt(stats.mean)} accent={def.color} />
          <Tile label="High" value={def.fmt(stats.max)} accent={def.color} />
        </div>
      ) : (
        <p className="text-fluid-xs text-muted">No weekly readings yet.</p>
      )}

      <p className="text-[10px] text-muted leading-relaxed">
        {stats ? `${stats.n} weekly ${def.agg === 'avg' ? 'averages' : 'totals'}, Sunday-anchored.` : ''}
        {' '}From Apple Health via the daily ingest
        {latest ? ` · last reading ${latest.date}` : ''}.
      </p>
    </div>
  )
}

/**
 * The trend line, drawn inside whatever box it is given.
 *
 * `xMidYMid meet` (not `none`) — the row lane and the Sheet lane have very
 * different aspect ratios, and a stretched trace reads as a different signal in
 * each. Full opacity now that it no longer sits under text.
 */
function Spark({ series, color, className = 'w-full h-full', dots = false }: {
  series: Array<number | null>; color: string; className?: string; dots?: boolean
}) {
  const pts = series.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) return <span className={className} aria-hidden="true" />
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = max - min || 1
  const W = 96; const H = 36; const PAD = 4
  const denom = Math.max(1, series.length - 1)
  const x = (i: number) => (i / denom) * (W - PAD * 2) + PAD
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const line = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts[pts.length - 1].i).toFixed(1)},${H - PAD} L${x(pts[0].i).toFixed(1)},${H - PAD} Z`
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      className={`${className} pointer-events-none overflow-visible`} aria-hidden="true">
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      {dots && pts.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="1.6" fill={color} opacity="0.5" />
      ))}
      <circle cx={x(last.i)} cy={y(last.v)} r="2.4" fill={color} />
    </svg>
  )
}
