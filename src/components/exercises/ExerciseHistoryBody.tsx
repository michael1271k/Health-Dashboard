'use client'

import { useId } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
} from 'recharts'
import { TrendingUp, Activity, Info } from 'lucide-react'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { useExerciseHistory } from '@/lib/hooks/useExerciseHistory'
import { isUnloadedExercise } from '@/lib/exercises/bodyweight'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { shortDate } from '@/lib/utils/day'
import { STEEL, MUTED } from '@/lib/theme/palette'
import { niceDomain } from '@/lib/charts/scale'

/**
 * Everything a single exercise has ever done — records, trends, recent work.
 *
 * Extracted from ExerciseHistorySheet so the same body can render inside a
 * drawer (from the session report, mid-workout) or as a full page (from the
 * library). The sheet is now a twelve-line wrapper around this.
 *
 * ── RENDERING HONESTLY AROUND THE RPC ────────────────────────────────────────
 * `exercise_history` computes `best_1rm` as a plain `max(est_1rm_kg)`, with no
 * Epley fallback and no rep-floor gate. For a bodyweight or timed movement the
 * stored column is exactly 0 — not "unknown", but literally zero — and the old
 * UI tested `!= null`, so a Plank proudly reported **Best est-1RM: 0** and drew
 * a flat zero line across its chart.
 *
 * Rather than print a dash where a number should be, an unloaded movement gets
 * the records that are REAL for it: reps. A one-rep max is not a fact about a
 * Pull-Up you do fifteen of, and pretending the field merely failed to load
 * says something false about the data.
 */
export function ExerciseHistoryBody({ exerciseId, exerciseName, accent = STEEL }: {
  exerciseId: string | null
  exerciseName: string
  /** The muscle group's colour, so a lift looks like its section. */
  accent?: string
}) {
  const { data, isPending } = useExerciseHistory(exerciseId)
  const unit = weightUnit()
  const uid = useId().replace(/:/g, '')
  const unloaded = isUnloadedExercise(exerciseName)

  const timeline = data?.timeline ?? []
  const r = data?.records

  // One shape for both hero series, so the chart has a single generic.
  // `> 0`, not `!= null`. Zero is the sentinel the column actually stores.
  //
  // ── THE SESSION'S STRENGTH, NOT ITS BEST SET ────────────────────────────────
  // This plotted `best_1rm`, a MAX over the day. Under double progression the
  // top set reaches the rep ceiling first and then stays there for weeks while
  // the later sets climb toward it, so the max freezes and the curve goes flat
  // through a block of genuine progress — DB Hammer Curl held exactly 28.0 kg
  // across five sessions while set 3 went 9 → 10 → 11 → 11 → 12.
  //
  // `avg_1rm` is the mean over the day's working sets: it moves when any set
  // moves. It is optional because it comes from a replaced RPC — a database
  // still on the old function omits it and this falls back to the old series
  // rather than drawing nothing.
  const heroE1rm = (p: (typeof timeline)[number]) => p.avg_1rm ?? p.best_1rm
  const e1rmData = timeline
    .filter((p) => (heroE1rm(p) ?? 0) > 0)
    .map((p) => ({ date: shortDate(p.day), value: displayWeight(heroE1rm(p)!) ?? 0 }))

  const volumeData = timeline
    .filter((p) => p.session_volume != null && p.session_volume > 0)
    .map((p) => ({ date: shortDate(p.day), volume: Math.round(displayWeight(p.session_volume!) ?? 0) }))

  const repsData = timeline
    .filter((p) => p.reps != null && p.reps > 0)
    .map((p) => ({ date: shortDate(p.day), value: p.reps! }))

  const bestReps = repsData.length ? Math.max(...repsData.map((p) => p.value)) : null

  if (isPending) {
    return <div className="h-64 animate-pulse rounded-xl bg-white/[0.04]" aria-hidden="true" />
  }

  const hero = unloaded
    ? { data: repsData, label: 'Reps per session', unit: '' }
    : { data: e1rmData, label: `Estimated 1RM · ${unit}`, unit }

  /**
   * ── THE 1RM CURVE WAS FLAT BECAUSE THE AXIS STARTED AT ZERO ────────────────
   * Recharts' automatic domain for an area series is zero-based, and an
   * estimated 1RM is a number that lives between about 40 and 60 and moves by
   * fractions of a kilo. Zero-based, a genuine four-kilo climb across two
   * months is a 7% wiggle in the top fifth of the chart with four fifths of
   * empty axis underneath it — the exact failure `niceDomain` was written for
   * on the volume chart, on the one chart where the movement is smallest and
   * therefore matters most.
   *
   * `padPct: 0.15` rather than the default 0.1: this series is short (one point
   * per session) and its extremes are usually the most recent point, so a
   * little more headroom keeps the newest value off the frame.
   *
   * `hardMin: 0` because a negative 1RM is not a thing; on a series that
   * genuinely sits near zero the padding must not invent one.
   */
  const heroDomain = niceDomain(hero.data.map((d) => d.value), { padPct: 0.15, hardMin: 0 })

  /**
   * The axis is as wide as its widest label.
   *
   * `width={34}` with `margin.left: -18` was a net 16px for the numbers, and
   * `112.5` needs more than that — so the axis clipped, which is what "cuts off
   * numbers" is. The negative margin was there to claw back the gutter recharts
   * reserves; it was taking it out of the labels.
   *
   * Sized from the actual domain instead: the tick text is 10px, digits at that
   * size run about 6px, and 14px covers the tick gap and the decimal point.
   */
  const axisWidth = (values: number[]) => {
    const longest = values.reduce((n, v) => Math.max(n, Math.round(v).toString().length), 1)
    return Math.min(56, longest * 6 + 14)
  }
  const heroAxisWidth = axisWidth(heroDomain)

  /**
   * ── THE RECORD STRIP ────────────────────────────────────────────────────────
   * The three numbers you opened this page for, first.
   *
   * They used to sit ~300px down, below a 170px chart and a 120px bar chart, as
   * a 2×2 of bordered tinted tiles — four boxes of equal visual weight, told
   * apart only by one of them being gold. Four framed tiles is a lot of
   * furniture around twelve characters of data, so the frames are gone: the
   * numbers are separated by hairlines and sized by importance instead.
   *
   * Only the est-1RM carries the accent, and the accent is the EXERCISE's own
   * hue rather than GOLD — gold means a personal record app-wide.
   */
  const strip: Array<{ label: string; value: string; unit?: string; note?: string; accent?: boolean }> = [
    {
      label: 'Heaviest',
      value: !unloaded && r?.heaviest_weight ? `${displayWeight(r.heaviest_weight)}` : '—',
      unit,
    },
    unloaded
      ? { label: 'Most reps in a session', value: bestReps != null ? bestReps.toLocaleString() : '—', accent: true }
      : {
        label: 'Best est-1RM',
        value: r?.best_1rm ? `${displayWeight(r.best_1rm)}` : '—',
        unit,
        accent: true,
        note: r?.best_1rm ? undefined : 'no estimate yet',
      },
    {
      label: 'Best session vol',
      value: r?.best_session_volume ? `${Math.round(displayWeight(r.best_session_volume) ?? 0).toLocaleString()}` : '—',
      unit,
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <div className="grid grid-cols-3">
          {strip.map((c, i) => (
            <div key={c.label} className={i > 0 ? 'pl-3 border-l border-white/[0.07]' : 'pr-3'}>
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted leading-tight">
                {c.label}
              </span>
              <div
                className="helix-num font-bold text-fluid-xl tabular-nums leading-none mt-1.5"
                style={{ color: c.accent && c.value !== '—' ? accent : 'var(--color-text)' }}
              >
                {c.value}
                {c.unit && c.value !== '—' && (
                  <span className="text-[10px] text-muted font-normal ml-1">{c.unit}</span>
                )}
              </div>
              {c.note && <span className="block text-[9px] text-muted mt-1">{c.note}</span>}
            </div>
          ))}
        </div>

        {/* The caveats, demoted. Both are real numbers, but neither is a headline:
            one is a per-side figure that reads as a total, the other is a
            lifetime count that only moves in one direction. */}
        <p className="mt-3 pt-2.5 border-t border-white/[0.06] text-[11px] text-muted flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span>
            <span className="uppercase tracking-wide text-[10px] font-bold">Heaviest single set</span>{' '}
            <span className="helix-num text-text tabular-nums">
              {r?.best_set_volume ? `${Math.round(displayWeight(r.best_set_volume) ?? 0).toLocaleString()}${unit}` : '—'}
            </span>
          </span>
          <span>
            <span className="uppercase tracking-wide text-[10px] font-bold">Total reps</span>{' '}
            <span className="helix-num text-text tabular-nums">{(r?.total_reps ?? 0).toLocaleString()}</span>
          </span>
          {/* The RPC does not collapse L/R pairs the way volumeCredits does, and
              exposes no pair_id to let us. Say so rather than imply a total. */}
          <span className="flex items-center gap-1 text-muted/70">
            <Info className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
            Unilateral lifts count each side separately.
          </span>
        </p>
      </div>

      {/* Hero trend — 1RM for a loaded lift, reps for one you cannot load.
          Below the records now: a trend answers "where is this going", which is
          the second question, not the first. */}
      {hero.data.length >= 2 ? (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: accent }} /> {hero.label}
          </p>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={hero.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`heroFill-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} tickMargin={6} />
              <YAxis
                tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false}
                width={heroAxisWidth}
                domain={heroDomain}
                // `allowDecimals` off for a rep count, on for a load: reps are
                // whole and a `10.5` tick on them is a value that cannot occur.
                allowDecimals={!unloaded}
                tickFormatter={(v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area isAnimationActive={false} type="monotone" dataKey="value" name={hero.label}
                unit={hero.unit} stroke={accent} strokeWidth={2} fill={`url(#heroFill-${uid})`} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-fluid-sm text-muted text-center py-4">Not enough history yet — log this lift a few more times.</p>
      )}

      {/* Session volume answers "am I doing more work", which a 1RM curve cannot. */}
      {volumeData.length >= 2 && (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" style={{ color: accent }} /> Session volume · {unit}
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={volumeData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} tickMargin={6} />
              {/* Same clipping fix, and deliberately NOT the same domain fix: a
                  bar encodes its magnitude as a LENGTH, so lifting the baseline
                  off zero would make a 5% difference look like a doubling. The
                  line above is free to float because a line encodes SLOPE. */}
              <YAxis
                tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false}
                width={axisWidth(volumeData.map((d) => d.volume))}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar isAnimationActive={false} dataKey="volume" name="volume" unit={unit} fill={accent} fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── THE "RECENT SESSIONS" LIST LEFT ──
          Eight rows of date · top weight · session volume · reps: the two charts
          directly above it, printed as numbers. It was the closest thing this
          page had to a training log, which is exactly why it looked like one and
          answered none of a log's questions — it could not say what the third
          set was, or how many sets there were.

          The History tab does that now, from the sets themselves. This tab keeps
          what it is actually for: the records, and which way they are moving. */}
    </div>
  )
}
