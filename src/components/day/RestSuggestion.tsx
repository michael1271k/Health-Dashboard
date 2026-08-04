'use client'

import { AlertTriangle } from 'lucide-react'
import { useTodayReadiness, isUnderRecovered, readinessReason } from '@/lib/hooks/useTodayReadiness'
import { RestTodayButton } from './SwapDayControl'
import { GOLD } from '@/lib/theme/palette'

/**
 * The app offering the rest day instead of waiting to be asked for it.
 *
 * It appears ONLY when the numbers already say so — under 45% battery or under
 * 5h30 of sleep — and it never blocks the session: the log button stays exactly
 * where it was, and this sits above it as an option. A prompt that argued with
 * you every day would be noise, and a prompt that hid the Log button would be
 * the app deciding it knows better than you do.
 *
 * Nothing here is generated. The sentence is the two measurements and the name
 * of the day the plan scheduled.
 */
export function RestSuggestion({ date, dayLabel }: { date: string; dayLabel: string }) {
  const { data } = useTodayReadiness(date)
  if (!isUnderRecovered(data)) return null
  const reason = readinessReason(data)

  return (
    <div className="rounded-xl border px-3 py-2.5 mb-3 space-y-2"
      style={{ borderColor: `${GOLD}3d`, background: `${GOLD}0f` }}>
      <p className="flex items-start gap-1.5 text-[11px] leading-snug">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: GOLD }} aria-hidden="true" />
        <span className="text-text/90">
          {reason && <span className="helix-num font-semibold" style={{ color: GOLD }}>{reason}</span>}
          {reason && ' — '}
          {dayLabel} is scheduled. Moving it costs nothing.
        </span>
      </p>
      <RestTodayButton date={date} label="Take the rest day" />
    </div>
  )
}
