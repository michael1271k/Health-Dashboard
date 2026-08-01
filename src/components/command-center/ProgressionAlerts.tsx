'use client'

import { useRouter } from 'next/navigation'
import { TrendingUp, ChevronRight } from 'lucide-react'
import { useProgressionQueue } from '@/lib/hooks/useProgressionQueue'
import { displayWeight, weightUnit } from '@/lib/utils/units'

const GOLD = '#D4AF37'
const EMERALD = '#3E9E7A'
const AMBER = '#E0A03C'   // one-more-session: earned, not yet due

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

  // Two populations now. `ready` earned the load; `one-more` cleared its top
  // load once and needs it repeated. Showing them under one "Ready to progress"
  // heading would reintroduce the false positives this pass exists to remove.
  const ready = alerts.filter((a) => a.state === 'ready')
  const oneMore = alerts.filter((a) => a.state === 'one-more')
  if (!ready.length && !oneMore.length) return null

  return (
    <section className="helix-card holo-sheen space-y-2.5" style={{ borderColor: `${GOLD}40` }}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: `${GOLD}1a`, color: GOLD }}>
          <TrendingUp className="w-4 h-4" aria-hidden="true" />
        </span>
        <h3 className="font-heading font-bold text-fluid-base text-text flex-1">
          {ready.length ? 'Ready to progress' : 'Almost there'}
        </h3>
        <span className="text-fluid-xs font-bold" style={{ color: GOLD }}>{ready.length || oneMore.length}</span>
      </div>
      <p className="text-[11px] text-muted leading-snug">
        {ready.length
          ? 'Two sets at the rep ceiling on the top load, two sessions running — add load next time each lift comes up.'
          : 'Top load cleared once. Repeat it next session to earn the load.'}
      </p>
      <div className="space-y-1.5">
        {(ready.length ? ready : oneMore).map((a) => (
          <button
            key={`${a.exerciseId}|${a.dayKey ?? ''}`}
            onClick={() => a.dayKey && router.push(`/session?template=${a.dayKey}`)}
            className="w-full flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-2 text-left hover:bg-white/[0.04] transition-colors"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-fluid-sm font-medium text-text truncate">{a.name}</span>
              {a.dayLabel && <span className="block text-[10px] text-muted">{a.dayLabel}</span>}
            </span>
            <span className="helix-num text-fluid-xs font-bold shrink-0"
              style={{ color: a.state === 'ready' ? EMERALD : AMBER }}>
              {a.state === 'one-more'
                ? '1 more session'
                : a.timed
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
