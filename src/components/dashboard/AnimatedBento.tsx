'use client'

import { m } from 'framer-motion'
import type { ReactNode } from 'react'
import { STANDARD } from '@/lib/motion'

interface AnimatedCardProps {
  children: ReactNode
  index?: number
}

/**
 * Card entrance — OPACITY ONLY (no transform / will-change). A transformed or
 * will-change'd ancestor composites the child on iOS, which makes any
 * descendant backdrop-filter sample nothing and render solid black. Fading
 * opacity keeps the entrance cheap.
 *
 * The stagger cap is 180ms, down from 280ms. A delay is latency the user did
 * not ask for: the last card in a long list used to sit blank for over a
 * quarter of a second after the data had already arrived. Enough offset to read
 * as a sequence, not enough to feel like waiting.
 */
export function AnimatedCard({ children, index = 0 }: AnimatedCardProps) {
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...STANDARD, delay: Math.min(index * 0.03, 0.18) }}
    >
      {children}
    </m.div>
  )
}
