'use client'

import { useEffect } from 'react'
import { m } from 'framer-motion'
import { resetOverlayLock } from '@/components/ui/overlay'

/**
 * Route transition wrapper — App Router remounts this on every navigation, so
 * each tab change gets a smooth fade + rise (transform/opacity only, 60fps).
 *
 * No transition prop and no reduce-motion branch: MotionConfig in
 * MotionProvider supplies the STANDARD spring, and its `reducedMotion` setting
 * strips the `y` on its own while keeping the opacity fade. A spring also beats
 * the old fixed 240ms tween here — navigate twice quickly and the second
 * transition starts from wherever the first one had reached, instead of
 * snapping back to y:8 and replaying.
 *
 * The remount is also why the overlay amnesty lives here. No overlay outlives a
 * navigation, so anything still locked on <body> at this point is a leak, and
 * this is the one place in the app guaranteed to run at that moment.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => { resetOverlayLock() }, [])

  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {children}
    </m.div>
  )
}
