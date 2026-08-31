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

    let id: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (id != null) { clearInterval(id) ; id = null }
    }
    const start = () => {
      if (id != null) return
      id = setInterval(() => cb.current(), ms)
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
