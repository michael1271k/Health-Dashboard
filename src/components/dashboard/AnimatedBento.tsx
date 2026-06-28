'use client'

import { m, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface AnimatedCardProps {
  children: ReactNode
  index?: number
}

/**
 * Card entrance — OPACITY ONLY (no transform / will-change). A transformed or
 * will-change'd ancestor composites the child on iOS, which makes the glass
 * card's backdrop-filter sample nothing and render solid black. Fading opacity
 * keeps the entrance cheap and lets the glass refract the background correctly.
 */
export function AnimatedCard({ children, index = 0 }: AnimatedCardProps) {
  const reduce = useReducedMotion()
  return (
    <m.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index * 0.04, 0.28), duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </m.div>
  )
}
