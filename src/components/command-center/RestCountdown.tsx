'use client'

import { useEffect, useRef, useState } from 'react'
import { Timer } from 'lucide-react'
import { tapSuccess } from '@/lib/native/haptics'
import { STEEL } from '@/lib/theme/palette'

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
 *     tick and UNMOUNTS at zero.
 *
 * ── THERE IS NO "GO" STATE, AND THERE USED TO BE ─────────────────────────────
 * At zero the chip turned green and read GO, and then held that indefinitely —
 * until it was tapped. So the last thing the control ever did was replace the
 * one fact the chip is for (this lift's target rest) with an instruction that
 * had already been obeyed, and it stayed there through the next set, and the
 * one after that, waiting to be dismissed.
 *
 * The rest ending is not a state worth occupying. The countdown fires its
 * haptic on the crossing — which is the notification, and it lands whether or
 * not you are looking — and then simply hands the slot back: `ExerciseCard`
 * re-renders its target chip, so the row returns to reading the assigned rest
 * for the movement. Nothing to dismiss, nothing to clear, and the chip says the
 * same thing before the rest and after it.
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
  // Read through a ref so ending the rest never has to be a dependency of the
  // ticker — a new inline arrow from the card would otherwise restart the clock.
  const doneRef = useRef(onDismiss)
  doneRef.current = onDismiss

  useEffect(() => {
    buzzed.current = false
    let id = 0
    /**
     * ── IT LANDS ON THE SECOND, NOT 250 ms AFTER IT ────────────────────────
     * This polled at 4 Hz, which is four renders per displayed change and a
     * digit that could still sit up to a quarter-second stale — the readout is
     * `m:ss`, so three of every four ticks drew the number it was already
     * showing. Chaining to the next whole second of the DEADLINE (not of the
     * wall clock: the rest ends when it ends, and the display should flip on
     * that boundary) makes every tick a real change and puts each one within a
     * frame of the moment it becomes true.
     */
    const step = () => {
      const ms = until - Date.now()
      const secs = Math.max(0, Math.ceil(ms / 1000))
      setLeft(secs)
      if (secs === 0) {
        if (!buzzed.current) {
          buzzed.current = true
          void tapSuccess()
        }
        // Hand the slot back to the target chip. See the header: a rest that has
        // finished is not a state, it is the absence of one.
        doneRef.current()
        return
      }
      id = window.setTimeout(step, ((ms - 1) % 1000) + 1)
    }
    step()
    // `visibilitychange` as well: iOS throttles or drops timers in a
    // backgrounded web view, so returning to the app has to resync rather than
    // resume from wherever the timer was frozen.
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(id)
      step()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [until])

  const color = STEEL
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
      aria-label={`${left} seconds of rest left — tap to dismiss`}
      title="Rest — tap to dismiss"
    >
      <Timer className="w-2.5 h-2.5" aria-hidden="true" />
      {`${mins}:${String(secs).padStart(2, '0')}`}
    </button>
  )
}
