'use client'

import { KineticNumber } from '@/components/fx/KineticNumber'
import { EMERALD, OXIDE, MUTED } from '@/lib/theme/palette'

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
export function MiniBars({ series, color, goal, height = 30, dim = 'rgba(255,255,255,0.14)' }: {
  series: Array<number | null>
  color: string
  /** Draws the target hairline and decides which bars are lit. Absent = all lit. */
  goal?: number | null
  height?: number
  dim?: string
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
            background: v == null ? 'rgba(255,255,255,0.08)' : goal != null && v >= goal ? color : dim,
          }}
        />
      ))}
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
      <span className="relative flex mt-1">
        {marks.map((mk) => {
          const passed = v >= mk
          return (
            <span key={mk} className="flex-1 min-w-0 flex flex-col items-end gap-0.5">
              <span
                className="w-px h-1 -mt-[7px]"
                style={{ background: passed ? color : 'rgba(255,255,255,0.18)' }}
                aria-hidden="true"
              />
              <span
                className="helix-num text-[8px] tabular-nums leading-none"
                style={{ color: passed ? color : 'var(--color-muted)' }}
              >
                {mk >= 1000 ? `${Math.round(mk / 1000)}${unit}` : mk}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
