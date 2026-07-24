'use client'

import { useId } from 'react'

/**
 * HelixMark — two interleaved neon strands (teal + cyan) forming an "H" with
 * three base-pair rungs. Glass depth via a back shadow + specular node.
 * Pure (gradient IDs via useId). Size with `h-[…em]` so it tracks the title.
 */
export function HelixMark({ className = 'w-6 h-6' }: { className?: string }) {
  const uid = useId().replace(/[:]/g, '')
  const g = `hx${uid}`
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5)) drop-shadow(0 0 7px rgba(56,225,255,0.5))' }}
    >
      <defs>
        <linearGradient id={`${g}a`} x1="6" y1="22" x2="10" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E0703C" /><stop offset="100%" stopColor="#3E9E7A" />
        </linearGradient>
        <linearGradient id={`${g}b`} x1="14" y1="2" x2="18" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8E9AAC" /><stop offset="100%" stopColor="#B4522A" />
        </linearGradient>
      </defs>

      {/* Depth shadow */}
      <path d="M8.6 3.6 C10.6 8.4, 6.6 10.4, 8.6 15.2 C9.6 17.6, 9.6 19.2, 8.6 21.6" stroke="rgba(0,0,0,0.4)" strokeWidth="2.4" />
      {/* Left strand (teal) — S-curve */}
      <path d="M8 3 C10 7.8, 6 9.8, 8 14.6 C9 17, 9 18.6, 8 21" stroke={`url(#${g}a)`} strokeWidth="2.1" />
      {/* Right strand (cyan) — mirrored */}
      <path d="M16 3 C14 7.8, 18 9.8, 16 14.6 C15 17, 15 18.6, 16 21" stroke={`url(#${g}b)`} strokeWidth="2.1" />
      {/* Base-pair rungs (the H crossbars) */}
      <path d="M8.9 7.2 L15.1 7.2" stroke="rgba(201,205,214,0.85)" strokeWidth="1.5" />
      <path d="M7.4 12 L16.6 12" stroke="rgba(236,238,242,0.95)" strokeWidth="1.8" />
      <path d="M8.9 16.8 L15.1 16.8" stroke="rgba(201,205,214,0.85)" strokeWidth="1.5" />
      {/* Specular node */}
      <circle cx="16" cy="3.4" r="1" fill="#ECEEF2" />
    </svg>
  )
}
