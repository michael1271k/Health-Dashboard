'use client'

import { useState } from 'react'
import { KineticNumber } from '@/components/fx/KineticNumber'
import { EMERALD, GOLD, OXIDE, MUTED } from '@/lib/theme/palette'

/**
 * The pieces every widget body is built from.
 *
 * One file rather than one per shape, because the point of them is that they
 * AGREE: a number is the same size in Vitals as in Fuel, a delta is the same
 * arrow everywhere, and a bar and a ring share their track colour. Thirteen
 * bodies each inventing its own 11px label is how a grid stops reading as one
 * surface.
 */

/** The hero figure of a widget. Kinetic when numeric, inert when it is a word. */
export function Hero({ value, unit, color, decimals = 0, tight }: {
  value: number | string | null
  unit?: string
  color?: string
  decimals?: number
  /** Medium/large bodies that carry a shape underneath want a smaller hero. */
  tight?: boolean
}) {
  const size = tight ? 'text-fluid-lg' : 'text-fluid-xl'
  return (
    <span className={`helix-num font-bold leading-none tabular-nums ${size} truncate`} style={{ color }}>
      {value == null
        ? <span className="text-muted">—</span>
        : typeof value === 'number' ? <KineticNumber value={value} decimals={decimals} /> : value}
      {unit && value != null && (
        <span className="text-[10px] font-normal text-muted ml-1">{unit}</span>
      )}
    </span>
  )
}

/**
 * A change against a baseline, as the arrow it is.
 *
 * `higherIsBetter` is per-metric and not negotiable at the call site's whim: a
 * rising HRV is progress and a rising resting heart rate is not, and a widget
 * that painted both green would be worse than one that painted neither.
 */
export function Trend({ delta, higherIsBetter = true, unit, decimals = 0 }: {
  delta: number | null
  higherIsBetter?: boolean
  unit?: string
  decimals?: number
}) {
  if (delta == null || delta === 0) {
    return <span className="text-[9px] text-muted/50 tabular-nums">—</span>
  }
  const good = higherIsBetter ? delta > 0 : delta < 0
  return (
    <span
      className="helix-num text-[9px] font-bold tabular-nums whitespace-nowrap"
      style={{ color: good ? EMERALD : OXIDE }}
    >
      {delta > 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(decimals)}{unit}
    </span>
  )
}

/**
 * The inline sparkline.
 *
 * ── WHY THE CHARTS LOOKED CROOKED ────────────────────────────────────────────
 * The old one drew into `viewBox="0 0 80 32"` with `preserveAspectRatio="none"`,
 * which tells the browser to stretch the drawing to whatever box it lands in.
 * A 1×1 tile and a 2×2 tile have different aspect ratios, so the SAME series
 * came out at two different slants — and any slope steep enough to matter came
 * out exaggerated in one and flattened in the other. `vectorEffect` kept the
 * STROKE even, which is why it read as "distorted" rather than as obviously
 * broken.
 *
 * `preserveAspectRatio="none"` is correct for a bar that must fill its box. It
 * is never correct for a LINE, whose whole meaning is its angle. This one keeps
 * the aspect (`xMidYMid meet`) and lets the viewBox itself be the tile's shape,
 * so a rise of 4% looks like a rise of 4% at every size.
 *
 * Gaps are gaps: a day with no reading breaks the path rather than being
 * interpolated across, because a straight line through a missing day is a claim
 * about a day that has no data.
 */
export function Spark({ series, color, height = 28 }: {
  series: Array<number | null>
  color: string
  height?: number
}) {
  const pts = series.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) return <div style={{ height }} aria-hidden="true" />

  const W = 100
  const H = 32
  const PAD = 3
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = max - min || 1
  const n = Math.max(1, series.length - 1)
  const x = (i: number) => (i / n) * (W - PAD * 2) + PAD
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)

  // One `M` per contiguous run, so a missing day is a break and not a bridge.
  let d = ''
  let open = false
  for (const s of series.map((v, i) => ({ v, i }))) {
    if (s.v == null) { open = false; continue }
    d += `${open ? 'L' : 'M'}${x(s.i).toFixed(2)} ${y(s.v).toFixed(2)} `
    open = true
  }
  const last = pts[pts.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      style={{ height }}
      aria-hidden="true"
    >
      <path d={d.trim()} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"
        strokeLinejoin="round" opacity="0.9" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2" fill={color}
        style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
    </svg>
  )
}

/**
 * One cell of a 2×2 — a label, a number, and where it is going.
 *
 * The sparkline is optional and TINY on purpose: at this size it is a gesture,
 * not a chart. It says "settled" or "climbing"; the number says how much.
 */
export function Cell({ label, value, unit, color, delta, higherIsBetter, series, decimals = 0 }: {
  label: string
  value: number | string | null
  unit?: string
  color: string
  delta?: number | null
  higherIsBetter?: boolean
  series?: Array<number | null>
  decimals?: number
}) {
  return (
    <span className="min-w-0 flex flex-col justify-center gap-0.5">
      <span className="flex items-baseline gap-1 min-w-0">
        <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted truncate">{label}</span>
        {delta !== undefined && (
          <span className="ml-auto shrink-0"><Trend delta={delta ?? null} higherIsBetter={higherIsBetter} decimals={decimals} /></span>
        )}
      </span>
      <span className="helix-num font-bold text-[15px] leading-none tabular-nums truncate" style={{ color: value == null ? MUTED : color }}>
        {value == null ? '—' : value}
        {unit && value != null && <span className="text-[9px] font-normal text-muted ml-0.5">{unit}</span>}
      </span>
      {series && series.filter((v) => v != null).length > 1 && (
        <Spark series={series} color={color} height={12} />
      )}
    </span>
  )
}

/**
 * A progress bar with a target.
 *
 * The fill can exceed 100% and is clamped for DRAWING only — the label still
 * says the real number, because a widget that silently pins at full is a widget
 * that stops distinguishing "hit it" from "doubled it". Over-target paints in
 * its own colour rather than the metric's, which is how a calorie overshoot is
 * legible without reading the digits.
 */
export function Bar({ value, target, color, over }: {
  value: number | null
  target: number | null
  color: string
  /** Colour to use past the target. Absent = the target is a floor, not a cap. */
  over?: string
}) {
  const pct = value != null && target ? (value / target) * 100 : 0
  const drawn = Math.max(0, Math.min(100, pct))
  return (
    <span className="block relative h-1.5 rounded-full overflow-hidden bg-white/[0.07]" aria-hidden="true">
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
        style={{ width: `${drawn}%`, background: over && pct > 100 ? over : color }}
      />
    </span>
  )
}

/**
 * A concentric progress ring.
 *
 * SVG rather than a conic gradient: a conic needs a mask to become a ring and
 * the mask is what breaks in Safari, and a stroked circle gives the rounded cap
 * that makes a part-filled arc read as a dial rather than as a pie slice.
 *
 * `r` is the radius in a fixed 100×100 box, so several rings nest by passing
 * different radii and the same box.
 */
export function Ring({ pct, color, r, width = 7, track = 'rgba(255,255,255,0.07)' }: {
  pct: number | null
  color: string
  r: number
  width?: number
  track?: string
}) {
  const c = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(1, (pct ?? 0) / 100))
  return (
    <>
      <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={width} />
      <circle
        cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - filled)}
        // Zero is 12 o'clock, filling clockwise — the direction every ring in
        // the app already turns, and the one iOS uses.
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.2,0,0,1)' }}
      />
    </>
  )
}

/** Mean of the values that exist, or null when none do. */
export function mean(vals: Array<number | null | undefined>): number | null {
  const ok = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null
}

/**
 * Today against the mean of the days BEFORE it.
 *
 * Excluding today from its own baseline is the whole point: a seven-day mean
 * that includes today is a mean today is being compared against itself inside,
 * which damps every real move and makes a genuinely bad night look average.
 */
export function vsBaseline(series: Array<number | null>, today: number | null): number | null {
  if (today == null) return null
  const base = mean(series.slice(0, -1))
  if (base == null) return null
  return Math.round((today - base) * 10) / 10
}


/* ────────────────────────────────────────────────────────────────────────────
 * SHAPES THE TILES SHARE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The half-arc, divided into its constituents.
 *
 * ── WHY A SEMICIRCLE AND NOT A FULL RING ─────────────────────────────────────
 * A full ring costs a square, and a square in a 358×172 tile leaves a column
 * barely wide enough for the legend beside it — which is exactly how the Sleep
 * tile ended up with a huge dial and four cramped rows. A half-arc carries the
 * same "fraction of a target" reading in half the vertical space, and the hole
 * underneath it is the natural place for the number. It is the shape Apple's
 * own sleep summary uses, for the same reason.
 *
 * ── THE SEGMENTS DIVIDE THE FILL, NOT THE ARC ────────────────────────────────
 * The swept fraction is `total / goal`, so a short night draws a short arc — the
 * grade is still legible at a glance. The stage segments then divide THAT sweep
 * in proportion to each stage's share of the night, so a night that is 20 % deep
 * shows a fifth of whatever arc it earned in the deep hue. Dividing the whole
 * semicircle instead would draw every night at full length and throw away the
 * only reading the arc is there to give.
 *
 * Drawn as one path per segment with `stroke-dasharray` offsets along a shared
 * geometry, so the segments cannot drift apart at different radii.
 */
export function HalfArc({ pct, segments, track = 'rgba(255,255,255,0.07)', width = 9, children }: {
  /** 0-100 of the goal. Clamped for drawing; over-target simply fills. */
  pct: number | null
  /** Ordered constituents. `value` is a share, in any unit — they are normalised. */
  segments: Array<{ key: string; value: number; color: string }>
  track?: string
  width?: number
  /** Rendered in the bowl under the arc. */
  children?: React.ReactNode
}) {
  const R = 42
  const CX = 50
  const CY = 50
  const LEN = Math.PI * R
  const d = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`
  const filled = Math.max(0, Math.min(1, (pct ?? 0) / 100))
  const total = segments.reduce((n, s) => n + Math.max(0, s.value), 0)

  let run = 0
  const drawn = total > 0
    ? segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const len = (s.value / total) * filled * LEN
        const at = run
        run += len
        return { ...s, len, at }
      })
    : []

  return (
    <span className="relative block w-full">
      <svg viewBox="0 0 100 56" className="w-full block" aria-hidden="true">
        <path d={d} fill="none" stroke={track} strokeWidth={width} strokeLinecap="round" />
        {drawn.map((s) => (
          <path
            key={s.key}
            d={d}
            fill="none"
            stroke={s.color}
            strokeWidth={width}
            // Butt ends between segments — a rounded cap on an interior segment
            // would overlap its neighbour and read as a gap.
            strokeLinecap="butt"
            strokeDasharray={`${s.len} ${LEN}`}
            strokeDashoffset={-s.at}
            style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.2,0,0,1)' }}
          />
        ))}
        {/* A single continuous arc when there is nothing to divide — a total
            with no stage breakdown is still a total. */}
        {!drawn.length && filled > 0 && (
          <path
            d={d} fill="none" stroke={segments[0]?.color ?? '#fff'} strokeWidth={width} strokeLinecap="round"
            strokeDasharray={`${filled * LEN} ${LEN}`}
          />
        )}
      </svg>
      {children && (
        <span className="absolute inset-x-0 bottom-0 grid place-items-center pointer-events-none pb-0.5">
          {children}
        </span>
      )}
    </span>
  )
}

/**
 * One Apple-Health-style reading box.
 *
 * ── WHY A BOX AND NOT A ROW ──────────────────────────────────────────────────
 * Vitals' four readings were four label/number pairs on a bare tile, which made
 * them read as one list of four lines rather than as four independent
 * measurements. Health draws each metric on its own card because each one comes
 * from a different sensor, has a different unit and a different normal range,
 * and the container is what says so before a single digit is read.
 *
 * The tint is the metric's own hue at 8 % over the tile's gradient, so the four
 * boxes are distinguishable from each other and from the tile without any of
 * them shouting.
 */
export function StatTile({ label, value, unit, color, delta, higherIsBetter, series, decimals = 0 }: {
  label: string
  value: number | string | null
  unit?: string
  color: string
  delta?: number | null
  higherIsBetter?: boolean
  series?: Array<number | null>
  decimals?: number
}) {
  return (
    <span
      className="min-w-0 flex flex-col justify-between rounded-lg px-1.5 py-1 overflow-hidden"
      style={{ background: `${color}12`, border: `1px solid ${color}24` }}
    >
      <span className="flex items-baseline gap-1 min-w-0">
        <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted truncate">{label}</span>
        {delta !== undefined && (
          <span className="ml-auto shrink-0">
            <Trend delta={delta ?? null} higherIsBetter={higherIsBetter} decimals={decimals} />
          </span>
        )}
      </span>
      <span className="flex items-baseline gap-0.5 min-w-0">
        <span className="helix-num font-bold text-[15px] leading-none tabular-nums truncate"
          style={{ color: value == null ? MUTED : color }}>
          {value == null ? '—' : value}
        </span>
        {unit && value != null && <span className="text-[8px] text-muted shrink-0">{unit}</span>}
      </span>
      {series && series.filter((v) => v != null).length > 1 && (
        <Spark series={series} color={color} height={11} />
      )}
    </span>
  )
}

/**
 * A month of daily bars.
 *
 * ── A BAR CHART, NOT A SPARKLINE, AND THE DIFFERENCE MATTERS ─────────────────
 * A line implies the quantity between two readings is meaningful — that you
 * were somewhere between 6,000 and 9,000 steps at four in the morning. Steps
 * are a daily COUNT: thirty separate answers, each of which either cleared the
 * goal or did not. Bars say that; a line says the wrong thing about the same
 * numbers.
 *
 * Which is also why the goal is drawn as a hairline across the chart rather than
 * as a colour: the reading the user wants is "how many bars cross the line", and
 * a line is the only mark that lets them count it without a legend.
 */
export function MiniBars({ series, color, goal, height = 30, dim = 'rgba(255,255,255,0.14)', colors, marks }: {
  series: Array<number | null>
  color: string
  /** Draws the target hairline and decides which bars are lit. Absent = all lit. */
  goal?: number | null
  height?: number
  dim?: string
  /**
   * Per-bar colour, parallel to `series`. When given it OVERRIDES the goal-lit
   * rule, because the two say different things and a bar cannot say both: with
   * colours the bar's hue is its identity (which session this was), and lighting
   * by goal on top of that would mean the same hue at two brightnesses was two
   * different facts.
   */
  colors?: Array<string | null | undefined>
  /**
   * Bars to flag — a record was set that day. Drawn as a notch above the bar
   * rather than as a colour, since the colour is already spoken for.
   */
  marks?: boolean[]
}) {
  const vals = series.filter((v): v is number => v != null && Number.isFinite(v))
  if (!vals.length) return <div style={{ height }} aria-hidden="true" />
  const max = Math.max(...vals, goal ?? 0) || 1
  const goalPct = goal ? Math.min(100, (goal / max) * 100) : null

  return (
    <span className="relative flex items-end gap-[1.5px] w-full" style={{ height }} aria-hidden="true">
      {series.map((v, i) => (
        <span
          key={i}
          className="flex-1 min-w-0 rounded-[1px]"
          style={{
            // A missing day is a 1px stub, not a zero-height gap: a gap in a bar
            // chart reads as a day of no steps, which is a different claim.
            height: v == null ? '1px' : `${Math.max(2, (v / max) * 100)}%`,
            background: v == null
              ? 'rgba(255,255,255,0.08)'
              : colors
                ? (colors[i] ?? dim)
                : goal != null && v >= goal ? color : dim,
          }}
        />
      ))}
      {marks?.some(Boolean) && (
        <span className="absolute inset-0 flex items-start gap-[1.5px] pointer-events-none">
          {marks.map((m, i) => (
            <span key={i} className="flex-1 min-w-0 flex justify-center">
              {m && <span className="block rounded-full" style={{ width: 3, height: 3, background: GOLD }} />}
            </span>
          ))}
        </span>
      )}
      {goalPct != null && (
        <span
          className="absolute inset-x-0 h-px pointer-events-none"
          style={{ bottom: `${goalPct}%`, background: `${color}66` }}
        />
      )}
    </span>
  )
}

/**
 * A progress track with named waypoints along it.
 *
 * A bar says how far through you are; it does not say what "through" is worth.
 * On steps the intermediate figures are the ones a person actually reasons in —
 * "I'm past six" — so the marks are labelled and the ones you have passed are
 * lit. It is the same information the bar already carried, made countable.
 */
export function Milestones({ value, marks, color, unit = 'k' }: {
  value: number | null
  /** Ascending. The last is the goal and defines the full width of the track. */
  marks: number[]
  color: string
  unit?: string
}) {
  const goal = marks[marks.length - 1] ?? 0
  const v = value ?? 0
  const pct = goal > 0 ? Math.max(0, Math.min(100, (v / goal) * 100)) : 0

  return (
    <span className="block w-full">
      <span className="relative block h-1.5 rounded-full overflow-hidden bg-white/[0.07]" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </span>
      {/* ── THE MARKS ARE POSITIONED, NOT DISTRIBUTED ──
          They were `flex-1` cells, which spaces them EVENLY — correct only when
          the waypoints happen to be evenly spaced. `stepMarks` rounds its
          interval to 500, so a 7,000-step goal yields 1500/3000/4500/6000/7000,
          whose last gap is two thirds of the others. Drawn as equal cells, the
          6k tick would sit at 80 % of a track where 6k is really 86 % — a mark
          claiming a position it does not have, on the one control whose entire
          job is saying where you are. Each is placed at its own fraction. */}
      <span className="relative block h-[13px] mt-0.5">
        {marks.map((mk, i) => {
          const passed = v >= mk
          const at = goal > 0 ? (mk / goal) * 100 : 0
          const last = i === marks.length - 1
          return (
            <span
              key={mk}
              className="absolute top-0 flex flex-col items-center"
              // The final mark sits ON the right edge, so it is pulled fully
              // inside rather than centred half outside the track.
              style={{ left: `${at}%`, transform: last ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              <span
                className="w-px h-1"
                style={{ background: passed ? color : 'rgba(255,255,255,0.18)' }}
                aria-hidden="true"
              />
              <span
                className="helix-num text-[8px] tabular-nums leading-none mt-0.5"
                style={{ color: passed ? color : 'var(--color-muted)' }}
              >
                {/* `Math.round` printed 1,500 as "2k" and 4,500 as "5k" — a
                    mark labelled with a number it is not. A half-thousand keeps
                    its decimal; a whole one never grows a trailing ".0". */}
                {mk >= 1000
                  ? `${mk % 1000 === 0 ? mk / 1000 : (mk / 1000).toFixed(1)}${unit}`
                  : mk}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}

/**
 * A continuous trend line with dated ticks and points you can touch.
 *
 * ── WHY THIS ONE BRIDGES GAPS AND `Spark` REFUSES TO ─────────────────────────
 * `Spark` breaks its path on a missing day, deliberately: a straight line drawn
 * through a day with no steps is a claim about a day that has no data.
 *
 * Body weight is the opposite kind of quantity. You do not stop having a weight
 * on the mornings you skip the scale — the reading is missing, the VALUE is not
 * — so a broken line said "your weight ceased to exist on Tuesday", which is
 * how the 30-day weight chart came to look shattered on a body that had simply
 * been weighed sixteen times in thirty days. Here the line is drawn through the
 * days that were measured, in order, and the days between them carry no MARK.
 * The line is an interpolation and the dots are the evidence, which is exactly
 * the distinction the chart needs to make.
 *
 * ── AND WHY THE POINTS ARE TAPPABLE ──────────────────────────────────────────
 * A 30-day line answers "which way" and cannot answer "what was I on the 12th",
 * which is the follow-up question every trend provokes. Each measured day is a
 * real hit target; tapping it names the day and the number above the line. No
 * hover: a phone has no hover, and a chart whose detail is hover-only has no
 * detail on the device it is mostly read on.
 */
export function LineChart({ series, color, height = 64, decimals = 1, unit, formatX }: {
  /** Dated readings, oldest first. `value: null` = not measured that day. */
  series: Array<{ date: string; value: number | null }>
  color: string
  height?: number
  decimals?: number
  unit?: string
  /** `2026-08-25` → the axis label. Defaults to `25 Aug`. */
  formatX?: (iso: string) => string
}) {
  const [picked, setPicked] = useState<number | null>(null)

  const pts = series
    .map((d, i) => ({ ...d, i }))
    .filter((d): d is { date: string; value: number; i: number } => d.value != null)

  if (pts.length < 2) return <div style={{ height }} aria-hidden="true" />

  const W = 100
  const H = 40
  const PAD_Y = 5
  const min = Math.min(...pts.map((p) => p.value))
  const max = Math.max(...pts.map((p) => p.value))
  const span = max - min || 1
  const n = Math.max(1, series.length - 1)
  const x = (i: number) => (i / n) * W
  const y = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2)

  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ')
  // The fill is the same path closed to the floor — it is what makes a
  // three-kilo range over a month read as a slope rather than as a wobble.
  const area = `${d} L${x(pts[pts.length - 1].i).toFixed(2)} ${H} L${x(pts[0].i).toFixed(2)} ${H} Z`

  const fmtX = formatX ?? ((iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))

  const at = picked != null ? pts.find((p) => p.i === picked) ?? null : null
  const gid = `lc-${color.replace('#', '')}`

  return (
    <span className="block w-full">
      <span className="relative block w-full" style={{ height }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-full block"
          role="img"
          aria-label={`Trend from ${pts[0].value.toFixed(decimals)} to ${pts[pts.length - 1].value.toFixed(decimals)}`}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
          <path
            d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"
            strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          />
          {pts.map((p) => (
            <circle
              key={p.i}
              cx={x(p.i)} cy={y(p.value)}
              // `preserveAspectRatio="none"` stretches the box, which would
              // squash a circle into an ellipse — the marks are drawn as tiny
              // rects for that reason, sized in the stretched space.
              r={0}
              fill={color}
            />
          ))}
        </svg>

        {/* The hit targets sit in HTML above the SVG rather than inside it: a
            44px tap target cannot be expressed in a viewBox that is 100 units
            wide, and shrinking the target to the dot's size would make the
            chart untappable in practice. */}
        {pts.map((p) => (
          <button
            key={p.i}
            type="button"
            onClick={(e) => { e.stopPropagation(); setPicked(picked === p.i ? null : p.i) }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center"
            style={{ left: `${x(p.i)}%`, top: `${(y(p.value) / H) * 100}%`, width: 22, height: 22 }}
            aria-label={`${fmtX(p.date)}: ${p.value.toFixed(decimals)}${unit ?? ''}`}
          >
            <span
              className="block rounded-full transition-transform"
              style={{
                width: picked === p.i ? 7 : 4,
                height: picked === p.i ? 7 : 4,
                background: color,
                boxShadow: picked === p.i ? `0 0 6px ${color}` : undefined,
              }}
            />
          </button>
        ))}

        {at && (
          <span
            className="absolute z-[2] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md px-1.5 py-0.5
                       text-[9px] font-bold bg-black/80 border border-white/15 text-text pointer-events-none"
            style={{ left: `${Math.min(88, Math.max(12, x(at.i)))}%`, top: `${(y(at.value) / H) * 100 - 6}%` }}
          >
            <span className="helix-num tabular-nums" style={{ color }}>
              {at.value.toFixed(decimals)}{unit}
            </span>
            <span className="text-muted ml-1">{fmtX(at.date)}</span>
          </span>
        )}
      </span>

      {/* Three ticks, not thirty. The axis is there to say WHEN the line starts
          and ends, which two labels and a midpoint answer completely; a label
          per day at this width is a grey smear. */}
      <span className="flex items-baseline justify-between pt-0.5 text-[8px] text-muted tabular-nums">
        <span>{fmtX(series[0].date)}</span>
        <span>{fmtX(series[Math.floor(series.length / 2)].date)}</span>
        <span>{fmtX(series[series.length - 1].date)}</span>
      </span>
    </span>
  )
}

/**
 * Days as columns above and below a baseline.
 *
 * ── A CALORIE HISTORY IS NOT A LINE, IT IS A VERDICT PER DAY ─────────────────
 * The Fuel tile used to draw seven days of intake as a sparkline, which is the
 * wrong shape twice: it implies a value between Tuesday and Wednesday, and it
 * plots the intake ALONE, so a 2,100 kcal day looked identical whether the
 * target was 1,900 or 2,400. What the reader wants is the only thing that
 * matters on a cut — did this day come in under, and by how much.
 *
 * So the baseline IS the target, each day is a column from it, under is the
 * metric's own hue and over is oxide, and the eye reads the week as a row of
 * verdicts. The same shape serves the energy ledger, where the quantity really
 * is signed.
 */
export function BalanceBars({ values, under, over, height = 44, zeroLabel, dimBefore = 0 }: {
  /** Signed, oldest first. Negative = below the line. `null` = no data. */
  values: Array<number | null>
  under: string
  over: string
  height?: number
  /** Printed against the baseline, e.g. the target itself. */
  zeroLabel?: string
  /**
   * How many leading bars belong to a PREVIOUS regime, drawn at reduced opacity.
   *
   * The deficit ledger reaches back past a phase boundary when the current phase
   * is too young to yield a rate on its own. Those days are in the average, so
   * they must be in the chart — but a maintenance week's eating rendered
   * identically to a cut's would make the boundary invisible in the one picture
   * that exists to show what changed.
   */
  dimBefore?: number
}) {
  const real = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!real.length) return <div style={{ height }} aria-hidden="true" />
  const scale = Math.max(...real.map((v) => Math.abs(v))) || 1

  return (
    <span className="block w-full">
      <span className="relative block w-full" style={{ height }} aria-hidden="true">
        {/* The baseline, and the two halves it divides. */}
        <span className="absolute inset-x-0 top-1/2 h-px" style={{ background: 'rgba(255,255,255,0.18)' }} />
        <span className="absolute inset-0 flex items-center gap-[2px]">
          {values.map((v, i) => {
            const h = v == null ? 0 : (Math.abs(v) / scale) * 50
            return (
              <span key={i} className="relative flex-1 min-w-0 h-full">
                {v == null ? (
                  <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2"
                    style={{ background: 'rgba(255,255,255,0.08)' }} />
                ) : (
                  <span
                    className="absolute left-0 right-0 rounded-[1px]"
                    style={{
                      height: `${Math.max(2, h)}%`,
                      background: v <= 0 ? under : over,
                      opacity: i < dimBefore ? 0.32 : 1,
                      ...(v <= 0 ? { top: '50%' } : { bottom: '50%' }),
                    }}
                  />
                )}
              </span>
            )
          })}
        </span>
      </span>
      {zeroLabel && (
        <span className="block text-[8px] text-muted tabular-nums pt-0.5">{zeroLabel}</span>
      )}
    </span>
  )
}

/** One day of the consistency grid. */
export interface ConsistencyDay {
  date: string
  /** `trained` = a scheduled session was logged · `rest` = a prescribed rest day
   *  · `missed` = a scheduled session that never happened · `future` = not yet. */
  state: 'trained' | 'rest' | 'missed' | 'future'
  color?: string
}

/**
 * A year of showing up, one cell per day.
 *
 * ── A PRESCRIBED REST DAY IS A FILLED CELL ───────────────────────────────────
 * This is the decision the whole chart turns on. A calendar that only lights up
 * on training days grades a five-day program as 71 % forever, and worse, it
 * teaches the reader that Wednesday is a hole — which is the exact belief that
 * makes people train on the day the program told them to recover. Rest that the
 * plan ASKED FOR is adherence, so it fills, at a lower opacity so the shape of
 * the training week is still legible through it. Only a scheduled session that
 * never happened leaves an empty cell.
 *
 * Columns are weeks and rows are weekdays, the orientation every contribution
 * grid uses, because it makes a missed Tuesday sit in the same row as every
 * other Tuesday — a broken habit shows up as a horizontal streak.
 */
export function Heatmap({ days, weeks, cell = 7, gap = 2, labels = false }: {
  /** Ascending. Padded internally so the first column starts on a Sunday. */
  days: ConsistencyDay[]
  /** How many trailing weeks to draw. */
  weeks: number
  cell?: number
  gap?: number
  /**
   * Draw weekday and month guides, and centre the grid in its box.
   *
   * Off at size S, where the cells are 5px and a label would be taller than the
   * chart it labels. On at M and L, where an unlabelled grid means counting rows
   * with a finger to work out which one is Tuesday.
   */
  labels?: boolean
}) {
  if (!days.length) return null
  const byDate = new Map(days.map((d) => [d.date, d]))
  const last = days[days.length - 1]
  const end = new Date(`${last.date}T12:00:00Z`)
  // Wind back to the Sunday that starts the earliest column, so every column is
  // a whole week and the weekday rows line up.
  const startOffset = end.getUTCDay() + (weeks - 1) * 7
  const cols: Array<Array<ConsistencyDay | null>> = []
  for (let w = 0; w < weeks; w += 1) {
    const col: Array<ConsistencyDay | null> = []
    for (let dow = 0; dow < 7; dow += 1) {
      const back = startOffset - (w * 7 + dow)
      const at = new Date(end)
      at.setUTCDate(end.getUTCDate() - back)
      const iso = at.toISOString().slice(0, 10)
      col.push(byDate.get(iso) ?? null)
    }
    cols.push(col)
  }

  // Month guides: the column where a new month first appears, so the strip below
  // the grid says WHEN without a per-column label nothing could read.
  const monthMarks = cols.map((col, w) => {
    const first = col.find(Boolean)
    if (!first) return null
    const m = new Date(`${first.date}T12:00:00Z`).getUTCMonth()
    const prev = cols[w - 1]?.find(Boolean)
    const prevM = prev ? new Date(`${prev.date}T12:00:00Z`).getUTCMonth() : -1
    return m === prevM ? null : new Date(`${first.date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short' })
  })

  // Sunday-first, matching the column build above. Only M/W/F are labelled: at
  // 4px a cell is shorter than the type, so every row cannot carry one and the
  // three that do are enough to count from.
  const DOW = ['', 'M', '', 'W', '', 'F', '']

  return (
    <span className={`block overflow-hidden ${labels ? 'flex flex-col items-center' : ''}`} aria-hidden="true">
      <span className="flex" style={{ gap }}>
        {labels && (
          <span className="flex flex-col shrink-0 mr-1" style={{ gap }}>
            {DOW.map((d, i) => (
              <span key={i} className="flex items-center justify-end text-[7px] font-bold text-muted/70 leading-none"
                style={{ height: cell, width: 7 }}>{d}</span>
            ))}
          </span>
        )}
        {cols.map((col, w) => (
          <span key={w} className="flex flex-col" style={{ gap }}>
            {col.map((d, i) => (
              <span
                key={i}
                className="block rounded-[1.5px]"
                style={{
                  width: cell,
                  height: cell,
                  // A rest day is the SAME hue at a lower opacity rather than a
                  // hex with an alpha suffix: the two states have to be visibly
                  // the same colour to read as "both kept", and `opacity` says
                  // that in one property instead of a second colour value that
                  // has to be kept in step with the first.
                  // A cell OUTSIDE the window (`!d`) is padding and reads as
                  // nothing. A FUTURE day is a day the plan still has an opinion
                  // about, so it is drawn a step brighter — the two used to be
                  // the same grey, which made the current week's remainder
                  // indistinguishable from the void before the grid began.
                  background: !d
                    ? 'transparent'
                    : d.state === 'future'
                      ? 'rgba(255,255,255,0.07)'
                      : d.state === 'missed'
                        ? 'transparent'
                        : (d.color ?? EMERALD),
                  opacity: d?.state === 'rest' ? 0.26 : 1,
                  border: d && d.state === 'missed' ? '1px solid rgba(255,255,255,0.16)' : undefined,
                }}
              />
            ))}
          </span>
        ))}
      </span>
      {labels && (
        <span className="flex mt-1" style={{ gap, marginLeft: 8 }}>
          {monthMarks.map((m, w) => (
            <span key={w} className="text-[7px] font-bold uppercase tracking-wide text-muted/70 leading-none shrink-0"
              style={{ width: cell }}>
              {/* Only the first column of a month carries its name; the rest
                  hold the column's width so the labels stay aligned to the grid
                  above them rather than to each other. */}
              {m ? <span className="relative whitespace-nowrap">{m}</span> : null}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
