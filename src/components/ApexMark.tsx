'use client'

import { useId } from 'react'

/**
 * ApexMark — a 3D neon-glass "A" monogram. A back shadow gives depth; a lit
 * left facet + darker right facet read as a real beveled glass object catching
 * light, over a Cyber-Mint gradient stroke (teal → cyan → mint) with a glow.
 * Pure (gradient IDs via useId). Size with `h-[…em]` so it tracks the title.
 */
export function ApexMark({ className = 'w-6 h-6' }: { className?: string }) {
  const uid = useId().replace(/[:]/g, '')
  const g = `ax${uid}`
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5)) drop-shadow(0 0 7px rgba(25,227,177,0.5))' }}
    >
      <defs>
        <linearGradient id={`${g}s`} x1="4" y1="22" x2="20" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#19E3B1" />
          <stop offset="55%" stopColor="#38E1FF" />
          <stop offset="100%" stopColor="#5BFF9D" />
        </linearGradient>
        <linearGradient id={`${g}L`} x1="5" y1="21" x2="12" y2="3.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38E1FF" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#EAFBFF" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id={`${g}R`} x1="12" y1="3.5" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#19E3B1" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#0A1A22" stopOpacity="0.30" />
        </linearGradient>
      </defs>

      {/* Depth / back shadow (offset down-right) */}
      <polygon points="12.7,4.6 5.7,21.7 19.7,21.7" fill="rgba(0,0,0,0.38)" />
      {/* Left facet (lit) */}
      <polygon points="12,3.5 5,21 12,21" fill={`url(#${g}L)`} />
      {/* Right facet (shaded) */}
      <polygon points="12,3.5 19,21 12,21" fill={`url(#${g}R)`} />
      {/* A legs */}
      <path d="M5 21 L12 3.5 L19 21" stroke={`url(#${g}s)`} strokeWidth="2.1" />
      {/* Crossbar */}
      <path d="M8.4 14.3 L15.6 14.3" stroke={`url(#${g}s)`} strokeWidth="1.8" />
      {/* Left-edge specular highlight (glass catching light) */}
      <path d="M6.6 18.6 L11.4 6.5" stroke="rgba(255,255,255,0.55)" strokeWidth="0.7" />
      {/* Apex specular */}
      <circle cx="12" cy="3.9" r="1" fill="#EAFBFF" />
    </svg>
  )
}
