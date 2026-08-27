'use client'

import { memo, useEffect, useState } from 'react'
import { Hourglass } from 'lucide-react'
import { formatClock } from '@/lib/sessions/sessionClock'
import { sessionElapsedSec } from '@/lib/sessions/sessionElapsed'
import { STEEL } from '@/lib/theme/palette'

/**
 * How long you have been in this workout.
 *
 * ── IT IS A READOUT, NOT A CONTROL ───────────────────────────────────────────
 * Nothing here starts, stops, pauses or resets, and that is the point. The
 * session began when the deck opened; there is no state in which "the workout is
 * running but its timer is not", so a Start button would only ever be a way to
 * make the number wrong. It sits beside the rest clock — which IS a control,
 * because a rest genuinely has a beginning you choose — and the two are
 * deliberately different shapes so nobody reaches for the wrong one mid-set.
 *
 * ── AND WHY IT TICKS AT 1 Hz AND NOT 4 ───────────────────────────────────────
 * `SessionClock` polls at 250ms because a rest timer is read while it is moving
 * and a quarter-second lag on the last few seconds of a countdown is felt. This
 * is read in glances, minutes apart, and it is on the deck whose keystroke
 * latency has been measured and fixed twice — so it takes the cheapest interval
 * that keeps the seconds honest.
 *
 * `memo`, and it holds its own tick: given the draft it would re-render the hero
 * every second, which is exactly the cost `LiveSessionBar` takes primitives to
 * avoid.
 */
export const SessionElapsed = memo(function SessionElapsed({ startedAt, size = 'lg' }: {
  /** The draft's own `startedAt`. */
  startedAt: string
  /** `lg` matches the hero's 44px targets, `sm` the collapsed bar's 38px ones. */
  size?: 'sm' | 'lg'
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const sec = sessionElapsedSec(startedAt, now)
  // Nothing at all on a back-dated or edited deck — see `sessionElapsedSec` for
  // why "no answer" is the correct output rather than a very large number.
  if (sec == null) return null

  const box = size === 'lg' ? 'min-h-[44px] px-2.5' : 'min-h-[38px] px-2'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xl ${box} shrink-0`}
      style={{
        color: STEEL,
        background: `${STEEL}14`,
        border: `1px solid ${STEEL}33`,
      }}
      // A live region would announce a new time every second, which is a screen
      // reader reading a stopwatch aloud for the length of a workout. The label
      // states what it is; the value is read on demand.
      role="timer"
      aria-label={`Session time ${formatClock(sec)}`}
    >
      <Hourglass className={size === 'lg' ? 'w-3.5 h-3.5' : 'w-3 h-3'} aria-hidden="true" />
      <span className={`helix-num font-bold tabular-nums leading-none ${size === 'lg' ? 'text-[13px]' : 'text-[12px]'}`}>
        {formatClock(sec)}
      </span>
    </span>
  )
})
