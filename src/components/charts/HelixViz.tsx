'use client'

import { useMemo } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import { useMuscleAnalytics, MUSCLE_GROUPS, GROUP_COLOR } from '@/lib/hooks/useMuscleAnalytics'
import { useVolumeTrend } from '@/lib/hooks/useCharts'
import { eraForDate } from '@/lib/programs'
import { ChartTooltip } from './ChartTooltip'
import { EMERALD, MUTED } from '@/lib/theme/palette'
import { buildIntensityCalendar, type CalendarCell } from '@/lib/charts/intensityCalendar'
import { logicalTodayISO } from '@/lib/utils/day'

/* ── THE CONTOUR MAP IS GONE ─────────────────────────────────────────────────
   `BodyHeatmap` drew a second, cruder body — six blobby regions on a silhouette
   of its own, sharing nothing with `atlas.ts` — and printed the same weekly set
   counts the Week-to-Date card prints a screen above it, in a coarser taxonomy.
   Two bodies on one page disagreeing about how many muscles exist is worse than
   one, and the one that had to go was the one that was not the real anatomy.
   `muscleLoad.ts` went with it; nothing else imported it. */

/* ── 2. Volume stream flow — stacked river of weekly sets per muscle group ── */
export function VolumeStream({ days, era = 'all' }: { days: number; era?: 'all' | 'ppl' | 'axis' }) {
  const { data, isLoading } = useMuscleAnalytics(days, era)
  if (isLoading) return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 animate-pulse" />
  if (!data || data.weekly.length < 2) return null

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
      <h3 className="font-heading font-semibold text-base">Volume Stream</h3>
      <p className="text-fluid-xs text-muted mb-2">Weekly working sets per muscle group — training-focus drift</p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data.weekly} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
          <XAxis dataKey="week" tick={{ fill: MUTED, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} tickMargin={4} />
          <YAxis tick={{ fill: MUTED, fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={30} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
          {MUSCLE_GROUPS.map((g) => (
            <Area isAnimationActive={false} key={g} type="basis" dataKey={g} stackId="s" stroke="none" fill={GROUP_COLOR[g]} fillOpacity={0.75} />
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
  const today = logicalTodayISO()
  const model = useMemo(() => {
    if (!data?.length) return null
    const byDate = new Map<string, number>()
    for (const s of data) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.volume)
    return buildIntensityCalendar(byDate, days, today)
  }, [data, days, today])

  if (isLoading) return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-40 animate-pulse" />
  if (!model) return null
  const { weeks, stats } = model

  const cell = (c: CalendarCell) => !c.elapsed ? 'transparent'
    : c.t <= 0 ? 'rgba(255,255,255,0.05)'
    : c.t < 0.35 ? `${EMERALD}59` : c.t < 0.7 ? `${EMERALD}a6` : EMERALD
  const hardestLabel = stats.hardest
    ? new Date(stats.hardest.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : '—'

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
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
                <span key={c.date} title={!c.elapsed ? c.date : `${c.date}${c.t > 0 ? '' : ' · rest'}`}
                  className="w-3.5 h-3.5 md:w-[18px] md:h-[18px] rounded-[3px]"
                  style={{ background: cell(c), boxShadow: c.elapsed && c.t >= 0.7 ? `0 0 6px ${EMERALD}80` : undefined }} />
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
