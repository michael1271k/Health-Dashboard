'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Odometer-style count-up for hero stats (score, battery). Animates from the
 * previous value on change; respects the reduce-motion preference (instant).
 */
export function KineticNumber({ value, className, duration = 900, decimals = 0 }: {
  value: number | null
  className?: string
  duration?: number
  /** Decimal places to preserve. Default 0 (scores/steps). Pass 1 for weight —
   *  this used to Math.round unconditionally, which is why 64.9 rendered as 65. */
  decimals?: number
}) {
  const [display, setDisplay] = useState(value ?? 0)
  const fromRef = useRef(value ?? 0)

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return
    const factor = 10 ** decimals
    const quantize = (n: number) => Math.round(n * factor) / factor
    const reduce = typeof document !== 'undefined' && document.documentElement.dataset.reduceMotion === 'true'
    if (reduce) { setDisplay(quantize(value)); fromRef.current = value; return }
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(quantize(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, decimals])

  if (value == null || !Number.isFinite(value)) return <span className={className}>—</span>
  return <span className={className}>{Number.isFinite(display) ? display.toFixed(decimals) : '—'}</span>
}
