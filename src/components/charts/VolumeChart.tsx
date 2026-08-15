'use client'

import { useId, useMemo, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { VolumePoint } from '@/lib/hooks/useCharts'
import type { SplitDay } from '@/lib/types/workout'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { niceDomain, compactKg } from '@/lib/charts/scale'
import { dayColor } from '@/lib/theme/palette'

const GRID = 'rgba(255,255,255,0.06)'
const TEXT = '#79808C'

// Chart buckets. HELIX-only pseudo-splits resolved by weekday: 'upper_a'/'upper_b'
// (both DB split_day='upper', Sun vs Thu), 'arms' (Delts & Arms, also DB 'upper',
// Tue) and 'legs_a'/'legs_b' (Legs A/B, both DB split_day='legs', Mon vs Fri).
type ChartSplit = SplitDay | 'upper_a' | 'upper_b' | 'arms' | 'legs_a' | 'legs_b'

// The pill set is era-specific. PPL trains Push/Pull/Legs (no "Upper" — zero
// records); HELIX-5 logs the five real splits. Legacy "lower" folds into legs.
//
// `all` was a COPY OF THE PPL SET, which made it a trap rather than a superset:
// a chart handed era 'all' offered Push / Pull / Legs while every Helix session
// bucketed to `upper_a` / `legs_b` / … matched none of them, so it named a plan
// that ended in July and then drew an empty curve. It is the union now, so the
// worst an 'all' caller can do is offer more pills than it has data for —
// visible and harmless — instead of silently showing the wrong plan.
// `eraForRange` no longer returns 'all' at all; this is the belt for the prop
// default, not the braces.
const AXIS_SPLITS: ChartSplit[] = ['upper_a', 'upper_b', 'arms', 'legs_a', 'legs_b']
const PPL_SPLITS: ChartSplit[] = ['push', 'pull', 'legs']
export const SPLITS_FOR_ERA: Record<'all' | 'ppl' | 'axis', ChartSplit[]> = {
  all: [...AXIS_SPLITS, ...PPL_SPLITS],
  ppl: PPL_SPLITS,
  axis: AXIS_SPLITS,
}
const splitLabel = (s: ChartSplit) => {
  if (s === 'upper_a') return 'Upper A'
  if (s === 'upper_b') return 'Upper B'
  if (s === 'arms') return 'Delts & Arms'
  if (s === 'legs_a') return 'Legs & Core A'
  if (s === 'legs_b') return 'Legs & Core B'
  if (s === 'legs') return 'Legs'
  return s[0].toUpperCase() + s.slice(1)
}
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

/**
 * The program day a session RECORDED for itself → its chart bucket.
 *
 * `day_key` is the workout's own identity, written at commit time from whatever
 * the schedule actually said that morning — swaps included. Both Helix plans and
 * the PPL legacy plan are covered so a keyed session never falls through to the
 * weekday guess.
 */
const DAY_KEY_SPLIT: Record<string, ChartSplit> = {
  // Helix-5 (active)
  cb_a: 'upper_a', cb_b: 'upper_b', arms: 'arms', legs_a: 'legs_a', legs_b: 'legs_b',
  // Helix-4
  upper_a: 'upper_a', upper_b: 'upper_b', lower_a: 'legs_a', lower_b: 'legs_b',
  // PPL (legacy)
  ppl_push_sun: 'push', ppl_push_thu: 'push',
  ppl_pull_mon: 'pull', ppl_pull_fri: 'pull', ppl_legs_tue: 'legs',
}

/**
 * Map a session to its chart bucket — by what was PERFORMED, never by what the
 * template says that weekday should have been.
 *
 * THE SWAP BUG (fixed 2026-08-06). HELIX logs every upper day as DB
 * split_day='upper', so the bucket used to be recovered from the weekday alone:
 * Sun→Upper A, Tue→Delts & Arms, Thu→Upper B. That is a restatement of the
 * static plan, and a swapped week violates it. Tuesday 2026-08-04 was swapped to
 * a rest day, which pushed Delts & Arms onto Wednesday; the Wednesday session
 * (day_key 'arms', 3571.25 kg) matched neither weekday 2 nor 4 and landed on the
 * final `upper_a` fallback, dropping a Delts & Arms workout into the Upper A
 * curve. The two series were then both wrong — one inflated by work it never
 * saw, the other missing its own session.
 *
 * `day_key` is the fix and the whole fix: the session states its own identity,
 * so nothing has to be inferred. The weekday heuristic survives ONLY as the
 * fallback for the 75 legacy rows written before the column existed (verified
 * live) — those are all pre-swap-feature, so the inference is safe there.
 */
export function resolveChartSplit(
  dateISO: string,
  split: string,
  era: 'all' | 'ppl' | 'axis',
  dayKey?: string | null,
): ChartSplit {
  const byKey = dayKey ? DAY_KEY_SPLIT[dayKey] : undefined
  if (byKey) return byKey
  if (split === 'lower') return 'legs'
  if (era === 'axis') {
    const weekday = new Date(dateISO + 'T12:00:00Z').getUTCDay()
    if (split === 'upper') return weekday === 2 ? 'arms' : weekday === 4 ? 'upper_b' : 'upper_a'
    if (split === 'legs') return weekday === 1 ? 'legs_a' : weekday === 5 ? 'legs_b' : 'legs'
  }
  return split as ChartSplit
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IL', { month: 'short', day: 'numeric' }).format(new Date(dateStr + 'T12:00:00Z'))
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

  // Hooks run before the loading early-return — their order must not depend on
  // whether data has arrived.
  const chartData = useMemo(
    () => data
      .filter((d) => resolveChartSplit(d.date, d.split, era, d.dayKey) === activeSplit)
      .map((d) => ({ date: formatDate(d.date), volume: displayWeight(d.volume) })),
    [data, era, activeSplit],
  )
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
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
              <Area isAnimationActive={false} type="monotone" dataKey="volume" name={`Volume (${unit})`} stroke={color} fill={`url(#${volFill})`} strokeWidth={2} dot={{ r: 2, fill: color }} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
