'use client'

import { LazyMotion, MotionConfig, domMax } from 'framer-motion'
import { STANDARD, useHelixReducedMotion } from '@/lib/motion'

/**
 * Loads framer-motion's DOM features lazily (LazyMotion) so the initial bundle
 * stays small while every `m.*` element animates at 60fps. `domMax` adds drag
 * gestures + layout animations (needed by the bottom Sheet's swipe-to-dismiss
 * and the WidgetDeck's animated segmented highlight). Non-strict so the few
 * existing `motion.*` components keep working.
 *
 * MotionConfig supplies two things that were previously copy-pasted, or simply
 * absent, at every call site:
 *
 * 1. THE DEFAULT TRANSITION. Any `m.*` without an explicit `transition` now
 *    springs on STANDARD instead of falling back to framer's own default. Six
 *    files used to carry six different hand-tuned {stiffness, damping} pairs.
 *
 * 2. REDUCED MOTION, ONCE. `reducedMotion="user"` honours the OS query
 *    natively; forcing "always" is how the in-app Settings toggle — which
 *    framer has no idea exists — gets bridged in. Either signal now strips
 *    transform and layout animations tree-wide while keeping opacity and
 *    colour, which is the correct behaviour rather than freezing everything.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const reduce = useHelixReducedMotion()
  return (
    <LazyMotion features={domMax} strict={false}>
      <MotionConfig reducedMotion={reduce ? 'always' : 'user'} transition={STANDARD}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
