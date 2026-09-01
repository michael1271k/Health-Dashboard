'use client'

import { useEffect, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { animate } from 'framer-motion'
import { project, GESTURE_SLOP, rubberband } from '@/lib/motion'

/**
 * ── THE BACK GESTURE, IN THE PAGE, BECAUSE WKWEBVIEW WILL NOT DO IT ──────────
 *
 * `HelixViewController` sets `allowsBackForwardNavigationGestures`, which is the
 * documented way to get the system's interactive pop, and on this app it does
 * nothing at all. The reason is not the flag: WebKit's swipe is SNAPSHOT-backed
 * — the gesture controller needs a rendered image of the previous page to slide
 * in under your thumb — and it only has one for a real page load. Every
 * navigation in an App Router app is `history.pushState`, a SAME-DOCUMENT entry
 * with no snapshot, so the recogniser never arms and the edge swipe is silently
 * a no-op. That is exactly the reported symptom.
 *
 * There is no configuration that fixes it, so the gesture is owned here. That is
 * also the better place for it: it now pops an App Router route rather than a
 * WebKit history entry, which are not the same list, and it cannot walk off the
 * front of the app into whatever the shell loaded first.
 *
 * ── WHAT MAKES IT FEEL LIKE THE REAL ONE ─────────────────────────────────────
 * Four things, and all four are the difference between this and a swipe
 * listener:
 *
 *   1. It tracks 1:1. The page is glued to the thumb for the whole drag, not
 *      animated once at the end. Direct manipulation is the entire point.
 *   2. It is claimed, not detected. Vertical travel hands the gesture back to
 *      the scroller immediately; horizontal travel past `GESTURE_SLOP` claims it
 *      and calls `preventDefault` from then on, so the page cannot scroll and
 *      swipe at once.
 *   3. The release is PROJECTED, not thresholded on position. A fast 40px flick
 *      commits and a slow 200px drag does not — which is what the hand meant in
 *      both cases. `project()` is Apple's own deceleration form.
 *   4. It is interruptible: the settle animation is a spring on the same node,
 *      and grabbing the page mid-flight re-enters the drag from wherever it
 *      currently is rather than from where it was heading.
 *
 * ── AND WHY THE TRANSFORM IS WRITTEN IMPERATIVELY ────────────────────────────
 * Same reason `PullToRefresh` does it: a permanently transformed ancestor is a
 * containing block for every `position: fixed` descendant, forces a compositor
 * layer over the whole page, and on iOS makes a nested `backdrop-filter` sample
 * the wrong buffer and paint solid black. The property is set while the finger
 * is down and REMOVED at rest, so none of that is true for the 99.9% of the
 * app's life when nobody is swiping. `body.helix-swiping` covers the same
 * backdrop-filter hazard for the duration, exactly as an open overlay does.
 */

/** How far in from the leading edge a touch must start. Apple's is ~20pt. */
const EDGE_PX = 24

/** Fraction of the viewport the PROJECTED release must pass to commit. */
const COMMIT_FRACTION = 0.4

/** A flick this fast commits regardless of distance (px/s). */
const COMMIT_VELOCITY = 550

/**
 * Client navigations this JS context has seen.
 *
 * A push route reached by tapping into it has somewhere to go back TO. The same
 * route cold-started or deep-linked into does not, and `router.back()` there
 * walks out of the app entirely. `template.tsx` mounts once per navigation
 * including the first, so a count above one means at least one in-app move has
 * happened — and a hard reload resets it, which is correct: after a reload the
 * history behind this page is not ours.
 */
let navigations = 0
export function markNavigation(): void { navigations += 1 }
export function canGoBack(): boolean { return navigations > 1 }

type Tracker = {
  startX: number
  startY: number
  claimed: boolean
  x: number
  lastX: number
  lastT: number
  velocity: number
}

/**
 * Bind the interactive back gesture to `node` while `enabled`.
 *
 * Everything is torn down on cleanup, including the body class and any inline
 * transform, so a route change mid-swipe cannot leave the page parked off
 * screen.
 */
export function useEdgeSwipeBack(node: RefObject<HTMLElement | null>, enabled: boolean): void {
  const router = useRouter()

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const el = node.current
    if (!el) return

    let t: Tracker | null = null
    let settling: { stop: () => void } | null = null

    const width = () => window.innerWidth || 1

    const paint = (x: number) => {
      el.style.transform = x === 0 ? '' : `translate3d(${x}px,0,0)`
      // A real push dims what it is covering. There is no previous screen to
      // dim here, so the moving page carries the separation itself.
      el.style.boxShadow = x === 0 ? '' : '-12px 0 32px rgba(0,0,0,0.45)'
    }

    const release = () => {
      el.style.transform = ''
      el.style.boxShadow = ''
      el.style.willChange = ''
      document.body.classList.remove('helix-swiping')
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { t = null; return }
      const touch = e.touches[0]
      if (touch.clientX > EDGE_PX) { t = null; return }
      // Read at gesture time, not at bind time: the count moves underneath a
      // mounted effect every time the user navigates.
      if (!canGoBack()) { t = null; return }
      // An in-flight settle is grabbable — that is requirement (4). Stop it and
      // start the new drag from wherever the page currently sits.
      settling?.stop()
      settling = null
      t = {
        startX: touch.clientX, startY: touch.clientY,
        claimed: false, x: 0,
        lastX: touch.clientX, lastT: e.timeStamp, velocity: 0,
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!t || e.touches.length !== 1) return
      const touch = e.touches[0]
      const dx = touch.clientX - t.startX
      const dy = touch.clientY - t.startY

      if (!t.claimed) {
        // The scroller wins a vertical intent outright — no arbitration, no
        // delay. Anything else would put a hesitation on every downward flick
        // that happens to start near the edge.
        if (Math.abs(dy) > Math.abs(dx)) { t = null; return }
        if (dx < GESTURE_SLOP) return
        t.claimed = true
        document.body.classList.add('helix-swiping')
        el.style.willChange = 'transform'
      }

      // Claimed: the gesture is ours, so the page must not also scroll.
      e.preventDefault()

      const dt = e.timeStamp - t.lastT
      if (dt > 0) t.velocity = ((touch.clientX - t.lastX) / dt) * 1000
      t.lastX = touch.clientX
      t.lastT = e.timeStamp

      // Past the origin there is nothing to reveal, so resist instead of
      // stopping dead — the surface stays alive under the finger.
      t.x = dx >= 0 ? dx : -rubberband(-dx, width())
      paint(t.x)
    }

    const settle = (to: number, velocity: number, then?: () => void) => {
      const from = t?.x ?? 0
      const controls = animate(from, to, {
        type: 'spring',
        bounce: 0,
        duration: 0.34,
        velocity,
        onUpdate: paint,
        onComplete: () => { settling = null; then?.() },
      })
      settling = controls
    }

    const onTouchEnd = () => {
      if (!t) return
      if (!t.claimed) { t = null; return }

      const w = width()
      const projected = t.x + project(t.velocity)
      const commit = projected > w * COMMIT_FRACTION || t.velocity > COMMIT_VELOCITY
      const velocity = t.velocity

      if (commit) {
        settle(w, velocity, () => {
          // Order matters: navigate first so the outgoing node is replaced in
          // the same commit that clears the transform, rather than snapping
          // back into view for a frame first.
          router.back()
          release()
        })
      } else {
        settle(0, velocity, release)
      }
      t = null
    }

    const onTouchCancel = () => {
      if (t?.claimed) settle(0, t.velocity, release)
      t = null
    }

    // `touchmove` is the only non-passive one, because it is the only one that
    // calls preventDefault. The other three stay passive so they never sit on
    // the scrolling path.
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchCancel)
      settling?.stop()
      t = null
      release()
    }
  }, [enabled, node, router])
}
