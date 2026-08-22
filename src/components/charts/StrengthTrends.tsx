'use client'

import { useId, useMemo } from 'react'
import { ResponsiveContainer, AreaChart, Area, Line, ReferenceLine, YAxis } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { usePRHistory } from '@/lib/hooks/useCharts'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { exerciseColor, landmarkColor } from '@/lib/theme/muscleHue'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import { toLandmarkMuscle, type LandmarkMuscle } from '@/lib/training/landmarks'
import { MUTED } from '@/lib/theme/palette'

/**
 * Per-exercise est-1RM strength trends — progressive overload, lift by lift.
 *
 * ── WHY THE LINES ARE NOT GREEN AND RED ANY MORE ─────────────────────────────
 * Every sparkline was one of two colours: emerald if the delta was positive,
 * oxide if it was not. That made eight rows into two groups and told you
 * nothing you could not read from the ▲/▼ two centimetres to the right — while
 * spending the page's only colour channel restating it. A lift's colour is now
 * its own, straight out of `exerciseColor`, which resolves through the same
 * `resolveMovers` the set arithmetic uses: a curl is copper because it is a
 * biceps movement, and Hammer Curl is a visibly different copper from Incline
 * Curl. Direction is carried by the delta chip, which is what a chip is for.
 *
 * ── AND WHY THEY ARE GROUPED ─────────────────────────────────────────────────
 * A flat list sorted by |Δ| interleaved a leg press with a lateral raise, so
 * the eye had to read every name to answer "how is my pressing going". Rows sit
 * under their landmark muscle now, in that muscle's own hue.
 *
 * This widget used to have "Estimated 1RM Trends" — a full axis chart over the
 * same `usePRHistory` rows — directly beneath it. That one was deleted: it drew
 * the same shapes without naming the numbers.
 */
export function StrengthTrends({ days = 120, era = 'all' }: { days?: number; era?: 'all' | 'ppl' | 'axis' }) {
  // No local timeframe control. It used to own a Week / 30 Days / Era trio of
  // its own, sitting a few pixels from Muscle Analytics' near-identical trio —
  // two toggles that looked the same, moved different charts, and disagreed by
  // default. The window is now the section's, passed in.
  const { data, isLoading } = usePRHistory(undefined, days, era)
  const unit = useUnitSystem()

  const groups = useMemo(() => {
    const byEx = new Map<string, { name: string; pts: { i: number; v: number }[] }>()
    for (const r of data ?? []) {
      const e = byEx.get(r.exercise_id) ?? { name: r.exercise_name, pts: [] }
      e.pts.push({ i: e.pts.length, v: Math.round(r.est_1rm_kg) })
      byEx.set(r.exercise_id, e)
    }

    const series = [...byEx.values()]
      .filter((e) => e.pts.length >= 2)
      .map((e) => {
        const current = e.pts[e.pts.length - 1].v
        const best = Math.max(...e.pts.map((p) => p.v))
        return {
          name: e.name,
          pts: e.pts,
          current,
          best,
          delta: current - e.pts[0].v,
          color: exerciseColor(e.name),
          muscle: landmarkOf(e.name),
        }
      })
      // Eight rather than six: a whole widget below this one was deleted, and
      // the page can afford the lifts it was hiding.
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8)

    // Muscle-major, then by the movement that has moved most inside it.
    const out = new Map<LandmarkMuscle | 'Other', typeof series>()
    for (const s of series) {
      const key = s.muscle ?? 'Other'
      out.set(key, [...(out.get(key) ?? []), s])
    }
    return [...out.entries()]
  }, [data])

  if (isLoading) return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-40 animate-pulse" />
  if (!groups.length) return null

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-3">
      <h2 className="font-heading font-semibold text-fluid-base text-text flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" /> Strength Trends
        <span className="text-fluid-xs text-muted font-normal">est. 1RM</span>
      </h2>

      <div className="space-y-3">
        {groups.map(([muscle, rows]) => (
          <div key={muscle} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="w-1 h-3 rounded-full shrink-0"
                style={{ background: muscle === 'Other' ? MUTED : landmarkColor(muscle) }}
                aria-hidden="true"
              />
              <h3
                className="text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: muscle === 'Other' ? MUTED : landmarkColor(muscle) }}
              >
                {muscle}
              </h3>
            </div>
            {rows.map((s) => <TrendRow key={s.name} s={s} unit={unit} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The landmark an exercise trains, through the one resolver the maths uses. */
function landmarkOf(name: string): LandmarkMuscle | null {
  const primary = resolveMovers(name).primary[0]
  return primary ? toLandmarkMuscle(primary) : null
}

function TrendRow({ s, unit }: {
  s: { name: string; pts: { i: number; v: number }[]; current: number; best: number; delta: number; color: string }
  unit: string
}) {
  // `useId` per row: two rows sharing a gradient id in one document resolve to
  // whichever painted first, which is the same class of bug MuscleAtlas suffixes
  // its defs to avoid.
  const gid = `trend-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const last = s.pts[s.pts.length - 1]

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-fluid-sm font-medium text-text truncate">{s.name}</div>
        <div className="text-fluid-xs text-muted">
          best <span className="helix-num">{displayWeight(s.best)}</span>{unit}
        </div>
      </div>

      {/* Wider and taller than the old 80×32: at that size a 4 kg move over
          three months was one pixel of slope. The area fill under the line is
          what makes the shape readable at this height without thickening the
          stroke into a slab. */}
      <div className="w-28 sm:w-36 h-10 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={s.pts} margin={{ top: 3, bottom: 3, left: 0, right: 3 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.36} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* The domain is the series' own range, not zero-based: these are
                1RMs in the 40–120 kg band, and anchoring at zero flattens every
                one of them into the same horizontal line. */}
            <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
            {/* The all-time best as a hairline, so a row that is climbing but
                still under its own record says so without a second number. */}
            {s.best > last.v && (
              <ReferenceLine y={s.best} stroke={s.color} strokeOpacity={0.35} strokeDasharray="2 2" />
            )}
            <Area
              dataKey="v" stroke="none" fill={`url(#${gid})`} isAnimationActive={false}
            />
            <Line
              dataKey="v" stroke={s.color} strokeWidth={1.75} isAnimationActive={false}
              type="monotone" activeDot={false}
              /* ONLY the final point is dotted — it is the one the big number to
                 the right refers to, and a dot on every session turns a trend
                 into a bead chain. Recharts has no "last point only" flag, so
                 the render prop draws a circle for that index and an empty <g>
                 for the rest; returning null is not allowed here. */
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === s.pts.length - 1 && props.cx != null && props.cy != null
                  ? <circle key="tip" cx={props.cx} cy={props.cy} r={2.4} fill={s.color} />
                  : <g key={`empty-${props.index}`} />}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="text-right w-14 shrink-0">
        <div className="helix-num text-fluid-base font-bold text-text leading-none">
          {displayWeight(s.current)}<span className="text-[10px] text-muted">{unit}</span>
        </div>
        {s.delta !== 0 && (
          <div className={`helix-num text-[10px] ${s.delta > 0 ? 'text-success' : 'text-danger'}`}>
            {s.delta > 0 ? '▲' : '▼'}{displayWeight(Math.abs(s.delta))}
          </div>
        )}
      </div>
    </div>
  )
}
