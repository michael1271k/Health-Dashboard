'use client'

import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { STEEL, GOLD, EMERALD } from '@/lib/theme/palette'

/**
 * How long since the last set of THIS exercise was ticked.
 *
 * ── MEASURED, NEVER PRESCRIBED ───────────────────────────────────────────────
 * There is no rest column in the program and none is invented here. Every
 * number this shows is the difference between two things you actually did: the
 * tick that ended your last set and the clock. Helix has been throwing that
 * away — the one measurement a logger gets for free — so "how long have I been
 * sitting here" was a question you answered by looking at the wall clock and
 * doing arithmetic.
 *
 * ── AND IT DOES NOT NAG ──────────────────────────────────────────────────────
 * No target, no countdown, no alarm. A prescribed rest interval would be a
 * number the plan does not contain, and a timer that goes off is a timer you
 * start ignoring. The colour bands are descriptive only — under a minute is
 * short for anything, past four minutes you have probably stopped resting and
 * started sitting — and they say so in the tooltip rather than in a warning.
 *
 * Renders nothing until a set is ticked, and stops counting once every set of
 * the exercise is done: at that point you are not resting, you have finished.
 */
export function RestTimer({ since, finished }: {
  /** Epoch ms of the last completed set, or null while none is. */
  since: number | null
  /** True when every set of this exercise is ticked. */
  finished: boolean
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (since == null || finished) return
    // One second is the resolution of the thing being measured; anything faster
    // is a re-render per frame for a digit that has not changed.
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [since, finished])

  if (since == null || finished) return null

  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  // Over an hour means the deck was left open — a "73:12" rest is not a rest,
  // it is a session you walked away from, and printing it as one would be a
  // claim about training rather than about a screen.
  if (seconds > 3600) return null

  const color = seconds < 60 ? STEEL : seconds < 240 ? EMERALD : GOLD
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 px-1.5 py-px rounded-md text-[10px] font-bold tabular-nums"
      style={{ color, background: `${color}14`, border: `1px solid ${color}3d` }}
      title="Time since your last completed set — measured, not prescribed"
      aria-label={`Resting ${label}`}
    >
      <Timer className="w-2.5 h-2.5" aria-hidden="true" />
      {label}
    </span>
  )
}
