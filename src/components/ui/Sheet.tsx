'use client'

import { useCallback, useRef, useState } from 'react'
import { animate, m, AnimatePresence, useDragControls, useMotionValue, type AnimationPlaybackControls } from 'framer-motion'
import { X } from 'lucide-react'
import { Portal, useOverlayBodyLock } from './overlay'
import { tapLight } from '@/lib/native/haptics'
import {
  CROSSFADE, DRAWER, MOMENTUM, STANDARD,
  nearestSnap, project, rubberband, useHelixReducedMotion,
} from '@/lib/motion'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  maxHeight?: string
  /** 'wide' widens the ≥sm dialog for dense content (the Command Center deck). */
  size?: 'default' | 'wide'
  children: React.ReactNode
}

/**
 * A swipe-to-dismiss bottom sheet on phones, a centered dialog on ≥sm.
 *
 * The panel is a SOLID surface — no backdrop-filter — so dragging never
 * triggers a per-frame blur repaint. Drag starts from the header handle only
 * (`dragListener={false}`), so it never fights the scrollable content.
 *
 * ── WHY THE RELEASE RULE CHANGED ─────────────────────────────────────────────
 * It used to be `if (offset.y > 110 || velocity.y > 500) onClose()`. Two things
 * that rule gets backwards:
 *
 *   · a slow, deliberate 130px drag DISMISSED, even though the user visibly
 *     stopped pulling — they were past an arbitrary line;
 *   · a fast 40px flick did NOT dismiss, because it never crossed it.
 *
 * The hand's intent is not in the position at release, it is in the momentum.
 * So the endpoint is PROJECTED forward from the release velocity the way scroll
 * deceleration is, and the sheet snaps to whichever of {open, dismissed} that
 * projection lands nearest. Now the flick throws it away and the slow drag
 * springs home, which is what each one asked for.
 *
 * ── WHY A SINGLE MOTION VALUE ────────────────────────────────────────────────
 * `y` is written by BOTH the drag and every settle animation. That is what
 * makes the sheet interruptible: grabbing a sheet mid-dismiss cancels the
 * in-flight animation and the drag continues from the live on-screen value
 * instead of jumping. There is deliberately no `isAnimating` state, nothing
 * disabled during a transition, and no `pointer-events: none`.
 */
export function Sheet({ open, onClose, title, maxHeight = '90dvh', size = 'default', children }: SheetProps) {
  const controls = useDragControls()
  const panel = useRef<HTMLDivElement>(null)
  const running = useRef<AnimationPlaybackControls | null>(null)
  const y = useMotionValue(0)
  const [grabbing, setGrabbing] = useState(false)
  const reduce = useHelixReducedMotion()

  useOverlayBodyLock(open, onClose)

  const height = useCallback(() => panel.current?.offsetHeight ?? window.innerHeight, [])

  /** Cancel whatever is animating `y` so a new gesture owns it outright. */
  const seize = useCallback(() => {
    running.current?.stop()
    running.current = null
  }, [])

  /**
   * The one dismissal path, so the way out is identical whether it came from
   * the X, the backdrop or Escape — enter and exit along the same line.
   */
  const dismiss = useCallback(() => {
    seize()
    if (reduce) { onClose(); return }
    running.current = animate(y, height(), STANDARD)
    void running.current.finished.then(onClose).catch(() => {})
  }, [seize, reduce, y, height, onClose])

  // z-ladder: nav 50 · PullToRefresh 70 · Sheet 80 · LiquidModal 85 · DatePicker 90
  return (
    <Portal>
    <AnimatePresence onExitComplete={() => y.set(0)}>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          {/* Backdrop — plain (no blur) so only a cheap opacity fade animates */}
          <m.div
            className="absolute inset-0 bg-black/65"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={CROSSFADE}
            onClick={dismiss}
            aria-hidden="true"
          />

          {/* Panel — solid surface, transform-only motion */}
          <m.div
            ref={panel}
            className={`relative w-full ${size === 'wide' ? 'sm:max-w-2xl' : 'sm:max-w-lg'} flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl safe-pb sm:pb-0`}
            style={{
              maxHeight,
              y,
              background: 'rgba(12,13,17,0.96)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 -10px 48px rgba(0,0,0,0.6)',
            }}
            // A little scale alongside the travel so the surface reads as
            // arriving rather than sliding — the solid-surface equivalent of
            // letting a material materialise.
            initial={reduce ? { opacity: 0 } : { y: '100%', scale: 0.985 }}
            animate={reduce ? { opacity: 1 } : { y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { y: '100%', scale: 0.985 }}
            // bounce 0 on OPEN: nothing was thrown, so nothing should overshoot.
            transition={reduce ? CROSSFADE : STANDARD}
            // A drag that cannot move is a lie, so reduced motion has none. The
            // X and the backdrop remain, because removing the way out is never
            // the accessible choice.
            drag={reduce ? false : 'y'}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0}      // resistance is ours, below
            dragMomentum={false} // and so is the projection
            onDragStart={seize}
            onDrag={(_, info) => {
              // Down tracks the finger 1:1. Up resists progressively — there is
              // nothing above "open", and a hard stop there reads as a freeze.
              if (info.offset.y < 0) y.set(-rubberband(-info.offset.y, height(), 0.55))
            }}
            onDragEnd={(_, info) => {
              const current = y.get()          // the presentation value, never the target
              const velocity = info.velocity.y // px/s, signed
              const full = height()
              const projected = current + project(velocity)
              const target = nearestSnap(projected, [0, full])

              seize()
              if (target === 0) {
                // Settling back open after a gesture that carried momentum —
                // the one place a little overshoot is earned.
                running.current = animate(y, 0, { ...DRAWER, velocity })
              } else {
                // Thrown out. Hand the finger's exact speed to the spring so
                // there is no seam between dragging and animating, and unmount
                // only once it has landed.
                running.current = animate(y, full, { ...MOMENTUM, velocity })
                void running.current.finished.then(onClose).catch(() => {})
              }
            }}
          >
            {/* Header / drag affordance — drag starts here only */}
            <div
              className="shrink-0 px-5 pt-2"
              onPointerDown={(e) => {
                seize()
                controls.start(e)
                setGrabbing(true)
                void tapLight()   // same frame as the visual, per the grabber below
              }}
              onPointerUp={() => setGrabbing(false)}
              onPointerCancel={() => setGrabbing(false)}
              style={{ touchAction: 'none', cursor: grabbing ? 'grabbing' : 'grab' }}
            >
              <div className="sm:hidden flex justify-center pb-3">
                {/* Lifts on touch-DOWN. Waiting for the drag to move first is
                    what makes a grabber feel unresponsive. */}
                <span
                  className={`h-1.5 w-10 rounded-full transition-colors duration-100 ${grabbing ? 'bg-white/45' : 'bg-white/20'}`}
                  aria-hidden="true"
                />
              </div>
              <div className="flex items-center justify-between mb-2">
                {title
                  ? <h2 className="font-heading font-semibold text-fluid-lg text-text">{title}</h2>
                  : <span />}
                <button
                  onClick={dismiss}
                  className="-mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted hover:text-text active:scale-95 transition-transform"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pb-5">
              {children}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
    </Portal>
  )
}
