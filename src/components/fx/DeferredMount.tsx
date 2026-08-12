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
export function DeferredMount({ children, minHeight = 120 }: { children: React.ReactNode; minHeight?: number }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const w = window as IdleWindow
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1200 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(() => setReady(true), 200) // Safari/iOS: no rIC — see above
    return () => clearTimeout(t)
  }, [])
  if (!ready) {
    if (minHeight <= 0) return null
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 animate-pulse" style={{ minHeight }} aria-hidden="true" />
  }
  return <>{children}</>
}
