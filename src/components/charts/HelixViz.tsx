'use client'

import { useMemo } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import { useMuscleAnalytics, MUSCLE_GROUPS, GROUP_COLOR } from '@/lib/hooks/useMuscleAnalytics'
import { useVolumeTrend } from '@/lib/hooks/useCharts'
import { eraForDate } from '@/lib/programs'
import { ChartTooltip } from './ChartTooltip'
import { EMBER, SAPPHIRE, EMERALD, STEEL, MUTED } from '@/lib/theme/palette'

/* ── 1. Muscle contour body-map ──────────────────────────────────────────────
   A stylized front silhouette whose regions glow by share of training volume. */
const REGIONS: Array<{ group: string; d: string }> = [
  { group: 'Shoulders', d: 'M28 34 a9 8 0 1 0 0.1 0 M72 34 a9 8 0 1 0 0.1 0' },
  { group: 'Chest',     d: 'M36 38 h28 a4 4 0 0 1 4 5 l-3 14 a4 4 0 0 1 -4 3 h-22 a4 4 0 0 1 -4 -3 l-3 -14 a4 4 0 0 1 4 -5' },
  { group: 'Arms',      d: 'M20 44 q-4 14 -2 26 q1 6 6 6 q5 0 5 -6 l1 -24 z M80 44 q4 14 2 26 q-1 6 -6 6 q-5 0 -5 -6 l-1 -24 z' },
  { group: 'Core',      d: 'M38 62 h24 a3 3 0 0 1 3 3 l-2 18 a4 4 0 0 1 -4 3 h-18 a4 4 0 0 1 -4 -3 l-2 -18 a3 3 0 0 1 3 -3' },
  { group: 'Legs',      d: 'M36 88 l-2 38 a5 5 0 0 0 5 5 h6 a4 4 0 0 0 4 -4 l1 -32 z M64 88 l2 38 a5 5 0 0 1 -5 5 h-6 a4 4 0 0 1 -4 -4 l-1 -32 z' },
  { group: 'Back',      d: 'M42 30 h16 a3 3 0 0 1 3 4 l-1 4 h-20 l-1 -4 a3 3 0 0 1 3 -4' },
]

export function BodyHeatmap({ days, era = 'all' }: { days: number; era?: 'all' | 'ppl' | 'axis' }) {
  const { data, isLoading } = useMuscleAnalytics(days, era)
  if (isLoading) return <div className="helix-card h-72 animate-pulse" />
  if (!data || data.stats.every((s) => s.volume === 0)) return null

  const maxVol = Math.max(...data.stats.map((s) => s.volume), 1)
  const heat = new Map(data.stats.map((s) => [s.group, s.volume / maxVol]))
  // Jewel heat ramp: cool steel → sapphire → ember at the hardest-worked region.
  const color = (t: number) => t <= 0 ? 'rgba(255,255,255,0.04)'
    : t < 0.35 ? `${STEEL}${alpha(0.35 + t)}` : t < 0.7 ? `${SAPPHIRE}${alpha(0.45 + t * 0.4)}` : `${EMBER}${alpha(0.55 + t * 0.4)}`

  return (
    <div className="helix-card">
      <h3 className="font-heading font-semibold text-base">Muscle Contour Map</h3>
      <p className="text-fluid-xs text-muted mb-2">Regional training-volume heat · {days}d</p>
      {/* Silhouette left, legend right on desktop — the old centred flex row
          left a wide card mostly empty and the SVG dictated the card height. */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center gap-5">
        <svg viewBox="0 0 100 136" className="h-44 sm:h-52 shrink-0" aria-label="Muscle volume body map">
          {/* Head */}
          <circle cx="50" cy="14" r="9" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" />
          {REGIONS.map((r) => {
            const t = heat.get(r.group) ?? 0
            return (
              <path key={r.group} d={r.d} fill={color(t)} stroke="rgba(255,255,255,0.14)" strokeWidth="0.8"
                style={t > 0.15 ? { filter: `drop-shadow(0 0 ${3 + t * 5}px ${color(t)})` } : undefined}>
                <title>{r.group}</title>
              </path>
            )
          })}
        </svg>
        <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-1.5 flex-1 min-w-0 sm:max-w-[190px]">
          {[...data.stats].sort((a, b) => b.volume - a.volume).map((s) => (
            <div key={s.group} className="flex items-center gap-2 text-fluid-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color((heat.get(s.group) ?? 0)) }} />
              <span className="text-text flex-1 truncate">{s.group}</span>
              <span className="helix-num text-muted">{Math.round((heat.get(s.group) ?? 0) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 0–1 opacity → the two-hex-digit alpha suffix the palette constants expect. */
function alpha(t: number): string {
  return Math.round(Math.min(1, Math.max(0, t)) * 255).toString(16).padStart(2, '0')
}

/* ── 2. Volume stream flow — stacked river of weekly sets per muscle group ── */
export function VolumeStream({ days, era = 'all' }: { days: number; era?: 'all' | 'ppl' | 'axis' }) {
  const { data, isLoading } = useMuscleAnalytics(days, era)
  if (isLoading) return <div className="helix-card h-64 animate-pulse" />
  if (!data || data.weekly.length < 2) return null

  return (
    <div className="helix-card">
      <h3 className="font-heading font-semibold text-base">Volume Stream</h3>
      <p className="text-fluid-xs text-muted mb-2">Weekly working sets per muscle group — training-focus drift</p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data.weekly} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
          <XAxis dataKey="week" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} tickMargin={4} />
          <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={30} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
          {MUSCLE_GROUPS.map((g) => (
            <Area key={g} type="basis" dataKey={g} stackId="s" stroke="none" fill={GROUP_COLOR[g]} fillOpacity={0.75} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── 3. RPE intensity calendar — GitHub-style heat grid of session load ────── */
export function RpeCalendar({ days, era = 'all' }: { days: number; era?: 'all' | 'ppl' | 'axis' }) {
  const { data: raw, isLoading } = useVolumeTrend(days)
  const data = raw?.filter((s) => era === 'all' || eraForDate(s.date) === era)
  const model = useMemo(() => {
    if (!data?.length) return null
    const byDate = new Map<string, number>()
    for (const s of data) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.volume)
    const max = Math.max(...byDate.values(), 1)
    // Build week columns (Sun-start), newest right
    const end = new Date(); end.setHours(0, 0, 0, 0)
    const weeks: Array<Array<{ date: string; t: number }>> = []
    const cursor = new Date(end); cursor.setDate(cursor.getDate() - cursor.getDay()) // this week's Sunday
    const nWeeks = Math.min(16, Math.ceil(days / 7))
    for (let w = nWeeks - 1; w >= 0; w--) {
      const col: Array<{ date: string; t: number }> = []
      for (let d = 0; d < 7; d++) {
        const day = new Date(cursor); day.setDate(day.getDate() - w * 7 + d)
        const iso = day.toLocaleDateString('en-CA')
        col.push({ date: iso, t: (byDate.get(iso) ?? 0) / max })
      }
      weeks.push(col)
    }
    // Stats to fill the desktop dead space beside the (now wider) grid.
    const entries = [...byDate.entries()]
    const activeDays = entries.length
    const hardest = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best), entries[0])
    const avgLoad = entries.reduce((n, [, v]) => n + v, 0) / activeDays
    // Longest run of consecutive active days in the window (training streak).
    const sorted = entries.map(([d]) => d).sort()
    let streak = 1, best = 1
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] + 'T00:00:00Z').getTime()
      const cur = new Date(sorted[i] + 'T00:00:00Z').getTime()
      streak = cur - prev === 86_400_000 ? streak + 1 : 1
      if (streak > best) best = streak
    }
    return { weeks, stats: { activeDays, hardest, avgLoad, streak: best } }
  }, [data, days])

  if (isLoading) return <div className="helix-card h-40 animate-pulse" />
  if (!model) return null
  const { weeks, stats } = model

  const cell = (t: number) => t <= 0 ? 'rgba(255,255,255,0.05)'
    : t < 0.35 ? `${EMERALD}59` : t < 0.7 ? `${EMERALD}a6` : EMERALD
  const hardestLabel = new Date(stats.hardest[0] + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="helix-card">
      <h3 className="font-heading font-semibold text-base">Intensity Calendar</h3>
      <p className="text-fluid-xs text-muted mb-3">Session load heat (volume-scaled) · streaks &amp; deloads at a glance</p>
      {/* Cells are FIXED-SIZE, not flex-1. Stretching them to fill the card
          width meant a 30-day range (5 columns) made each square ~20% of a wide
          desktop card, so seven rows stacked into a ~500px tower of empty space.
          The grid now stays compact and the stats sit beside it on desktop. */}
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <div className="flex gap-1 shrink-0">
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-1">
              {col.map((c) => (
                <span key={c.date} title={`${c.date}${c.t > 0 ? '' : ' · rest'}`}
                  className="w-3.5 h-3.5 md:w-[18px] md:h-[18px] rounded-[3px]"
                  style={{ background: cell(c.t), boxShadow: c.t >= 0.7 ? `0 0 6px ${EMERALD}80` : undefined }} />
              ))}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-2 flex-1 min-w-0 self-stretch content-start">
          <CalStat label="Active days" value={`${stats.activeDays}`} />
          <CalStat label="Best streak" value={`${stats.streak}d`} />
          <CalStat label="Hardest" value={hardestLabel} />
          <CalStat label="Avg load" value={`${((stats.avgLoad) / 1000).toFixed(1)}t`} />
        </div>
      </div>
    </div>
  )
}

function CalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-muted leading-none">{label}</div>
      <div className="helix-num text-fluid-sm font-bold text-text mt-0.5 truncate">{value}</div>
    </div>
  )
}
