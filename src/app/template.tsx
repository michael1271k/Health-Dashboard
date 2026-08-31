'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { m } from 'framer-motion'
import { resetOverlayLock } from '@/components/ui/overlay'
import { routeTransition } from '@/lib/nav/transition'
import { useScrollMemory } from '@/lib/nav/scrollMemory'
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
 * So there are two answers now, chosen by `routeTransition`:
 *
 *   · TAB → nothing at all. No `initial`, no `animate`, no wrapper animation.
 *     Instant, plus `useScrollMemory` putting the tab back where it was, which
 *     is the half of "it feels native" that no amount of easing can supply.
 *   · PUSH → in from the trailing edge on the STANDARD spring `MotionProvider`
 *     already supplies. Direction carries the meaning: you went deeper.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
 * There is no exit animation, and there cannot be one here: `template.tsx`
 * remounts on navigation and the outgoing tree is already gone by the time this
 * runs — an `AnimatePresence` would need to own routing itself. The pop is the
 * WKWebView's own interactive back gesture instead (enabled in
 * `HelixViewController.swift`), which is a real system transition with real
 * interruptibility, and is better than anything reimplementable in the page.
 *
 * A `key` is essential. Without it React reconciles the two routes as the same
 * `m.div` and the enter animation never replays.
 *
 * ── THE OVERLAY AMNESTY STAYS ON EVERY PATH ──────────────────────────────────
 * No overlay outlives a navigation, so anything still locked on <body> at this
 * point is a leak, and this is the one place guaranteed to run at that moment.
 * It must therefore sit OUTSIDE the tab/push branch — an instant tab switch is
 * still a navigation, and it was a leak's only chance to be cleaned up.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const reduce = useHelixReducedMotion()

  useEffect(() => { resetOverlayLock() }, [pathname])
  useScrollMemory(pathname)

  // Reduced motion gets the tab treatment everywhere: a slide is exactly the
  // vestibular movement the setting asks us to drop, and the alternative it
  // wants is not a smaller slide, it is none.
  if (reduce || routeTransition(pathname) === 'tab') return <>{children}</>

  return (
    <m.div key={pathname} initial={{ opacity: 0, x: '4%' }} animate={{ opacity: 1, x: 0 }}>
      {children}
    </m.div>
  )
}
