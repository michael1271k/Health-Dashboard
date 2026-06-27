'use client'

import { LazyMotion, domMax } from 'framer-motion'

/**
 * Loads framer-motion's DOM features lazily (LazyMotion) so the initial bundle
 * stays small while every `m.*` element animates at 60fps. `domMax` adds drag
 * gestures + layout animations (needed by the bottom Sheet's swipe-to-dismiss
 * and the WidgetDeck's animated segmented highlight). Non-strict so the few
 * existing `motion.*` components keep working.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict={false}>
      {children}
    </LazyMotion>
  )
}
