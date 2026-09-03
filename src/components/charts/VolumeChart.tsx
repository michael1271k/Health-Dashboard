'use client'

import { useId, useMemo, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { VolumePoint } from '@/lib/hooks/useCharts'
import { SPLITS_FOR_ERA, splitLabel, resolveChartSplit, type ChartSplit } from '@/lib/charts/volumeSplit'
export { SPLITS_FOR_ERA, resolveChartSplit }
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { niceDomain, compactKg } from '@/lib/charts/scale'
import { dayColor, SAND } from '@/lib/theme/palette'
import { useMaintenancePredicate } from '@/lib/hooks/useMaintenance'

const GRID = 'rgba(255,255,255,0.06)'
const TEXT = '#79808C'

/**
 * One implementation, shared with the rest of the app.
 *
 * This file carried a private third copy over five local hexes in which
 * UPPER_A_COLOR and LEGS_B_COLOR were BOTH #8E9AAC — the two series this chart
 * exists to tell apart, drawn in the same grey — and `arms` was emerald here
 * while DAY_COLOR says amethyst. The comment on LEGS_B_COLOR even recorded a
 * previous collision fix that reintroduced one.
 *
 * `dayColor(s, s)` resolves a program day key first (upper_a, legs_b, arms…)
 * and falls back to the split name (push/pull/legs), which is exactly the two
 * kinds of value ChartSplit holds.
 */
const splitColor = (s: ChartSplit): string => dayColor(s, s)


function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(new Date(dateStr + 'T12:00:00Z'))
}

/**
 * One point on the volume line. Hollow when the day belongs to a planned deload.
 *
 * Recharts hands a dot renderer the whole datum on `payload`, which is why the
 * `maintenance` flag rides along on the point rather than being recomputed here.
 */
function VolumeDot(props: {
  cx?: number; cy?: number; color?: string
  payload?: { maintenance?: boolean }
}) {
  const { cx, cy, color, payload } = props
  if (cx == null || cy == null) return null
  if (payload?.maintenance) {
    return <circle cx={cx} cy={cy} r={3.5} fill="var(--color-surface-2)" stroke={SAND} strokeWidth={2} />
  }
  return <circle cx={cx} cy={cy} r={2} fill={color} />
}

export function VolumeChart({ data, isLoading, era = 'all' }: { data: VolumePoint[]; isLoading?: boolean; era?: 'all' | 'ppl' | 'axis' }) {
  const [split, setSplit] = useState<ChartSplit>('legs')
  const unit = useUnitSystem()
  // Scoped, not hardcoded. An SVG id is global to the document, so two of these
  // on one page both defined `volFill` and the second silently repainted the
  // first with its own gradient.
  const volFill = `volFill-${useId().replace(/:/g, '')}`

  // The selected split must exist in the active era's pill set.
  const pills = SPLITS_FOR_ERA[era]
  const activeSplit = pills.includes(split) ? split : pills[0]

  /**
   * ── THE BAND IS ON THE LEVER AXIS NOW ──────────────────────────────────────
   * This asked `maintenanceSpanFor`, the PHASE axis, on the reasoning that a
   * phase is the thing with a declared length and a band needs an end. True
   * then; the phase row for the maintenance week was deleted on 2026-08-30 when
   * the lever took that week over, so the axis stopped having an opinion and
   * the band silently vanished from the one week it was drawn for — leaving the
   * volume drop that the plan asked for looking exactly like a bad week.
   *
   * It does not need a declared length: the band below is built by WALKING the
   * points and extending while the predicate holds, so it ends where the data
   * ends. A per-date predicate is all it ever needed.
   */
  const isMaintenance = useMaintenancePredicate()

  // Hooks run before the loading early-return — their order must not depend on
  // whether data has arrived.
  const chartData = useMemo(
    () => data
      .filter((d) => resolveChartSplit(d.date, d.split, era, d.dayKey) === activeSplit)
      .map((d) => ({
        date: formatDate(d.date),
        volume: displayWeight(d.volume),
        // Carried onto the point so both the band and the dot renderer read one
        // answer.
        maintenance: isMaintenance(d.date),
      })),
    [data, era, activeSplit, isMaintenance],
  )

  // ── THE PLANNED-DELOAD BAND ────────────────────────────────────────────────
  // A maintenance week's volume drops because the plan asked it to, and a line
  // chart has no way of saying so — the point just goes down, in the same colour
  // a bad week goes down. The band is the context the number was missing.
  //
  // Bounds are LABELS, not dates: a `ReferenceArea` on a categorical axis is
  // matched against the tick values, so a raw ISO date lands nowhere.
  const bands = useMemo(() => {
    const out: Array<{ x1: string; x2: string }> = []
    let open = false
    for (const d of chartData) {
      if (!d.maintenance) { open = false; continue }
      if (open) { out[out.length - 1].x2 = d.date; continue }
      out.push({ x1: d.date, x2: d.date })
      open = true
    }
    return out
  }, [chartData])
  // hardMin 0: volume is a non-negative quantity, so padding must never push
  // the axis below the origin even when the series is tightly clustered.
  const volumeDomain = useMemo(
    () => niceDomain(chartData.map((d) => d.volume), { hardMin: 0 }),
    [chartData],
  )

  if (isLoading) {
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-64 flex items-center justify-center"><div className="w-full h-40 bg-surface-2 rounded-xl animate-pulse" /></div>
  }

  const color = splitColor(activeSplit)

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Workout Volume</h3>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {pills.map((s) => {
            const active = activeSplit === s
            const c = splitColor(s)
            return (
              <button key={s} onClick={() => setSplit(s)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors border"
                style={active ? { color: c, borderColor: `${c}55`, background: `${c}1f` } : { color: TEXT, borderColor: 'transparent' }}>
                {splitLabel(s)}
              </button>
            )
          })}
        </div>
      </div>
      {chartData.length === 0 ? (
        <div className="h-56 flex items-center justify-center"><p className="text-muted text-sm">No {splitLabel(activeSplit)} sessions in range.</p></div>
      ) : (
        <div role="img" aria-label={`${splitLabel(activeSplit)} volume over time`}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 4, right: 26, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={volFill} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: TEXT, fontSize: 10, fontFamily: 'var(--font-mono)' }} tickMargin={8} minTickGap={20} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              {/* Fitted to the data, not to zero. Weekly volume sits in a narrow
                  band a long way above the origin, so a zero-based axis squashed
                  every real change into a few pixels. */}
              <YAxis tick={{ fill: TEXT, fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={48}
                domain={volumeDomain} allowDataOverflow={false} tickFormatter={compactKg} />
              {bands.map((b) => (
                <ReferenceArea key={`${b.x1}-${b.x2}`} x1={b.x1} x2={b.x2} ifOverflow="extendDomain"
                  fill={SAND} fillOpacity={0.09} stroke={SAND} strokeOpacity={0.22} strokeDasharray="3 3" />
              ))}
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
              {/* A deload point is HOLLOW — filled with the card's own ground and
                  ringed in SAND. Solid-vs-hollow survives both themes and reads
                  at a glance without asking the reader to decode a second hue. */}
              <Area isAnimationActive={false} type="monotone" dataKey="volume" name={`Volume (${unit})`} stroke={color} fill={`url(#${volFill})`} strokeWidth={2} dot={<VolumeDot color={color} />} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
