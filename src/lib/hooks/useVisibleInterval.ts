'use client'

import { useEffect, useRef } from 'react'

/**
 * ── AN INTERVAL THAT STOPS WHEN NOBODY IS LOOKING ────────────────────────────
 *
 * Four separate places in this app ran `setInterval` for a number that is only
 * ever READ off the screen — the session clock, the elapsed readout, the widget
 * stack rotator, the dashboard's "next dose" minute. Every one of them kept
 * firing while the app was backgrounded, and the two in the logger fired while
 * the phone was in a pocket between sets, which is precisely the window this
 * app is supposed to be cheapest in.
 *
 * iOS throttles timers in a backgrounded WKWebView rather than stopping them,
 * so the cost is not zero and the timing is not trustworthy. Both problems have
 * the same answer: do not run the interval at all unless the document is
 * visible, and RESYNC on the way back rather than resuming from wherever the
 * throttled timer happened to be.
 *
 * The resync is why `tick` fires immediately on becoming visible. Every caller
 * derives its value from `Date.now()` (never by decrementing a counter — see
 * `RestCountdown`, which established the pattern), so one call on resume is
 * enough to make the display correct again.
 *
 * `tick` is held in a ref, so an inline arrow at the call site does not restart
 * the interval on every render — the dependency list is `[ms, enabled]` only.
 *
 * @param tick    Called every `ms` while visible, and once on becoming visible.
 * @param ms      Period. Pick the smallest interval the DISPLAY can actually
 *                show: a `mm:ss` readout is 1000, not 250.
 * @param enabled Off entirely when false (paused clock, unmounted sheet).
 */
export function useVisibleInterval(tick: () => void, ms: number, enabled = true): void {
  const cb = useRef(tick)
  cb.current = tick

  useEffect(() => {
    if (!enabled) return

    let id: ReturnType<typeof setTimeout> | null = null

    const stop = () => {
      if (id != null) { clearTimeout(id) ; id = null }
    }
    /**
     * ── IT SCHEDULES TO THE BOUNDARY, NOT `ms` FROM WHENEVER IT STARTED ──────
     *
     * This was `setInterval(tick, ms)`, and at ms = 1000 that is a clock whose
     * phase is wherever the component happened to mount. Every caller here
     * derives its reading from `Date.now()`, so the VALUE was always right —
     * but it was only redrawn on this interval's own phase, which meant the
     * seconds figure could sit up to 999 ms stale before flipping. Against the
     * phone's own clock beside it, that reads exactly as the workout timer
     * "running slightly slow": it is not losing time, it is announcing each
     * second late, by an amount that never changes.
     *
     * A chained `setTimeout` aimed at the next exact multiple of `ms` since the
     * epoch fixes the phase AND the drift: every tick re-derives its own delay
     * from the wall clock, so a late callback (a busy frame, a throttled
     * background timer, a jetsam-and-restore) is corrected on the next hop
     * rather than accumulating. The floor of 16 ms stops a tick that arrives a
     * hair early from scheduling a zero-delay spin.
     */
    const start = () => {
      if (id != null) return
      const step = () => {
        cb.current()
        const now = Date.now()
        id = setTimeout(step, Math.max(16, ms - (now % ms)))
      }
      id = setTimeout(step, Math.max(16, ms - (Date.now() % ms)))
    }

    const sync = () => {
      if (document.visibilityState === 'visible') {
        cb.current()
        start()
      } else {
        stop()
      }
    }

    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      stop()
    }
  }, [ms, enabled])
}
