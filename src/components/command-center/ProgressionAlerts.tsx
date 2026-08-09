'use client'

import { useRouter } from 'next/navigation'
import { TrendingUp, ChevronRight } from 'lucide-react'
import { useProgressionQueue } from '@/lib/hooks/useProgressionQueue'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { scheduleDayFor } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { displayWeight, weightUnit } from '@/lib/utils/units'

const GOLD = '#D4AF37'
const EMERALD = '#3E9E7A'
const AMBER = '#E0A03C'   // one-more-session: earned, not yet due

/**
 * Narrow a plan-wide progression queue to one training day.
 *
 * Pure and exported so the two behaviours that matter are testable without a
 * schedule: a day with a key keeps only its own lifts, and a day WITHOUT one
 * keeps everything. The keyless case is the PPL era — `scheduleDayFor` returns
 * a bare label there, and every alert carries a Helix `dayKey`, so filtering
 * would silently empty the widget for every legacy date rather than scope it.
 */
export function scopeToDay<T extends { dayKey: string | null }>(
  alerts: readonly T[],
  dayKey: string | null | undefined,
): T[] {
  if (!dayKey) return [...alerts]
  return alerts.filter((a) => a.dayKey === dayKey)
}

/**
 * Smart-Coach banner: the lifts on TODAY'S session that cleared their programmed
 * ceiling and are due a load bump. Each row deep-links to logging that day.
 *
 * SCOPED TO THE DAY, DELIBERATELY. `useProgressionQueue` grades every exercise
 * in the active plan across every day — correct as a coach's queue, and what the
 * Session Deck wants, but wrong here: a cue for a Legs B lift on an Upper A
 * morning is an instruction you cannot act on, and a dozen of them is a list you
 * stop reading. The filter lives at this layer so the shared hook keeps serving
 * its other consumers whole.
 *
 * SWAP-AWARE. `scheduleDayFor` already resolves `schedule_overrides`, so a day
 * swapped to Legs B shows Legs B's cues and a day swapped to rest shows none —
 * there is nothing to add load to on a rest day. That resolution reads a
 * module-level cache React cannot observe, which is why `useScheduleVersion()`
 * is subscribed here: without it a swap made elsewhere would leave this widget
 * advising yesterday's plan until something unrelated re-rendered it.
 *
 * Renders nothing when the queue is empty.
 */
export function ProgressionAlerts({ date = logicalTodayISO() }: { date?: string } = {}) {
  const { data: alerts } = useProgressionQueue()
  const router = useRouter()
  const unit = weightUnit()
  useScheduleVersion()

  const schedule = scheduleDayFor(date)
  if (schedule === 'rest') return null
  if (!alerts || alerts.length === 0) return null

  const todays = scopeToDay(alerts, schedule.dayKey)
  if (!todays.length) return null

  // Two populations now. `ready` earned the load; `one-more` cleared its top
  // load once and needs it repeated. Showing them under one "Ready to progress"
  // heading would reintroduce the false positives this pass exists to remove.
  const ready = todays.filter((a) => a.state === 'ready')
  const oneMore = todays.filter((a) => a.state === 'one-more')
  if (!ready.length && !oneMore.length) return null

  return (
    <section className="helix-card space-y-2.5" style={{ borderColor: `${GOLD}40` }}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: `${GOLD}1a`, color: GOLD }}>
          <TrendingUp className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <h3 className="font-heading font-bold text-fluid-base text-text truncate">
            {ready.length ? 'Ready to progress' : 'Almost there'}
          </h3>
          {/* The day these cues belong to — the whole point of the scoping. */}
          <span className="block text-[10px] text-muted truncate">{schedule.label}</span>
        </span>
        <span className="text-fluid-xs font-bold" style={{ color: GOLD }}>{ready.length || oneMore.length}</span>
      </div>
      <p className="text-[11px] text-muted leading-snug">
        {ready.length
          ? 'Two sets at the rep ceiling on the top load, two sessions running — add load on today’s session.'
          : 'Top load cleared once. Repeat it today to earn the load.'}
      </p>
      <div className="space-y-1.5">
        {(ready.length ? ready : oneMore).map((a) => (
          <button
            key={`${a.exerciseId}|${a.dayKey ?? ''}`}
            onClick={() => a.dayKey && router.push(`/session?template=${a.dayKey}`)}
            className="w-full flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.05] px-2.5 py-2 text-left hover:bg-white/[0.04] transition-colors"
          >
            {/* No per-row day label: every row is the same day now, and it is
                already in the header. */}
            <span className="min-w-0 flex-1">
              <span className="block text-fluid-sm font-medium text-text truncate">{a.name}</span>
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
