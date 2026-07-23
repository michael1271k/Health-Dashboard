'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { RefreshCw, Check } from 'lucide-react'
import { forceHealthKitSync } from '@/lib/native/sync'
import { tapLight } from '@/lib/native/haptics'
import { invalidateHealthData } from '@/lib/query/workoutKeys'

const ACCENT = '#E2683A' // ember — the new signature accent

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
  const [doneAt, setDoneAt] = useState<number | null>(null) // shows "Updated HH:MM" briefly

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
        // Refresh in place: pull fresh Apple Health (native) + recompute score.
        if (Capacitor.isNativePlatform()) await forceHealthKitSync(() => invalidateHealthData(queryClient)).catch(() => {})
      } finally {
        setRefreshing(false)
        setPull(0)
        // Revalidate ONLY the health-derived surfaces (not the whole cache) — the
        // spinner is already released, so refetches happen off the critical path.
        invalidateHealthData(queryClient)
        // Flash an "Updated HH:MM" confirmation, then fade it.
        setDoneAt(Date.now())
        window.setTimeout(() => setDoneAt(null), 1800)
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
  const done = doneAt != null
  // The pill is visible while pulling, syncing, or briefly after completion.
  const visible = pull > 0 || refreshing || done
  const doneTime = done ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(doneAt!) : ''

  return (
    <>
      {/* One premium sync capsule — breathes while syncing, confirms when done */}
      <div
        aria-hidden={!visible}
        className="fixed left-1/2 z-[70] pointer-events-none"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          transform: `translate3d(-50%, ${refreshing || done ? 0 : pull - 44}px, 0)`,
          opacity: done ? 1 : refreshing ? 1 : progress,
          transition: (pull === 0 && !refreshing) || done ? 'transform 0.28s cubic-bezier(0.32,0.72,0,1), opacity 0.3s ease' : undefined,
        }}
      >
        <span
          className={`flex items-center gap-2 rounded-full pl-2.5 pr-3.5 py-1.5 ${refreshing ? 'sync-breathe' : ''}`}
          style={{
            background: 'rgba(10,11,14,0.82)',
            backdropFilter: 'blur(16px) saturate(160%)',
            WebkitBackdropFilter: 'blur(16px) saturate(160%)',
            border: `1px solid ${done ? '#4FB47755' : ACCENT + '55'}`,
            boxShadow: `0 6px 20px rgba(0,0,0,0.5), 0 0 16px ${(done ? '#4FB477' : ACCENT)}22`,
          }}
        >
          {done ? (
            <Check className="w-3.5 h-3.5" style={{ color: '#4FB477' }} />
          ) : (
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              style={{ color: ACCENT, transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }} />
          )}
          <span className="text-[11px] font-semibold tracking-wide whitespace-nowrap"
            style={{ color: done ? '#4FB477' : ACCENT }}>
            {done ? `Updated ${doneTime}` : refreshing ? 'Syncing…' : 'Pull to sync'}
          </span>
        </span>
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
