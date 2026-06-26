'use client'

import { useEffect, useRef } from 'react'
import { animate } from 'framer-motion'

interface AnimatedNumberProps {
  value: number
  duration?: number
  decimals?: number
  className?: string
}

export function AnimatedNumber({ value, duration = 0.8, decimals = 0, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const prevRef = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const prev = prevRef.current
    prevRef.current = value

    const controls = animate(prev, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => {
        el.textContent = v.toFixed(decimals)
      },
    })
    return () => controls.stop()
  }, [value, duration, decimals])

  return (
    <span ref={ref} className={className} aria-live="polite" aria-atomic="true">
      {value.toFixed(decimals)}
    </span>
  )
}
