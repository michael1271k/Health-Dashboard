'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { RefreshCw } from 'lucide-react'
import { forceHealthKitSync } from '@/lib/native/sync'
import { tapLight } from '@/lib/native/haptics'
import { invalidateHealthData } from '@/lib/query/workoutKeys'

const THRESHOLD = 72   // px pulled before a refresh fires
const MAX_PULL = 110   // rubber-band ceiling
const SLOP = 14        // px of vertical travel before the pull is "claimed"

/**
 * Global, native-feeling pull-to-refresh for touch devices — mounted once and
 * active on every tab. It refreshes in place (no navigation): on release past
 * the threshold it pulls fresh Apple Health (native) and revalidates all queries.
 *
 * Critically, it does NOT transform content or claim the gesture until travel is
 * clearly a downward pull (`dy > SLOP && dy > |dx|·1.5`). Plain taps and
 * horizontal swipes at the top of the screen are never intercepted — that was
 * the "top-of-screen touches don't register" bug. Bails while an overlay is open,
 * mid-scroll, or on the fullscreen /session deck. Pointer-coarse only.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const startY = useRef<number | null>(null)
  const startX = useRef(0)
  const claimed = useRef(false)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const onTouchStart = useCallback((e: TouchEvent) => {
    claimed.current = false
    startY.current = null
    if (refreshing) return
    if (window.scrollY > 0) return
    if (document.body.classList.contains('helix-overlay-open')) return
    if (pathname?.startsWith('/session')) return
    startY.current = e.touches[0].clientY
    startX.current = e.touches[0].clientX
  }, [refreshing, pathname])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    const dx = e.touches[0].clientX - startX.current
    if (!claimed.current) {
      // Abandon on upward travel or a horizontal-dominant gesture — leave taps,
      // scrolls and side-swipes (e.g. chart panning) completely untouched.
      if (dy <= 0 || (Math.abs(dx) > 10 && Math.abs(dx) > dy)) { startY.current = null; return }
      if (dy > SLOP && dy > Math.abs(dx) * 1.5) claimed.current = true
      else return
    }
    setPull(Math.min(MAX_PULL, (dy - SLOP) * 0.5))
  }, [])

  const onTouchEnd = useCallback(async () => {
    if (startY.current == null && !claimed.current) return
    startY.current = null
    const wasClaimed = claimed.current
    claimed.current = false
    if (wasClaimed && pull >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPull(THRESHOLD)
      void tapLight()
      try {
        // Refresh in place: pull fresh Apple Health (native).
        if (Capacitor.isNativePlatform()) await forceHealthKitSync().catch(() => {})
      } finally {
        setRefreshing(false)
        setPull(0)
        // Revalidate ONLY the health-derived surfaces (not the whole cache) — the
        // spinner is already released, so refetches happen off the critical path.
        invalidateHealthData(queryClient)
      }
    } else {
      setPull(0)
    }
  }, [pull, refreshing, queryClient])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [onTouchStart, onTouchMove, onTouchEnd])

  const progress = Math.min(1, pull / THRESHOLD)

  return (
    <>
      {/* Spinner + label sit in the pulled-down gap */}
      <div
        aria-hidden={pull === 0}
        className="fixed left-1/2 z-[70] flex flex-col items-center justify-center gap-1.5 pointer-events-none"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 4px)',
          transform: `translate3d(-50%, ${pull - 44}px, 0)`,
          opacity: progress,
          transition: pull === 0 && !refreshing ? 'transform 0.24s ease, opacity 0.24s ease' : undefined,
        }}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'rgba(8,13,24,0.85)', border: '1px solid #38BDF855', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            style={{ color: '#38BDF8', transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }} />
        </span>
        <span className="text-[11px] font-semibold tracking-wide whitespace-nowrap"
          style={{ color: '#38BDF8' }}>Syncing Data...</span>
      </div>
      <div
        style={{
          transform: `translate3d(0, ${pull}px, 0)`,
          transition: pull === 0 ? 'transform 0.24s cubic-bezier(0.32,0.72,0,1)' : undefined,
        }}
      >
        {children}
      </div>
    </>
  )
}
