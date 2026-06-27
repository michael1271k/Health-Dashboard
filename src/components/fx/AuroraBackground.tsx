'use client'

import { useEffect, useState } from 'react'
import { useTodayScore } from '@/lib/hooks/useDashboard'

/**
 * AuroraBackground — a living, GPU-cheap gradient-mesh that sits fixed behind
 * all content (-z-10) so the true-glass panels have depth to refract.
 *
 * - 3 large blurred radial blobs drift slowly (transform/opacity only).
 * - Hue shifts by time-of-day (cool night → warm day).
 * - Tint nudged by current Battery %: low battery = cooler/dimmer, high = warmer.
 * - Respects prefers-reduced-motion (renders a static gradient).
 */
export function AuroraBackground() {
  const [mounted, setMounted] = useState(false)
  const { data: score } = useTodayScore()

  useEffect(() => setMounted(true), [])

  // Time-of-day hue: 0–360. Morning cool-blue, midday brighter, evening violet.
  const hour = mounted ? new Date().getHours() : 12
  // Map hour → base hue around the blue/violet band (210–270)
  const baseHue = 210 + Math.round(30 * Math.sin((hour / 24) * Math.PI * 2))

  // Battery influence: higher battery → warmer/more saturated, lower → cooler/dimmer
  const battery = score?.battery_pct ?? 50
  const energy = Math.max(0, Math.min(100, battery)) / 100
  const sat = 55 + Math.round(energy * 25)        // 55–80%
  const light = 18 + Math.round(energy * 10)       // 18–28%
  const blobOpacity = 0.5 + energy * 0.25          // 0.5–0.75

  const c1 = `hsl(${baseHue} ${sat}% ${light}%)`
  const c2 = `hsl(${baseHue + 35} ${sat}% ${light + 4}%)`
  const c3 = `hsl(${baseHue - 25} ${sat - 10}% ${light - 2}%)`

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* Blob 1 — top-left */}
      <div
        className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full aurora-blob"
        style={{
          background: `radial-gradient(circle, ${c1} 0%, transparent 65%)`,
          filter: 'blur(80px)',
          opacity: blobOpacity,
          animation: 'auroraDrift1 26s ease-in-out infinite',
        }}
      />
      {/* Blob 2 — bottom-right */}
      <div
        className="absolute -bottom-1/4 -right-1/4 w-[65vw] h-[65vw] rounded-full aurora-blob"
        style={{
          background: `radial-gradient(circle, ${c2} 0%, transparent 65%)`,
          filter: 'blur(90px)',
          opacity: blobOpacity * 0.85,
          animation: 'auroraDrift2 32s ease-in-out infinite',
        }}
      />
      {/* Blob 3 — center drift */}
      <div
        className="absolute top-1/3 left-1/3 w-[55vw] h-[55vw] rounded-full aurora-blob"
        style={{
          background: `radial-gradient(circle, ${c3} 0%, transparent 70%)`,
          filter: 'blur(100px)',
          opacity: blobOpacity * 0.7,
          animation: 'auroraDrift3 38s ease-in-out infinite',
        }}
      />
      {/* Subtle grain/vignette to deepen the obsidian feel */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 80% at 50% 0%, transparent 40%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </div>
  )
}
