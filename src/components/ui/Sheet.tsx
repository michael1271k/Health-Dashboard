'use client'

import { useCallback, useRef, useState } from 'react'
import { animate, m, AnimatePresence, useDragControls, useMotionValue, useTransform, type AnimationPlaybackControls } from 'framer-motion'
import { X } from 'lucide-react'
import { Portal, useOverlayBodyLock } from './overlay'
import { tapLight } from '@/lib/native/haptics'
import {
  CROSSFADE, DRAWER, SNAPPY,
  nearestSnap, project, rubberband, useHelixReducedMotion,
} from '@/lib/motion'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  maxHeight?: string
  /** 'wide' widens the ≥sm dialog for dense content. */
  size?: 'default' | 'wide'
  /**
   * Hex. Draws a 2px hairline inside the panel's top edge, so a sheet can carry
   * its domain's colour the way the app bar does. This is the one thing the old
   * centred LiquidModal did that the Sheet could not, and the reason its call
   * sites could not simply move across.
   */
  accent?: string
  /**
   * Paint order. `stacked` sits above a sheet that is already open.
   *
   * The body-scroll lock is ref-counted already (see overlay.tsx), so stacking
   * has always been SAFE — what was missing was a z-index that made the inner
   * surface land on top. The dashboard's supplement sheet opens two of its own,
   * and at one z-index the child painted behind its parent.
   */
  layer?: 'base' | 'stacked'
  /**
   * Trim the bottom padding under the content.
   *
   * The default `pb-5` is right for a sheet you scroll — it keeps the last row
   * clear of the home indicator and gives the scroll an end. It is wrong for a
   * short sheet that fits in one screen, where the panel already carries
   * `safe-pb`: the two stack, and a three-row sheet ends in 40-odd pixels of
   * nothing under its last control, which reads as a sheet that failed to
   * shrink to its contents.
   *
   * Only for sheets whose content genuinely cannot overflow.
   */
  compact?: boolean
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
export function Sheet({
  open, onClose, title, maxHeight = '90dvh', size = 'default', accent, layer = 'base',
  compact = false, children,
}: SheetProps) {
  const controls = useDragControls()
  const panel = useRef<HTMLDivElement>(null)
  const running = useRef<AnimationPlaybackControls | null>(null)
  const y = useMotionValue(0)
  const [grabbing, setGrabbing] = useState(false)
  const reduce = useHelixReducedMotion()

  useOverlayBodyLock(open, onClose)

  // Same reason as `useOverlayBodyLock`'s: every consumer passes an inline
  // arrow, so depending on `onClose` directly gives `dismiss` a new identity on
  // every parent render — and `dismiss` is the backdrop's onClick.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const height = useCallback(() => panel.current?.offsetHeight ?? window.innerHeight, [])

  /**
   * The panel height, measured ONCE per gesture.
   *
   * `onDrag` used to call `height()` — i.e. read `offsetHeight` — on every
   * frame the finger moved upward, which forces the browser to flush style and
   * layout mid-gesture, every frame, to obtain a number that cannot change: the
   * panel is not resizing while you drag it. That is the jank in the
   * swipe-to-dismiss, and it is invisible in a profile unless you look for
   * forced-reflow warnings specifically.
   */
  const dragH = useRef(0)

  /** Cancel whatever is animating `y` so a new gesture owns it outright. */
  const seize = useCallback(() => {
    running.current?.stop()
    running.current = null
  }, [])

  /**
   * Backdrop opacity, driven by the drag rather than by a fixed tween.
   *
   * The backdrop used to be a 0.16s crossfade completely decoupled from the
   * panel, so a slow swipe-down pulled the sheet across a veil that stayed at
   * full strength until the gesture ENDED and then snapped away. The sheet
   * moved with the finger; the room behind it did not. That is the specific
   * reason the gesture read as unfinished rather than merely slow.
   *
   * Composed with the enter/exit fade on the parent (opacity multiplies), so
   * this only ever darkens what the crossfade is already doing.
   */
  const veil = useTransform(y, (v) => {
    if (v <= 0) return 1
    const h = dragH.current || height()
    return h > 0 ? Math.max(0, 1 - v / h) : 1
  })

  /**
   * The one dismissal path, so the way out is identical whether it came from
   * the X, the backdrop or Escape — enter and exit along the same line.
   *
   * ── WHY THIS CLOSES SYNCHRONOUSLY ────────────────────────────────────────────
   * It used to animate the panel out itself and call `onClose` from the
   * animation's promise:
   *
   *     running.current = animate(y, height(), SNAPPY)
   *     void running.current.finished.then(() => closeRef.current())
   *
   * `seize()` calls `.stop()`, and a stopped animation's `finished` promise
   * NEVER SETTLES — it neither resolves nor rejects. That promise was the only
   * path to `onClose`, so any interrupt stranded the sheet: `open` stayed true
   * with the panel parked mid-travel and the veil already faded out. The root is
   * `fixed inset-0 z-[80]` and the nav is z-50, so one stranded sheet is an
   * invisible sheet of glass over the entire application. Every tap — tabs,
   * tiles, everything — lands on it. Only a force-quit recovers.
   *
   * The interrupt is not exotic. `seize()` runs on pointerdown anywhere in the
   * header, so tapping the X and letting a finger brush the header inside the
   * 0.28s close was enough to kill the app.
   *
   * So the animation stops being load-bearing. `onClose` is called outright, and
   * AnimatePresence's `exit` — which already animates `y: '100%'` — owns the
   * travel. The panel was being animated out TWICE before this; now it is
   * animated out once, by the mechanism that also unmounts it, so there is no
   * longer any way for the visual and the state to disagree.
   */
  const dismiss = useCallback(() => {
    seize()
    closeRef.current()
  }, [seize])

  // z-ladder: nav 50 · PullToRefresh 70 · Sheet 80 · stacked Sheet 88 · DatePicker 90
  return (
    <Portal>
    <AnimatePresence onExitComplete={() => y.set(0)}>
      {open && (
        <div
          // Keyed even though it is the only child. AnimatePresence tracks
          // presence BY KEY, and the dashboard drives seven different bodies
          // through one <Sheet>, so "the only child" is a claim about this
          // render and not about the component.
          key="sheet"
          className={`fixed inset-0 flex items-end justify-center sm:items-center ${layer === 'stacked' ? 'z-[88]' : 'z-[80]'}`}
          role="dialog" aria-modal="true"
        >
          {/* Backdrop — plain (no blur) so only a cheap opacity fade animates.
              Two elements: the outer owns the enter/exit crossfade, the inner
              tracks the drag. Opacity composes, so the veil lifts as the sheet
              travels instead of holding full strength until release. */}
          <m.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={CROSSFADE}
            onClick={dismiss}
            aria-hidden="true"
          >
            <m.div className="absolute inset-0 bg-black/65" style={{ opacity: veil }} />
          </m.div>

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
            //
            // SNAPPY (0.28s) rather than STANDARD (0.4s). STANDARD is the
            // tree-wide default from MotionConfig, and inheriting it here meant
            // every sheet took four tenths of a second to arrive — which is the
            // entire "it takes a second to load when tapped" complaint, with no
            // data or rendering involved at all. SNAPPY keeps bounce at 0, so
            // the no-overshoot rule above still holds; it just stops the panel
            // from being the slowest thing on screen.
            transition={reduce ? CROSSFADE : SNAPPY}
            // A drag that cannot move is a lie, so reduced motion has none. The
            // X and the backdrop remain, because removing the way out is never
            // the accessible choice.
            drag={reduce ? false : 'y'}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0}      // resistance is ours, below
            dragMomentum={false} // and so is the projection
            onDragStart={() => { seize(); dragH.current = height() }}
            onDrag={(_, info) => {
              // Down tracks the finger 1:1. Up resists progressively — there is
              // nothing above "open", and a hard stop there reads as a freeze.
              //
              // `dragH.current` is measured once at dragStart. Reading
              // offsetHeight here instead forced a layout flush every frame.
              if (info.offset.y < 0) y.set(-rubberband(-info.offset.y, dragH.current, 0.55))
            }}
            onDragEnd={(_, info) => {
              const current = y.get()          // the presentation value, never the target
              const velocity = info.velocity.y // px/s, signed
              const full = dragH.current || height()
              const projected = current + project(velocity)
              const target = nearestSnap(projected, [0, full])

              seize()
              if (target === 0) {
                // Settling back open after a gesture that carried momentum —
                // the one place a little overshoot is earned. Nothing downstream
                // depends on this finishing, so it is safe to seize.
                running.current = animate(y, 0, { ...DRAWER, velocity })
              } else {
                // Thrown out. Close NOW and let the exit carry it the rest of
                // the way from wherever the finger left it — see `dismiss`.
                //
                // The cost is the velocity handoff: the exit spring starts from
                // rest rather than at the speed of the throw. That continuity
                // was worth having, but it was bought with a promise that could
                // be orphaned into an app-wide freeze, and no amount of polish
                // on a gesture is worth a force-quit.
                closeRef.current()
              }
            }}
          >
            {accent && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-0.5 rounded-t-3xl"
                style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
              />
            )}

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
            <div className={`flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 ${compact ? 'pb-1' : 'pb-5'}`}>
              {children}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
    </Portal>
  )
}
