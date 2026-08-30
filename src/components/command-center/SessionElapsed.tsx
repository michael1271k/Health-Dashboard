'use client'

import { memo, useEffect, useState } from 'react'
import { Hourglass, Pause } from 'lucide-react'
import { formatClock } from '@/lib/sessions/sessionClock'
import { sessionActiveSec } from '@/lib/sessions/sessionElapsed'
import { STEEL } from '@/lib/theme/palette'

/**
 * How long you have been in this workout.
 *
 * ── IT IS A READOUT, AND ITS ONE CONTROL IS A DOOR ───────────────────────────
 * Nothing here starts or resets, and that is still the point. The session began
 * when the deck opened; there is no state in which "the workout is running but
 * its timer is not", so a Start button would only ever be a way to make the
 * number wrong. It sits beside the rest clock — which IS a control, because a
 * rest genuinely has a beginning you choose — and the two stay deliberately
 * different shapes so nobody reaches for the wrong one mid-set.
 *
 * What it DOES do now is open `DurationSheet`, which is where the two questions
 * this readout cannot answer live: what time the session actually started, and
 * pausing it. A pause belongs behind a tap rather than in this row: this row is
 * under the thumb that is ticking sets.
 *
 * ── AND WHY IT TICKS AT 1 Hz AND NOT 4 ───────────────────────────────────────
 * `SessionClock` polls at 250ms because a rest timer is read while it is moving
 * and a quarter-second lag on the last few seconds of a countdown is felt. This
 * is read in glances, minutes apart, and it is on the deck whose keystroke
 * latency has been measured and fixed twice — so it takes the cheapest interval
 * that keeps the seconds honest. While PAUSED it takes no interval at all: the
 * number cannot move, so a timer that redraws it every second is pure cost.
 *
 * `memo`, and it holds its own tick: given the draft it would re-render the hero
 * every second, which is exactly the cost `LiveSessionBar` takes primitives to
 * avoid.
 */
export const SessionElapsed = memo(function SessionElapsed({ startedAt, pausedMs, pausedAt, accent, size = 'lg', onOpen }: {
  /** The draft's own `startedAt`. */
  startedAt: string
  /** Banked pause time, and the pause in progress — see `SessionPause`. */
  pausedMs?: number
  pausedAt?: string | null
  /**
   * The session's own colour (`dayColor`). It used to be hard STEEL on every
   * deck, which made the one number that belongs to this workout the only thing
   * in the header that did not know which workout it was. Falls back to steel so
   * a caller without a palette still renders.
   */
  accent?: string
  /** `lg` matches the hero's 44px targets, `sm` the collapsed bar's 38px ones. */
  size?: 'sm' | 'lg'
  /** Opens the Duration sheet. Without it the readout stays a plain span. */
  onOpen?: () => void
}) {
  const paused = !!pausedAt
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (paused) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [paused])

  const sec = sessionActiveSec(startedAt, now, { pausedMs, pausedAt })
  // Nothing at all on a back-dated or edited deck — see `sessionElapsedSec` for
  // why "no answer" is the correct output rather than a very large number.
  if (sec == null) return null

  const tint = accent ?? STEEL
  const box = size === 'lg' ? 'min-h-[44px] px-1' : 'min-h-[38px] px-0.5'
  const label = `Duration ${formatClock(sec)}${paused ? ', paused' : ''}`

  /* ── AND THEN THE WORD CAME OFF AGAIN ─────────────────────────────────────
     "DURATION" over the figure was two characters of context bought with a 9px
     line, and it was worth it while this stood beside a second bare clock face
     in the same row. The rest timer has moved into the session menu, so there
     is nothing left to confuse it with — and what remains is the one number in
     the header you read without deciding anything, sitting directly beside the
     decision it informs.

     No tile either. The tinted box and its border were 44px of chrome around
     four characters, on the narrowest row in the app, competing with the
     workout title for exactly the width the title had already run out of. The
     hourglass carries the meaning; a pause icon replaces it when the clock has
     stopped, which is the only state the figure alone cannot express. */
  const body = (
    <>
      {paused
        ? <Pause className="w-3 h-3 shrink-0" style={{ color: 'var(--color-muted)' }} aria-hidden="true" />
        : <Hourglass className="w-3 h-3 shrink-0" style={{ color: tint }} aria-hidden="true" />}
      <span
        className={`helix-num font-bold tabular-nums leading-none ${size === 'lg' ? 'text-[13px]' : 'text-[12px]'}`}
        // Paused, the number recedes to muted: it is no longer telling you
        // anything that is still happening.
        style={{ color: paused ? 'var(--color-muted)' : tint }}
      >
        {formatClock(sec)}
      </span>
    </>
  )

  const shell = `inline-flex items-center justify-center gap-1 ${box} shrink-0`
  const skin = undefined

  if (!onOpen) {
    return (
      <span
        className={shell}
        style={skin}
        // A live region would announce a new time every second, which is a screen
        // reader reading a stopwatch aloud for the length of a workout. The label
        // states what it is; the value is read on demand.
        role="timer"
        aria-label={label}
      >
        {body}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${shell} active:scale-95 transition-transform`}
      style={skin}
      aria-label={`${label}. Tap for start time and pause`}
    >
      {body}
    </button>
  )
})
