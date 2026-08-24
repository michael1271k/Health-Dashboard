'use client'

import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { KineticNumber } from '@/components/fx/KineticNumber'
import type { WidgetSize } from '@/lib/dashboard/layout'

/**
 * One dashboard widget.
 *
 * ── IT IS `BioStrip` GROWN UP ────────────────────────────────────────────────
 * `BioStrip` was a full-width band: icon, label, hero number, sparkline, status.
 * That anatomy was right; what it could not do was be any other size, so the
 * dashboard was six identical bands stacked in a column and every domain
 * claimed exactly as much of the screen as every other.
 *
 * The anatomy is unchanged and the sizes are additive — small is the number,
 * medium adds the trend, large adds the detail that otherwise costs a tap. A
 * widget therefore never shows something at one size it contradicts at another.
 */
export interface DashboardWidgetProps {
  icon: LucideIcon
  label: string
  accent: string
  /** Big number (kinetic when numeric). */
  value: number | string | null
  unit?: string
  /** Small status line under the value — a phase tag, a delta, a schedule. */
  status?: React.ReactNode
  /** 7-day series for the inline sparkline (nulls skipped). Medium and large. */
  series?: Array<number | null>
  /** Extra content, large only. Kept out of the DOM at other sizes. */
  detail?: React.ReactNode
  /** Decimal places for the hero number (weight passes 1 so 64.9 stays 64.9). */
  decimals?: number
  size: WidgetSize
  onOpen?: () => void
}

/** Inline SVG sparkline — no chart library on the dashboard's first paint. */
function Sparkline({ series, accent, tall }: { series: Array<number | null>; accent: string; tall?: boolean }) {
  const pts = series.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  const cls = tall ? 'w-full h-14' : 'w-full h-8'
  if (pts.length < 2) return <div className={cls} aria-hidden="true" />
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = max - min || 1
  const n = series.length - 1
  const d = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${(p.i / n) * 76 + 2} ${28 - ((p.v - min) / span) * 24}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg viewBox="0 0 80 32" preserveAspectRatio="none" className={cls} aria-hidden="true">
      <path d={d} fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"
        vectorEffect="non-scaling-stroke" />
      <circle cx={(last.i / n) * 76 + 2} cy={28 - ((last.v - min) / span) * 24} r="2.4" fill={accent}
        style={{ filter: `drop-shadow(0 0 3px ${accent})` }} />
    </svg>
  )
}

export const DashboardWidget = memo(function DashboardWidget({
  icon: Icon, label, accent, value, unit, status, series, detail, decimals = 0, size, onOpen,
}: DashboardWidgetProps) {
  const numeric = typeof value === 'number'
  const showTrend = size !== 's' && series && series.length > 0
  return (
    <div
      // A div with a click handler rather than a <button>: at large size a
      // widget can hold its own controls, and a button inside a button is
      // invalid HTML that Safari resolves by dropping the inner one.
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } } : undefined}
      aria-label={onOpen ? `Open ${label}` : undefined}
      className="h-full rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 flex flex-col gap-1.5 text-left active:opacity-80 transition-opacity"
      style={{ borderColor: `${accent}2e` }}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
          style={{ background: `${accent}1c`, color: accent, boxShadow: `0 0 12px ${accent}30` }}>
          <Icon style={{ width: 15, height: 15 }} aria-hidden="true" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted truncate">{label}</span>
      </span>

      <span className="flex items-baseline gap-1 min-w-0">
        {numeric
          ? <KineticNumber value={value as number} className="helix-num text-fluid-xl font-bold leading-none" duration={700} decimals={decimals} />
          : <span className="helix-num text-fluid-xl font-bold leading-none truncate" style={value == null ? { color: '#5A6472' } : undefined}>{value ?? '—'}</span>}
        {unit && <span className="text-fluid-xs text-muted shrink-0">{unit}</span>}
      </span>

      {/* The status line is the first thing the small size gives up: at 1×1 the
          number and its label already fill the tile, and a truncated sentence
          under them reads as damage rather than information. */}
      {size !== 's' && status && (
        <span className="block text-fluid-xs text-muted truncate">{status}</span>
      )}

      {showTrend && (
        <span className="mt-auto block"><Sparkline series={series} accent={accent} tall={size === 'l'} /></span>
      )}

      {size === 'l' && detail && (
        <span className="block pt-2 mt-1 border-t border-white/[0.06]">{detail}</span>
      )}
    </div>
  )
})
