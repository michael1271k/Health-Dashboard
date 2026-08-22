'use client'

import { useEffect, useState } from 'react'

/**
 * Mounts children only after the main thread goes idle:
 * below-the-fold cards stop competing with the hero for first paint. A fixed
 * min-height placeholder prevents layout shift.
 *
 * ── ON iOS THIS IS A 200ms TIMER, NOT AN IDLE CALLBACK ───────────────────────
 * Safari — desktop and iOS, including the WKWebView Capacitor runs the app in —
 * has never shipped `requestIdleCallback`. So on the PRIMARY TARGET DEVICE the
 * branch below is always the `setTimeout` fallback, and every deferred card
 * mounts at a fixed 200ms after paint whether or not the main thread is
 * actually free.
 *
 * That is a defensible behaviour: 200ms reliably clears the hero's first paint,
 * which is the point. What is not defensible is believing this is idle-
 * scheduled on the device it mostly runs on, and then reasoning about boot cost
 * from that belief. It is a delay. Treat it as one.
 *
 * `minHeight={0}` renders NO placeholder at all — for children whose empty
 * state is genuinely zero-height, where a reserved box would create exactly the
 * gap the placeholder exists to prevent.
 */
/**
 * ── THE DELAY IS PAID ONCE PER LAUNCH, NOT ONCE PER NAVIGATION ──────────────
 * `app/template.tsx` remounts the entire page subtree on every tab switch, so
 * `useState(false)` meant every return to a tab re-paid the 200 ms skeleton
 * before its charts could even begin mounting — the deferral was designed to
 * keep heavy widgets off the FIRST paint, and instead it put a stall in front
 * of every navigation for the rest of the session.
 *
 * The flag is module-level on purpose: it lives as long as the JS context, which
 * is exactly the scope of "we have already got past the launch render". A real
 * reload resets it, which is when the deferral is wanted again.
 */
let warmedUp = false

export function DeferredMount({ children, minHeight = 120 }: { children: React.ReactNode; minHeight?: number }) {
  const [ready, setReady] = useState(warmedUp)
  useEffect(() => {
    if (warmedUp) return
    type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const w = window as IdleWindow
    const done = () => { warmedUp = true; setReady(true) }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(done, { timeout: 1200 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(done, 200) // Safari/iOS: no rIC — see above
    return () => clearTimeout(t)
  }, [])
  if (!ready) {
    if (minHeight <= 0) return null
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 animate-pulse" style={{ minHeight }} aria-hidden="true" />
  }
  return <>{children}</>
}
