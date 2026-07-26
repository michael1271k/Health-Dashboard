'use client'

import { useRouter } from 'next/navigation'
import { TrendingUp, ChevronRight } from 'lucide-react'
import { useProgressionQueue } from '@/lib/hooks/useProgressionQueue'
import { displayWeight, weightUnit } from '@/lib/utils/units'

const GOLD = '#D4AF37'
const EMERALD = '#3E9E7A'

/**
 * Smart-Coach banner: every lift that cleared its programmed ceiling TWICE and is
 * due a load bump the next time it appears — surfaced up-front so the cue isn't
 * missed on a different training day. Each row deep-links to logging that day.
 * Renders nothing when the queue is empty.
 */
export function ProgressionAlerts() {
  const { data: alerts } = useProgressionQueue()
  const router = useRouter()
  const unit = weightUnit()

  if (!alerts || alerts.length === 0) return null

  return (
    <section className="helix-card holo-sheen space-y-2.5" style={{ borderColor: `${GOLD}40` }}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: `${GOLD}1a`, color: GOLD }}>
          <TrendingUp className="w-4 h-4" aria-hidden="true" />
        </span>
        <h3 className="font-heading font-bold text-fluid-base text-text flex-1">Ready to progress</h3>
        <span className="text-fluid-xs font-bold" style={{ color: GOLD }}>{alerts.length}</span>
      </div>
      <p className="text-[11px] text-muted leading-snug">
        Cleared the rep ceiling twice — add load the next time each lift comes up.
      </p>
      <div className="space-y-1.5">
        {alerts.map((a) => (
          <button
            key={a.exerciseId}
            onClick={() => a.dayKey && router.push(`/session?template=${a.dayKey}`)}
            className="w-full flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-2 text-left hover:bg-white/[0.04] transition-colors"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-fluid-sm font-medium text-text truncate">{a.name}</span>
              {a.dayLabel && <span className="block text-[10px] text-muted">{a.dayLabel}</span>}
            </span>
            <span className="helix-num text-fluid-xs font-bold shrink-0" style={{ color: EMERALD }}>
              {a.timed
                ? 'extend hold'
                : a.currentKg != null && a.suggestKg != null
                  ? `${displayWeight(a.currentKg)}→${displayWeight(a.suggestKg)}${unit}`
                  : `+2.5${unit}`}
            </span>
            <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  )
}
