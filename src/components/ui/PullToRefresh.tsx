'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'

const THRESHOLD = 72   // px pulled before a refresh fires
const MAX_PULL = 110   // rubber-band ceiling

/**
 * Native-feeling pull-to-refresh for touch devices. Only engages when the page
 * is scrolled to the top and the gesture is clearly vertical; the whole pull is
 * driven by translate3d on a single wrapper (compositor-only, no layout). On
 * release past the threshold it invalidates every query so the just-pushed data
 * loads. Pointer-coarse only — desktop is untouched.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY > 0 || refreshing) { startY.current = null; return }
    startY.current = e.touches[0].clientY
  }, [refreshing])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) { setPull(0); return }
    // Rubber-band resistance.
    setPull(Math.min(MAX_PULL, dy * 0.5))
  }, [])

  const onTouchEnd = useCallback(async () => {
    if (startY.current == null) return
    startY.current = null
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPull(THRESHOLD)
      try {
        await queryClient.invalidateQueries()
      } finally {
        setRefreshing(false)
        setPull(0)
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
      {/* Spinner sits in the pulled-down gap */}
      <div
        aria-hidden={pull === 0}
        className="fixed left-1/2 z-[70] flex items-center justify-center pointer-events-none"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 4px)',
          transform: `translate3d(-50%, ${pull - 44}px, 0)`,
          opacity: progress,
          transition: startY.current == null ? 'transform 0.24s ease, opacity 0.24s ease' : undefined,
        }}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'rgba(8,13,24,0.85)', border: '1px solid #6FE9FF55', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            style={{ color: '#6FE9FF', transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }} />
        </span>
      </div>
      <div
        style={{
          transform: `translate3d(0, ${pull}px, 0)`,
          transition: startY.current == null ? 'transform 0.24s cubic-bezier(0.32,0.72,0,1)' : undefined,
        }}
      >
        {children}
      </div>
    </>
  )
}
