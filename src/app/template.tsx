'use client'

import { m, useReducedMotion } from 'framer-motion'

/**
 * Route transition wrapper — App Router remounts this on every navigation, so
 * each tab change gets a smooth fade + rise (transform/opacity only, 60fps).
 * Honors the OS reduce-motion setting.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </m.div>
  )
}
