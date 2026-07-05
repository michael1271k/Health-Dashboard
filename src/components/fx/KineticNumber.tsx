'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Odometer-style count-up for hero stats (score, battery). Animates from the
 * previous value on change; respects the reduce-motion preference (instant).
 */
export function KineticNumber({ value, className, duration = 900 }: { value: number | null; className?: string; duration?: number }) {
  const [display, setDisplay] = useState(value ?? 0)
  const fromRef = useRef(value ?? 0)

  useEffect(() => {
    if (value == null) return
    const reduce = typeof document !== 'undefined' && document.documentElement.dataset.reduceMotion === 'true'
    if (reduce) { setDisplay(value); fromRef.current = value; return }
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  if (value == null) return <span className={className}>—</span>
  return <span className={className}>{display}</span>
}
