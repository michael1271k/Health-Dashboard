'use client'

import { useEffect, useRef } from 'react'
import { useMotionValue, useMotionValueEvent, type MotionValue } from 'framer-motion'

export interface ScrubState {
  label: string
  /** dataKey → value at the scrubbed x. */
  values: Record<string, number>
}

export interface LegendSeries {
  /** The recharts `dataKey`. */
  key: string
  name: string
  color: string
  unit?: string
}

/**
 * A legend that reads out the value under your finger.
 *
 * ── WHY THIS IS NOT REACT STATE ──────────────────────────────────────────────
 * Scrubbing fires at pointer rate. Routing that through `useState` re-renders
 * the chart — five `<Line>`s, two axes and a grid — on every move, and recharts
 * is not cheap to re-render. The scrub position lives in a MotionValue instead,
 * legend rows subscribe to it directly, and each writes its own `textContent`.
 *
 * **React does not re-render at all during a scrub.** Five text nodes mutate.
 * That is the whole 60fps argument, and it is the same pattern Sheet already
 * uses for its drag.
 *
 * ── AND WHY THERE IS NO NEW LISTENER ─────────────────────────────────────────
 * No `onMouseMove` on the chart root — that fires at pointer rate with a full
 * recharts state payload attached. Recharts already computes exactly what we
 * need, at its own throttled cadence, and hands it to whatever renders as
 * `<Tooltip content>`. So the tooltip IS the event source: `ChartScrubber`
 * draws nothing and forwards the payload.
 */
export function useScrub(): MotionValue<ScrubState | null> {
  return useMotionValue<ScrubState | null>(null)
}

/**
 * Render as `<Tooltip content={<ChartScrubber scrub={scrub} />} />`.
 * Draws nothing; its only job is to be called.
 */
export function ChartScrubber({ scrub, active, payload, label }: {
  scrub: MotionValue<ScrubState | null>
  // Injected by recharts.
  active?: boolean
  payload?: Array<{ dataKey?: string | number; name?: string; value?: number }>
  label?: string
}) {
  // Writing during render is illegal, and this component renders on every
  // recharts tooltip tick — so the write is an effect keyed on the payload.
  useEffect(() => {
    if (!active || !payload?.length) { scrub.set(null); return }
    const values: Record<string, number> = {}
    for (const p of payload) {
      const k = String(p.dataKey ?? p.name ?? '')
      if (k && typeof p.value === 'number') values[k] = p.value
    }
    scrub.set({ label: String(label ?? ''), values })
  }, [scrub, active, payload, label])

  return null
}

/**
 * The legend. Each row shows its series' value at the scrubbed x, and its LAST
 * known value otherwise — so it is always a readout, never a bare list of
 * names waiting to be hovered.
 *
 * Clicking a row isolates that series, which is the behaviour
 * BodyCompositionChart already had. Focus and scrub compose without conflict:
 * focus filters the SET, scrub selects the MOMENT.
 */
export function SmartLegend({ series, scrub, fallback, focus, onFocus }: {
  series: LegendSeries[]
  scrub: MotionValue<ScrubState | null>
  /** dataKey → the series' last non-null value, shown when not scrubbing. */
  fallback: Record<string, number>
  focus?: string | null
  onFocus?: (key: string | null) => void
}) {
  const cells = useRef<Record<string, HTMLSpanElement | null>>({})
  const stamp = useRef<HTMLSpanElement | null>(null)

  const fmt = (v: number | undefined, unit?: string) =>
    v == null ? '—' : `${v % 1 === 0 ? v.toLocaleString() : v.toFixed(1)}${unit ?? ''}`

  // The subscription. No setState anywhere in here.
  useMotionValueEvent(scrub, 'change', (s) => {
    for (const item of series) {
      const el = cells.current[item.key]
      if (el) el.textContent = fmt(s?.values[item.key] ?? fallback[item.key], item.unit)
    }
    if (stamp.current) stamp.current.textContent = s?.label ?? ''
  })

  return (
    <div className="mt-1.5">
      <span ref={stamp} className="block h-3 text-[10px] text-muted helix-num tabular-nums" aria-hidden="true" />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {series.map((item) => {
          const dimmed = focus != null && focus !== item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onFocus?.(focus === item.key ? null : item.key)}
              aria-pressed={focus === item.key}
              className={`flex items-center gap-1.5 text-[11px] min-h-[28px] transition-opacity ${dimmed ? 'opacity-40' : ''}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} aria-hidden="true" />
              <span className="text-muted">{item.name}</span>
              <span
                ref={(el) => { cells.current[item.key] = el }}
                className="helix-num font-bold text-text tabular-nums"
              >
                {fmt(fallback[item.key], item.unit)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Vertical scroll must still pass through a chart you are scrubbing sideways.
 * Recharts fires from touch but never calls preventDefault, so without this the
 * two gestures fight and the page feels stuck.
 */
export const SCRUB_TOUCH: React.CSSProperties = { touchAction: 'pan-y' }

/** The last non-null value per series — what the legend shows at rest. */
export function lastValues<T extends Record<string, unknown>>(
  data: T[],
  keys: string[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of keys) {
    for (let i = data.length - 1; i >= 0; i--) {
      const v = data[i][key]
      if (typeof v === 'number' && Number.isFinite(v)) { out[key] = v; break }
    }
  }
  return out
}
