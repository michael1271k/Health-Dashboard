'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface AnimatedCardProps {
  children: ReactNode
  index?: number
}

export function AnimatedCard({ children, index = 0 }: AnimatedCardProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      variants={{
        hidden: shouldReduceMotion ? {} : { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: shouldReduceMotion
            ? { duration: 0 }
            : { delay: index * 0.06, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
        },
      }}
      initial="hidden"
      animate="visible"
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  )
}
