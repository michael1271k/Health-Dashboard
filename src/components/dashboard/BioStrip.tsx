'use client'

import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { KineticNumber } from '@/components/fx/KineticNumber'

export interface BioStripProps {
  icon: LucideIcon
  label: string
  accent: string
  /** Big number (kinetic when numeric). */
  value: number | string | null
  unit?: string
  /** Small status line under the value (phase tag, delta, schedule). */
  status?: React.ReactNode
  /** 7-day series for the inline sparkline (nulls skipped). */
  series?: Array<number | null>
  onClick?: () => void
}

/** Inline SVG sparkline — no chart library on the dashboard's first paint. */
function Sparkline({ series, accent }: { series: Array<number | null>; accent: string }) {
  const pts = series.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) return <div className="w-20 h-8" aria-hidden="true" />
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = max - min || 1
  const n = series.length - 1
  const d = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${(p.i / n) * 76 + 2} ${28 - ((p.v - min) / span) * 24}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg viewBox="0 0 80 32" className="w-20 h-8 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={(last.i / n) * 76 + 2} cy={28 - ((last.v - min) / span) * 24} r="2.4" fill={accent} style={{ filter: `drop-shadow(0 0 3px ${accent})` }} />
    </svg>
  )
}

/**
 * BioStrip — a full-width live domain band: icon · label · hero number ·
 * sparkline · status glow. The building block of the Bio-Command dashboard.
 */
export const BioStrip = memo(function BioStrip({ icon: Icon, label, accent, value, unit, status, series, onClick }: BioStripProps) {
  const numeric = typeof value === 'number'
  return (
    <button
      onClick={onClick}
      className="helix-card holo-sheen w-full flex items-center gap-3 px-4 py-3 text-left active:opacity-80 transition-opacity"
      style={{ borderColor: `${accent}2e` }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0" style={{ background: `${accent}1c`, color: accent, boxShadow: `0 0 12px ${accent}30` }}>
        <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted leading-none">{label}</span>
        <span className="flex items-baseline gap-1 mt-0.5">
          {numeric
            ? <KineticNumber value={value as number} className="helix-num text-fluid-xl font-bold leading-none" duration={700} />
            : <span className="helix-num text-fluid-xl font-bold leading-none" style={value == null ? { color: '#5A6B85' } : undefined}>{value ?? '—'}</span>}
          {unit && <span className="text-fluid-xs text-muted">{unit}</span>}
        </span>
        {status && <span className="block text-fluid-xs text-muted mt-0.5 truncate">{status}</span>}
      </span>
      {series && <Sparkline series={series} accent={accent} />}
    </button>
  )
})
