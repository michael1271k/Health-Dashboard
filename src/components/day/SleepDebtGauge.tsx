'use client'

import { memo } from 'react'
import { BedDouble } from 'lucide-react'
import { useSleepDebt } from '@/lib/hooks/useSleepDebt'

const VIOLET = '#8B7CFF'

function debtColor(h: number): string {
  if (h <= 2) return '#16F5C3'
  if (h <= 5) return '#FFB86B'
  return '#FF5470'
}

/**
 * Sleep Debt Bank — rolling 14-night decayed shortfall vs the sleep
 * goal, as a compact horizontal gauge (0–10h scale).
 */
export const SleepDebtGauge = memo(function SleepDebtGauge() {
  const { data, isLoading } = useSleepDebt()
  if (isLoading) return <div className="helix-card h-[72px] animate-pulse" aria-hidden="true" />
  if (!data || data.nights < 3) return null   // not enough history to be honest about debt

  const color = debtColor(data.debtHours)
  const pct = Math.min(1, data.debtHours / 10)

  return (
    <section className="helix-card space-y-2.5" style={{ borderColor: `${VIOLET}30` }}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading font-semibold text-text flex items-center gap-1.5">
          <BedDouble className="w-4 h-4" style={{ color: VIOLET }} /> Sleep Debt Bank
        </h2>
        <span className="helix-num text-fluid-sm font-bold" style={{ color }}>
          {data.debtHours <= 0.1 ? 'settled ✓' : `−${data.debtHours}h`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden" role="img"
        aria-label={`Sleep debt ${data.debtHours} hours over the last ${data.nights} nights`}>
        <div className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(2, pct * 100)}%`, background: color, boxShadow: `0 0 8px ${color}66` }} />
      </div>
      <p className="text-fluid-xs text-muted-vital">
        14-night rolling vs {data.goalHours}h goal · surplus nights repay · last week decays ×0.75
      </p>
    </section>
  )
})
