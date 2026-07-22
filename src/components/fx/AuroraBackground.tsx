'use client'

import { useEffect, useState } from 'react'

/**
 * AuroraBackground — a living gradient mesh fixed behind all content (-z-10) so
 * the glass panels refract depth, plus a subtle grain overlay (-z-9).
 *
 * Green / Blue / Magenta band. The base layer is a stack of plain CSS
 * radial-gradients painted directly on the fixed container — these render on
 * EVERY engine (including iOS WKWebView), with no dependency on `filter: blur()`
 * on huge elements, which WebKit silently drops past its texture-size budget
 * (that was the "gradient doesn't show on the physical iPhone" bug). The blurred
 * drifting blobs sit on top as an enhancement for GPUs that can afford them.
 */
export function AuroraBackground() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Gentle time-of-day drift of the whole band, kept subtle.
  const hour = mounted ? new Date().getHours() : 12
  const shift = Math.round(6 * Math.sin((hour / 24) * Math.PI * 2))

  const GREEN = '#22C55E'
  const BLUE = '#3B82F6'
  const MAGENTA = '#EC4899'

  // Guaranteed-render base: layered radial gradients (no blur filter).
  const baseGradient = [
    `radial-gradient(60vw 55vh at ${18 + shift}% 12%, ${GREEN}59 0%, ${GREEN}1f 34%, transparent 62%)`,
    `radial-gradient(62vw 58vh at ${84 - shift}% 82%, ${MAGENTA}59 0%, ${MAGENTA}1f 34%, transparent 62%)`,
    `radial-gradient(70vw 60vh at 55% ${46 + shift}%, ${BLUE}4d 0%, ${BLUE}1a 38%, transparent 66%)`,
  ].join(', ')

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
        style={{ backgroundColor: 'var(--color-bg)', backgroundImage: baseGradient }}
      >
        {/* Enhancement layer — blurred drifting blobs (dropped by WebKit when it
            can't afford them; the base gradient above always shows). */}
        <div className="aurora-blob-1 absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full"
          style={{ background: `radial-gradient(circle, ${GREEN} 0%, transparent 65%)`, filter: 'blur(80px)', opacity: 0.5, animation: 'auroraDrift1 26s ease-in-out infinite' }} />
        <div className="aurora-blob-2 absolute -bottom-1/4 -right-1/4 w-[65vw] h-[65vw] rounded-full"
          style={{ background: `radial-gradient(circle, ${MAGENTA} 0%, transparent 65%)`, filter: 'blur(90px)', opacity: 0.45, animation: 'auroraDrift2 32s ease-in-out infinite' }} />
        <div className="aurora-blob-3 absolute top-1/3 left-1/3 w-[55vw] h-[55vw] rounded-full"
          style={{ background: `radial-gradient(circle, ${BLUE} 0%, transparent 70%)`, filter: 'blur(100px)', opacity: 0.4, animation: 'auroraDrift3 38s ease-in-out infinite' }} />
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 120% 80% at 50% 0%, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />
      </div>
      <div className="axis-wireframe" aria-hidden="true" />
      <div className="grain-overlay" aria-hidden="true" />
    </>
  )
}
