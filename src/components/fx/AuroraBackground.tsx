'use client'

import { useEffect, useState } from 'react'

/**
 * AuroraBackground — a living, GPU-cheap gradient mesh fixed behind all content
 * (-z-10) so the glass panels refract depth, plus a subtle grain overlay (-z-9).
 *
 * Decoupled from React Query (no longer subscribes to the score) so it never
 * re-renders on data changes — a perf win. Cool cyan / ocean-teal band.
 * Respects prefers-reduced-motion via the global reduced-motion rule.
 */
export function AuroraBackground() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Cool cyan → ocean band (toned-down green), gently shifting by time of day.
  const hour = mounted ? new Date().getHours() : 12
  const baseHue = 195 + Math.round(18 * Math.sin((hour / 24) * Math.PI * 2))
  const sat = 78
  const light = 26
  const c1 = `hsl(${baseHue} ${sat}% ${light}%)`
  const c2 = `hsl(${baseHue + 22} ${sat}% ${light + 3}%)`     // deeper blue
  const c3 = `hsl(${baseHue - 28} ${sat - 6}% ${light - 2}%)` // teal

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <div className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full"
          style={{ background: `radial-gradient(circle, ${c1} 0%, transparent 65%)`, filter: 'blur(80px)', opacity: 0.6, animation: 'auroraDrift1 26s ease-in-out infinite' }} />
        <div className="absolute -bottom-1/4 -right-1/4 w-[65vw] h-[65vw] rounded-full"
          style={{ background: `radial-gradient(circle, ${c2} 0%, transparent 65%)`, filter: 'blur(90px)', opacity: 0.5, animation: 'auroraDrift2 32s ease-in-out infinite' }} />
        <div className="absolute top-1/3 left-1/3 w-[55vw] h-[55vw] rounded-full"
          style={{ background: `radial-gradient(circle, ${c3} 0%, transparent 70%)`, filter: 'blur(100px)', opacity: 0.42, animation: 'auroraDrift3 38s ease-in-out infinite' }} />
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 120% 80% at 50% 0%, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />
      </div>
      <div className="grain-overlay" aria-hidden="true" />
    </>
  )
}
