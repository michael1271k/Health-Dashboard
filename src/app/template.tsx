'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { m } from 'framer-motion'
import { resetOverlayLock } from '@/components/ui/overlay'
import { routeTransition } from '@/lib/nav/transition'
import { useScrollMemory } from '@/lib/nav/scrollMemory'
import { useEdgeSwipeBack, markNavigation } from '@/lib/nav/useEdgeSwipeBack'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'

/**
 * Route transition wrapper — App Router remounts this on every navigation.
 *
 * ── IT USED TO CROSS-FADE EVERYTHING, AND THAT WAS THE TELL ──────────────────
 *
 * Every route change played the same move: fade in from `opacity: 0, y: 8`. A
 * perfectly good WEB transition, and the single clearest sign that this is a
 * website in a frame — because iOS has no such gesture anywhere. A tab bar
 * switches INSTANTLY and returns you to exactly where you left that tab; a
 * hierarchical push slides in from the trailing edge. Playing one animation for
 * both says the five tabs and the day page are the same kind of place, which is
 * the one thing the navigation is supposed to make obvious.
 *
 * So there are two answers, chosen by `routeTransition`:
 *
 *   · TAB → nothing at all. No `initial`, no `animate`, no wrapper animation.
 *     Instant, plus `useScrollMemory` putting the tab back where it was, which
 *     is the half of "it feels native" that no amount of easing can supply.
 *   · PUSH → in from the trailing edge on the STANDARD spring `MotionProvider`
 *     already supplies, and back out under the thumb via `useEdgeSwipeBack`.
 *     Direction carries the meaning: you went deeper, and the way back is the
 *     way you came.
 *
 * ── THE POP IS A GESTURE, NOT AN EXIT ANIMATION ──────────────────────────────
 * There is no `exit` here and there cannot be: `template.tsx` remounts on
 * navigation and the outgoing tree is already gone by the time this runs — an
 * `AnimatePresence` would have to own routing itself. The interactive swipe is
 * the better answer anyway, and it lives on an inner node so that framer's
 * enter animation and the gesture's imperative transform never write to the
 * same element.
 *
 * A `key` is essential. Without it React reconciles the two routes as the same
 * `m.div` and the enter animation never replays.
 *
 * ── EVERYTHING BELOW RUNS ON EVERY ROUTE, INCLUDING INSTANT TAB SWITCHES ─────
 * The overlay amnesty must: no overlay outlives a navigation, so anything still
 * locked on <body> at this point is a leak, and this is the one place
 * guaranteed to run at that moment. So must `markNavigation`, which is how the
 * back gesture knows whether there is anything behind this page to pop.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const reduce = useHelixReducedMotion()
  const push = routeTransition(pathname) === 'push'
  const surface = useRef<HTMLDivElement>(null)

  // Layout effect, so the count is already right if a finger lands on the edge
  // in the same frame the route paints.
  useLayoutEffect(() => { markNavigation() }, [pathname])
  useEffect(() => { resetOverlayLock() }, [pathname])
  useScrollMemory(pathname)
  useEdgeSwipeBack(surface, push)

  // A tab renders the page and nothing else — not even a wrapper element. It
  // has no enter animation and no back gesture (there is nothing above a tab to
  // pop to), so a node here would be a node on every screen for no one.
  if (!push) return <>{children}</>

  const surfaced = <div ref={surface}>{children}</div>

  // Reduced motion drops the SLIDE, not the gesture: a slide is exactly the
  // vestibular movement the setting asks us to remove, while the swipe is
  // direct manipulation, and taking that away would take away a control.
  if (reduce) return surfaced

  return (
    <m.div key={pathname} initial={{ opacity: 0, x: '4%' }} animate={{ opacity: 1, x: 0 }}>
      {surfaced}
    </m.div>
  )
}
