'use client'

import { useEffect, useState } from 'react'

/**
 * Mounts children only after the main thread goes idle (Phase 16 zero-latency):
 * below-the-fold cards stop competing with the hero for first paint. A fixed
 * min-height placeholder prevents layout shift.
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
    const t = setTimeout(() => setReady(true), 200) // Safari: no rIC
    return () => clearTimeout(t)
  }, [])
  if (!ready) return <div className="helix-card animate-pulse" style={{ minHeight }} aria-hidden="true" />
  return <>{children}</>
}
