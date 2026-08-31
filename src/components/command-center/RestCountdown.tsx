'use client'

import { useEffect, useRef, useState } from 'react'
import { Timer } from 'lucide-react'
import { tapSuccess } from '@/lib/native/haptics'
import { EMERALD, STEEL } from '@/lib/theme/palette'

/**
 * The rest between sets, counting DOWN, only while it is running.
 *
 * ── THIS IS NOT THE STOPWATCH THAT WAS DELETED ───────────────────────────────
 * `ExerciseCard` carries a long note about the `RestTimer` that was removed in
 * 5.1: it counted UP from the last tick, stamped `doneAt` on every draft set,
 * wrote `workout_sets.rest_sec`, and answered the wrong question. Three things
 * make this a different control rather than that one coming back.
 *
 *   · It counts DOWN, against the prescription. A clock counting up reports
 *     what happened; this says how much of what the plan asked for is left,
 *     which is the only rest question a lifter has mid-session.
 *   · It writes NOTHING. `rest_sec` is still dead — see `rest-is-a-target`.
 *     This is a timer, not a measurement, and nothing it does reaches the
 *     database.
 *   · It only exists between sets. The old one was always on screen, so it
 *     nagged twenty-four times a session by construction. This mounts on a
 *     tick, and at zero it stops and says "go" once.
 *
 * ── AND IT TICKS OFF A DEADLINE, NOT OFF A COUNTER ───────────────────────────
 * The remaining time is recomputed from `until` on every frame rather than
 * decremented. An interval that decrements a counter drifts, and worse, it
 * simply stops in a backgrounded WKWebView — which on this app is the normal
 * case, because the phone locks between sets. Coming back to a timer that says
 * 1:30 after two minutes in a pocket is worse than no timer.
 */
export function RestCountdown({ until, onDismiss }: {
  /** Epoch ms the rest is over. */
  until: number
  /** Tapped, or finished and acknowledged. */
  onDismiss: () => void
}) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((until - Date.now()) / 1000)))
  // Fired once, at the transition to zero. A ref rather than state: it must not
  // schedule a render, and it must survive the re-render that zero causes.
  const buzzed = useRef(false)

  useEffect(() => {
    buzzed.current = false
    const step = () => {
      const secs = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setLeft(secs)
      if (secs === 0 && !buzzed.current) {
        buzzed.current = true
        void tapSuccess()
      }
    }
    step()
    const id = window.setInterval(step, 250)
    // `visibilitychange` as well as the interval: iOS throttles or drops timers
    // in a backgrounded web view, so returning to the app has to resync rather
    // than resume from wherever the interval was frozen.
    const onVis = () => { if (document.visibilityState === 'visible') step() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [until])

  const over = left === 0
  const color = over ? EMERALD : STEEL
  const mins = Math.floor(left / 60)
  const secs = left % 60

  return (
    <button
      type="button"
      onClick={onDismiss}
      className="shrink-0 inline-flex items-center gap-1 px-2 min-h-[32px] rounded-lg text-[10px] font-bold tabular-nums
                 active:scale-95 transition-transform"
      style={{ color, background: `${color}1f`, border: `1px solid ${color}66` }}
      aria-live="polite"
      aria-label={over ? 'Rest complete' : `${left} seconds of rest left — tap to dismiss`}
      title="Rest — tap to dismiss"
    >
      <Timer className="w-2.5 h-2.5" aria-hidden="true" />
      {/* At zero the numerals would read "0:00", which is a time. The word is
          the instruction, and it is the only thing this control ever says that
          is not a measurement. */}
      {over ? 'GO' : `${mins}:${String(secs).padStart(2, '0')}`}
    </button>
  )
}
