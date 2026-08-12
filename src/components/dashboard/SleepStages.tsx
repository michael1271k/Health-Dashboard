'use client'

import { useId } from 'react'
import { Moon } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'
import { formatSleep } from '@/lib/utils/format'
import { SLEEP, MUTED, HAIRLINE, EMERALD, GOLD, OXIDE } from '@/lib/theme/palette'

/**
 * Sleep, as architecture rather than four flat squares.
 *
 * NOTE ON HONESTY: we persist stage TOTALS (deep/rem/core/awake minutes), not
 * the stage TIMELINE. HealthKit exposes no precomputed "time asleep" scalar
 * either — Apple derives its number from the same category samples we read. So
 * this is a proportional STAGE SPLIT with the real bed/wake bounds around it,
 * deliberately not labelled a hypnogram: the segment ORDER is nominal, only the
 * widths carry meaning. Storing per-segment intervals would need a new table.
 */

/**
 * ORDER IS LOad-BEARING: deep → core → rem → awake.
 *
 * The arc paints one gradient in this order, so the sequence has to be
 * monotonic in depth for it to read as a single ascent out of sleep rather than
 * four unrelated bands. It used to run deep → rem → core → awake, which
 * zig-zagged in value because REM is lighter than Core.
 *
 * Colours are the `SLEEP` ramp — see the note on it in `palette.ts` for why
 * Core and REM had to be separated and why Awake is no longer the danger red.
 */
const STAGES = [
  { key: 'deep_min', label: 'Deep', color: SLEEP.deep },
  { key: 'core_min', label: 'Core', color: SLEEP.core },
  { key: 'rem_min', label: 'REM', color: SLEEP.rem },
  { key: 'awake_min', label: 'Awake', color: SLEEP.awake },
] as const

/** Local HH:MM for an ISO instant. */
function clock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function SleepStages({ sleep, log, goalHours, nightly, variant = 'full' }: {
  sleep: Tables<'sleep_sessions'> | null
  log: { avg_rest_heart_rate: number | null; blood_oxygen: number | null; respiratory_rate: number | null; sleep_minutes: number | null } | null
  goalHours: number | null
  /** Recent nightly totals in MINUTES, oldest first, for the histogram. */
  nightly?: Array<{ date: string; minutes: number | null }>
  /** `full` is the drawer. `compact` drops the arc and the histogram. */
  variant?: 'full' | 'compact'
}) {
  // The sleep_sessions row is the detailed record; daily_logs.sleep_minutes is
  // the fallback when only a total was ever pushed (legacy Shortcut days).
  const totalMin = sleep?.duration_min ?? log?.sleep_minutes ?? null
  const parts = STAGES
    .map((s) => ({ ...s, min: (sleep?.[s.key] as number | null) ?? 0 }))
    .filter((s) => s.min > 0)
  const ribbonTotal = parts.reduce((n, p) => n + p.min, 0)

  const bed = clock(sleep?.start_time)
  const wake = clock(sleep?.end_time)
  const goalMin = goalHours != null ? goalHours * 60 : null
  const vsGoal = totalMin != null && goalMin ? Math.round(totalMin - goalMin) : null

  if (totalMin == null) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Moon className="w-6 h-6" style={{ color: SLEEP.deep }} aria-hidden="true" />
        <p className="text-fluid-sm text-text">No sleep synced for last night</p>
        <p className="text-[11px] text-muted">Sync your Watch to score the day.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      {/* Hero: total + the night's real bounds */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="helix-num text-4xl font-bold leading-none text-text">{formatSleep(totalMin)}</span>
          <span className="text-[10px] uppercase tracking-widest text-muted ml-2">asleep</span>
        </div>
        {vsGoal != null && (
          <span className="helix-num text-fluid-xs font-bold"
            style={{ color: vsGoal >= 0 ? EMERALD : vsGoal >= -45 ? GOLD : OXIDE }}>
            {vsGoal >= 0 ? '+' : '−'}{formatSleep(Math.abs(vsGoal))} vs goal
          </span>
        )}
      </div>

      {bed && wake && (
        <div className="flex items-center gap-2 text-[11px] text-muted helix-num">
          <span className="text-text font-semibold">{bed}</span>
          <span className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${SLEEP.deep}66, ${GOLD}66)` }} aria-hidden="true" />
          <span className="text-text font-semibold">{wake}</span>
        </div>
      )}

      {/* Stage split. In the drawer this is an ARC with a gradient stroke; in
          the compact view it stays a flat bar. */}
      {ribbonTotal > 0 && (
        <>
          {variant === 'full' ? (
            <SleepArc parts={parts} total={ribbonTotal} totalMin={totalMin} goalMin={goalMin} bed={bed} wake={wake} />
          ) : (
            <div className="flex h-4 w-full rounded-full overflow-hidden" role="img"
              aria-label={parts.map((p) => `${p.label} ${formatSleep(p.min)}`).join(', ')}>
              {parts.map((p) => (
                <span key={p.key} className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${(p.min / ribbonTotal) * 100}%`,
                    background: `linear-gradient(180deg, ${p.color}, ${p.color}b8)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14)`,
                  }} />
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {parts.map((p) => (
              <span key={p.key} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} aria-hidden="true" />
                <span className="text-muted">{p.label}</span>
                <span className="helix-num font-bold text-text">{formatSleep(p.min)}</span>
                <span className="text-muted/70 helix-num">{Math.round((p.min / ribbonTotal) * 100)}%</span>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted/80 leading-snug">
            Stage split by duration — Apple reports totals, not a stage timeline, so segment order is nominal.
          </p>
        </>
      )}

      {variant === 'full' && nightly && nightly.length > 1 && (
        <NightlyHistogram nights={nightly} goalMin={goalMin} />
      )}

      {/* Overnight vitals, one thin row */}
      <div className="grid grid-cols-3 gap-2 pt-2.5 border-t" style={{ borderColor: HAIRLINE }}>
        {[
          { label: 'Resting HR', v: log?.avg_rest_heart_rate, unit: 'bpm', d: 0 },
          { label: 'Blood O₂', v: log?.blood_oxygen, unit: '%', d: 0 },
          { label: 'Respiratory', v: log?.respiratory_rate, unit: 'br/min', d: 1 },
        ].map((x) => (
          <div key={x.label}>
            <div className="text-[9px] uppercase tracking-wide" style={{ color: MUTED }}>{x.label}</div>
            <div className="helix-num text-fluid-sm font-bold text-text mt-0.5">
              {x.v == null ? '—' : (x.d === 0 ? Math.round(x.v) : Math.round(x.v * 10) / 10)}
              {x.v != null && <span className="text-[10px] font-normal text-muted ml-1">{x.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


/**
 * The night as an arc, drawn with a gradient rather than segments.
 *
 * ── WHY A GRADIENT, AND WHY THIS IS THE HONEST SHAPE ─────────────────────────
 * Only stage TOTALS are persisted — never a timeline (see the note at the top
 * of this file). A segmented bar therefore states something the data does not
 * contain: that deep came before REM, that the awake block sat there. It reads
 * as a hypnogram to anyone who has seen one, and it is not.
 *
 * A gradient has no boundaries. Each stop sits at its cumulative proportion and
 * is duplicated a hair either side of the transition, so no hard edge appears
 * anywhere on the stroke. The shares are exactly right; the ORDER is visibly
 * not being claimed. That makes the visual honest by construction rather than
 * by the disclaimer underneath it — which stays anyway.
 *
 * The arc form does the other half: a semicircle from bed to wake reads as a
 * passage of time, which is what a night is, where a bar reads as a quantity.
 *
 * All static SVG — one path, one gradient, no animation, no filter.
 */
function SleepArc({ parts, total, totalMin, goalMin, bed, wake }: {
  parts: Array<{ key: string; label: string; color: string; min: number }>
  total: number
  totalMin: number
  goalMin: number | null
  bed: string | null
  wake: string | null
}) {
  const uid = useId().replace(/:/g, '')
  // ── H IS 146, NOT 132, AND THAT IS THE WHOLE BUG ─────────────────────────
  // The bed/wake labels sit at `CY + 18`. At the old H = 132 they sat at 136 —
  // a baseline four pixels BELOW the bottom of the viewBox — and an SVG root
  // clips to its viewport by default, so all that rendered was a ~2px sliver of
  // the digit tops. It read as a font bug rather than a geometry one.
  //
  // Fixed by giving the box the room, not by `overflow: visible`: painting
  // outside the viewBox would spill into whatever the parent laid out next,
  // and the parent reserved space for a 260×132 element.
  //
  // The arc itself is untouched — its painted bottom is CY + strokeWidth/2 =
  // 127, and a 9px label with a 138 baseline descends to ~140, so 146 leaves
  // six pixels of air.
  const W = 260, H = 146, R = 104, CX = W / 2, CY = 120

  // Cumulative stops, each duplicated ±1.2% so transitions dissolve.
  const stops: Array<{ offset: number; color: string }> = []
  let acc = 0
  parts.forEach((p, i) => {
    const from = acc / total
    acc += p.min
    const to = acc / total
    stops.push({ offset: i === 0 ? 0 : Math.min(1, from + 0.012), color: p.color })
    stops.push({ offset: i === parts.length - 1 ? 1 : Math.max(0, to - 0.012), color: p.color })
  })

  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`
  const LEN = Math.PI * R

  // How much of the goal the night actually covered. The shortfall is drawn
  // as the UNFILLED remainder of the same path, so the gap is read as a
  // distance along the arc rather than as a second mark to compare against.
  const goalFrac = goalMin && goalMin > 0 ? Math.min(1, totalMin / goalMin) : null

  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img"
        aria-label={parts.map((p) => `${p.label} ${formatSleep(p.min)}`).join(', ')}>
        <defs>
          <linearGradient id={`sleepArc-${uid}`} x1="0" y1="0" x2="1" y2="0">
            {stops.map((st, i) => (
              <stop key={i} offset={`${(st.offset * 100).toFixed(2)}%`} stopColor={st.color} />
            ))}
          </linearGradient>
        </defs>

        {/* The night that did not happen — the shortfall against goal, drawn as
            the unfilled remainder of the same path. */}
        {goalFrac != null && goalFrac < 1 && (
          <path d={arc} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={14} strokeLinecap="round" />
        )}

        <path
          d={arc}
          fill="none"
          stroke={`url(#sleepArc-${uid})`}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={goalFrac != null ? `${LEN * goalFrac} ${LEN}` : undefined}
        />

        {bed && <text x={CX - R} y={CY + 18} fill={MUTED} fontSize="9" textAnchor="middle">{bed}</text>}
        {wake && <text x={CX + R} y={CY + 18} fill={MUTED} fontSize="9" textAnchor="middle">{wake}</text>}
      </svg>
    </div>
  )
}

/**
 * The last few nights as bars, tonight highlighted.
 *
 * The series is already fetched for the dashboard strip and was shown nowhere
 * on this screen — one night in isolation cannot tell you whether it was a bad
 * night or a bad week.
 */
function NightlyHistogram({ nights, goalMin }: {
  nights: Array<{ date: string; minutes: number | null }>
  goalMin: number | null
}) {
  const max = Math.max(goalMin ?? 0, ...nights.map((n) => n.minutes ?? 0), 1)
  return (
    <div className="pt-1">
      <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Last {nights.length} nights</p>
      <div className="flex items-end gap-1.5 h-14 relative">
        {goalMin != null && (
          <span aria-hidden="true" className="absolute inset-x-0 border-t border-dashed"
            style={{ bottom: `${(goalMin / max) * 100}%`, borderColor: 'rgba(255,255,255,0.14)' }} />
        )}
        {nights.map((n, i) => {
          const last = i === nights.length - 1
          const h = n.minutes ? (n.minutes / max) * 100 : 0
          const short = goalMin != null && (n.minutes ?? 0) < goalMin
          return (
            <span key={n.date} className="flex-1 rounded-t-sm"
              title={`${n.date} · ${n.minutes ? formatSleep(n.minutes) : 'no data'}`}
              style={{
                height: `${Math.max(2, h)}%`,
                background: n.minutes == null ? 'rgba(255,255,255,0.05)' : short ? `${GOLD}${last ? 'ee' : '55'}` : `${SLEEP.deep}${last ? 'ee' : '55'}`,
              }} />
          )
        })}
      </div>
    </div>
  )
}
