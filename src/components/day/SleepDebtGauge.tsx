'use client'

import { memo } from 'react'
import { BedDouble } from 'lucide-react'
import { useSleepDebt } from '@/lib/hooks/useSleepDebt'
import { EMBER, EMBER_DEEP, GOLD, OXIDE } from '@/lib/theme/palette'

// Was `ACCENT` holding #B4522A, which is EMBER_DEEP. Sleep debt is a debt:
// it belongs on the ember ramp, and the name should say so.
const ACCENT = EMBER_DEEP

function debtColor(h: number): string {
  if (h <= 2) return EMBER
  if (h <= 5) return GOLD
  return OXIDE
}

/**
 * Sleep Debt Bank — rolling 14-night decayed shortfall vs the sleep
 * goal, as a compact horizontal gauge (0–10h scale).
 */
export const SleepDebtGauge = memo(function SleepDebtGauge({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useSleepDebt()
  if (isLoading) return compact ? null : <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-[72px] animate-pulse" aria-hidden="true" />
  if (!data || data.nights < 3) return null   // not enough history to be honest about debt

  const color = debtColor(data.debtHours)
  const pct = Math.min(1, data.debtHours / 10)

  // Compact: a slim inline bar folded into the Nexus Sleep & Recovery block.
  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted">Sleep debt · 14-night</span>
          <span className="helix-num text-[11px] font-bold" style={{ color }}>
            {data.debtHours <= 0.1 ? 'settled ✓' : `−${data.debtHours}h`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden" role="img"
          aria-label={`Sleep debt ${data.debtHours} hours over ${data.nights} nights`}>
          {/* scaleX, not width: width is a layout property, so the old
              transition reflowed this subtree every frame for 700ms. */}
          <div className="h-full w-full origin-left rounded-full transition-transform duration-700"
            style={{ transform: `scaleX(${Math.max(0.02, pct)})`, background: color, boxShadow: `0 0 8px ${color}66` }} />
        </div>
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-2.5" style={{ borderColor: `${ACCENT}30` }}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading font-semibold text-text flex items-center gap-1.5">
          <BedDouble className="w-4 h-4" style={{ color: ACCENT }} /> Sleep Debt Bank
        </h2>
        <span className="helix-num text-fluid-sm font-bold" style={{ color }}>
          {data.debtHours <= 0.1 ? 'settled ✓' : `−${data.debtHours}h`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden" role="img"
        aria-label={`Sleep debt ${data.debtHours} hours over the last ${data.nights} nights`}>
        <div className="h-full w-full origin-left rounded-full transition-transform duration-700"
          style={{ transform: `scaleX(${Math.max(0.02, pct)})`, background: color, boxShadow: `0 0 8px ${color}66` }} />
      </div>
      <p className="text-fluid-xs text-muted">
        14-night rolling vs {data.goalHours}h goal · surplus nights repay · last week decays ×0.75
      </p>
    </section>
  )
})
