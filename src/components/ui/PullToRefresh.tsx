'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { animate, m, useMotionValue, useTransform } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { RefreshCw, Check } from 'lucide-react'
import { forceHealthKitSync } from '@/lib/native/sync'
import { tapLight } from '@/lib/native/haptics'
import { invalidateHealthData } from '@/lib/query/workoutKeys'
import { DRAWER, SNAPPY, STANDARD, rubberband } from '@/lib/motion'

const ACCENT = '#E0703C' // ember — the new signature accent
const EMERALD = '#3E9E7A'

const THRESHOLD = 72   // px pulled before a refresh fires
const MAX_PULL = 110   // rubber-band ceiling
const SLOP = 14        // px of vertical travel before the pull is "claimed"
const PILL_PARKED = -44 // pill resting position, just above the top edge
const DONE_MS = 1800

type Phase = 'idle' | 'pulling' | 'refreshing' | 'done'

/**
 * Global refresh — mounted once, active on every tab, two entry points:
 *
 *  · TOUCH: a native-feeling pull-to-refresh. It does NOT transform content or
 *    claim the gesture until travel is clearly a downward pull
 *    (`dy > SLOP && dy > |dx|·1.5`), so plain taps and horizontal swipes at the
 *    top of the screen are never intercepted — that was the "top-of-screen
 *    touches don't register" bug. Bails while an overlay is open, mid-scroll, or
 *    on the fullscreen /session deck.
 *
 *  · WEB / POINTER-FINE: there is no pull gesture with a mouse, so the same
 *    refresh is reachable from a fixed button (and ⌘/Ctrl-R is a full page
 *    reload, which is not the same thing — it drops in-memory state and re-runs
 *    the whole bundle rather than revalidating the DB).
 *
 * Both paths run the identical routine: pull fresh Apple Health on native, then
 * revalidate the health-derived queries and flash "Updated HH:MM".
 *
 * ── WHY THE TRANSFORM IS APPLIED IMPERATIVELY, AND ONLY WHILE PULLING ────────
 * This component wraps every page in the app. It used to render
 *
 *     <div style={{ transform: `translate3d(0, ${pull}px, 0)` }}>
 *
 * unconditionally — so at rest it still emitted `translate3d(0,0,0)`. Three
 * consequences, all permanent and all invisible in code review:
 *
 *   1. a transformed element becomes the CONTAINING BLOCK for every
 *      position:fixed descendant in the app, which is why overlays have to be
 *      portalled out to <body>;
 *   2. it forces a compositor layer over the entire page, always;
 *   3. on iOS, a backdrop-filter inside a transformed ancestor samples the
 *      wrong buffer and paints solid black — the exact hazard documented at
 *      globals.css and in AnimatedBento.
 *
 * (3) is why the app's glass surfaces have needed workarounds. Writing the
 * transform straight to the node and REMOVING the property at rest means no
 * containing block and no layer when nothing is moving, which is almost always.
 *
 * The pull is also a MotionValue rather than React state. `setPull()` on every
 * touchmove re-rendered PullToRefresh → AuthGate → the whole page tree roughly
 * sixty times a second, for a gesture whose only job is to move one number.
 * React now sees four state changes per pull instead of ~60 renders.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const startY = useRef<number | null>(null)
  const startX = useRef(0)
  const claimed = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const doneTimer = useRef<number | null>(null)

  // Content offset. Driven at pointer rate; never a React render.
  const y = useMotionValue(0)
  // The sync capsule rides its own value so it can stay pinned and legible
  // while the content springs back underneath it.
  const pill = useMotionValue(PILL_PARKED)
  const pillOpacity = useMotionValue(0)
  // Only meaningful while pulling — during the spin the icon owns its rotation.
  const arrowRotate = useTransform(y, [0, THRESHOLD], [0, 270])

  const [phase, setPhase] = useState<Phase>('idle')
  const [doneAt, setDoneAt] = useState<number | null>(null)
  const refreshing = phase === 'refreshing'

  // Coarse pointer = touch device. Resolved after mount so SSR and the first
  // client paint agree (a media query has no server-side answer).
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    try { setCoarse(window.matchMedia('(pointer: coarse)').matches) } catch { /* non-fatal */ }
  }, [])

  /**
   * Write the offset to the node, and REMOVE the property entirely at rest.
   * `transform: none` would still count as a transform for containing-block
   * purposes on some engines; an absent property cannot.
   */
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    return y.on('change', (v) => {
      if (v === 0) el.style.removeProperty('transform')
      else el.style.transform = `translate3d(0, ${v}px, 0)`
    })
  }, [y])

  useEffect(() => () => { if (doneTimer.current) window.clearTimeout(doneTimer.current) }, [])

  /** The one refresh routine, shared by the pull gesture and the web button. */
  const runRefresh = useCallback(async () => {
    if (phase === 'refreshing') return
    setPhase('refreshing')
    void tapLight()
    // Park the capsule where it can be read; let the content settle back.
    animate(pill, 0, SNAPPY)
    animate(pillOpacity, 1, SNAPPY)
    animate(y, 0, STANDARD)
    try {
      if (Capacitor.isNativePlatform()) await forceHealthKitSync(() => invalidateHealthData(queryClient)).catch(() => {})
    } finally {
      // Revalidate ONLY the health-derived surfaces (not the whole cache) — the
      // spinner is already released, so refetches happen off the critical path.
      invalidateHealthData(queryClient)
      setDoneAt(Date.now())
      setPhase('done')
      doneTimer.current = window.setTimeout(() => {
        setPhase('idle')
        setDoneAt(null)
        animate(pill, PILL_PARKED, STANDARD)
        animate(pillOpacity, 0, STANDARD)
      }, DONE_MS)
    }
  }, [phase, queryClient, pill, pillOpacity, y])

  const onTouchStart = useCallback((e: TouchEvent) => {
    claimed.current = false
    startY.current = null
    if (phase === 'refreshing') return
    if (window.scrollY > 0) return
    if (document.body.classList.contains('helix-overlay-open')) return
    if (pathname?.startsWith('/session')) return
    startY.current = e.touches[0].clientY
    startX.current = e.touches[0].clientX
  }, [phase, pathname])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    const dx = e.touches[0].clientX - startX.current
    if (!claimed.current) {
      // Abandon on upward travel or a horizontal-dominant gesture — leave taps,
      // scrolls and side-swipes (e.g. chart panning) completely untouched.
      if (dy <= 0 || (Math.abs(dx) > 10 && Math.abs(dx) > dy)) { startY.current = null; return }
      if (dy > SLOP && dy > Math.abs(dx) * 1.5) { claimed.current = true; setPhase('pulling') }
      else return
    }
    // Progressive resistance instead of a flat ×0.5. Near the top the two are
    // within a pixel or two of each other; the difference is that this one keeps
    // giving a little at 300px instead of hitting the clamp and going dead.
    const pulled = Math.min(MAX_PULL, rubberband(dy - SLOP, window.innerHeight, 0.55))
    y.set(pulled)
    pill.set(pulled + PILL_PARKED)
    pillOpacity.set(Math.min(1, pulled / THRESHOLD))
  }, [y, pill, pillOpacity])

  const onTouchEnd = useCallback(() => {
    if (startY.current == null && !claimed.current) return
    startY.current = null
    const wasClaimed = claimed.current
    claimed.current = false
    if (!wasClaimed) return

    const released = y.get()
    // Hand the finger's exact speed to the spring so there is no seam between
    // dragging and animating.
    const velocity = y.getVelocity()

    if (released >= THRESHOLD && phase !== 'refreshing') {
      void runRefresh()
      return
    }
    setPhase('idle')
    animate(y, 0, { ...DRAWER, velocity })
    animate(pill, PILL_PARKED, { ...DRAWER, velocity })
    animate(pillOpacity, 0, SNAPPY)
  }, [phase, runRefresh, y, pill, pillOpacity])

  useEffect(() => {
    if (!coarse) return
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [coarse, onTouchStart, onTouchMove, onTouchEnd])

  const done = phase === 'done'
  const doneTime = doneAt != null
    ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(doneAt)
    : ''

  return (
    <>
      {/* One premium sync capsule — breathes while syncing, confirms when done.
          Solid, not frosted: it floats directly over the app bar, and two
          translucent layers sampling each other is exactly the stack that turns
          glass into grey soup. */}
      <m.div
        aria-hidden={phase === 'idle'}
        className="fixed left-1/2 z-[70] pointer-events-none"
        style={{
          top: 'calc(var(--chrome-top, env(safe-area-inset-top, 0px)) + 8px)',
          x: '-50%',
          y: pill,
          opacity: pillOpacity,
        }}
      >
        <span
          className={`flex items-center gap-2 rounded-full pl-2.5 pr-3.5 py-1.5 ${refreshing ? 'sync-breathe' : ''}`}
          style={{
            background: 'rgba(10,11,14,0.94)',
            border: `1px solid ${done ? EMERALD + '55' : ACCENT + '55'}`,
            boxShadow: `0 6px 20px rgba(0,0,0,0.5), 0 0 16px ${(done ? EMERALD : ACCENT)}22`,
          }}
        >
          {done ? (
            <Check className="w-3.5 h-3.5" style={{ color: EMERALD }} />
          ) : refreshing ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: ACCENT }} />
          ) : (
            <m.span className="flex" style={{ rotate: arrowRotate }}>
              <RefreshCw className="w-3.5 h-3.5" style={{ color: ACCENT }} />
            </m.span>
          )}
          <span className="text-[11px] font-semibold tracking-wide whitespace-nowrap"
            style={{ color: done ? EMERALD : ACCENT }}>
            {done ? `Updated ${doneTime}` : refreshing ? 'Syncing…' : 'Pull to sync'}
          </span>
        </span>
      </m.div>

      {/* Web refresh — a mouse has no pull gesture, so the same routine gets a
          fixed affordance. `hidden md:flex` on top of the coarse-pointer check
          because this is the one floating control that could otherwise share a
          corner with the mobile tab bar. Sits clear of the bottom chrome. */}
      {!coarse && (
        <button
          type="button"
          onClick={() => { void runRefresh() }}
          disabled={refreshing}
          aria-label="Refresh data"
          title="Refresh data from the database"
          className="fixed z-[70] right-6 hidden md:flex items-center justify-center rounded-full
                     w-11 h-11 transition-transform active:scale-95 disabled:opacity-60"
          style={{
            bottom: 'calc(1.5rem + var(--chrome-bottom, 0px))',
            background: 'rgba(10,11,14,0.82)',
            backdropFilter: 'blur(16px) saturate(160%)',
            WebkitBackdropFilter: 'blur(16px) saturate(160%)',
            border: `1px solid ${ACCENT}55`,
            boxShadow: `0 6px 20px rgba(0,0,0,0.5), 0 0 16px ${ACCENT}22`,
          }}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} style={{ color: ACCENT }} />
        </button>
      )}

      {/* No style prop. The transform is written to this node only while the
          pull is live — see the header comment. */}
      <div ref={contentRef}>{children}</div>
    </>
  )
}
