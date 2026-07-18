'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * On a HARD browser reload (F5 / Cmd-R), always boot the Dashboard instead of
 * re-rendering the deeply-nested tab. A fresh navigation or deep link (type
 * 'navigate') is left alone — only an explicit reload bounces home. This also
 * means a reload never re-instantiates a nested, chunk-mismatch-prone surface.
 */
export function ReloadHome() {
  const router = useRouter()
  useEffect(() => {
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (nav?.type === 'reload' && window.location.pathname !== '/') {
        router.replace('/')
      }
    } catch { /* navigation timing unavailable — no-op */ }
    // Run once on the initial mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
