'use client'

import { useId } from 'react'

/**
 * ApexMark — a neon-glass "A" monogram. Two beveled glass facets form the A with
 * a Cyber-Mint gradient stroke (teal → cyan → mint), a frosted inner fill, and a
 * soft glow. Pure (gradient IDs via useId — no render-time module counter).
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
      style={{ filter: 'drop-shadow(0 0 5px rgba(25,227,177,0.45))' }}
    >
      <defs>
        <linearGradient id={`${g}s`} x1="4" y1="22" x2="20" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#19E3B1" />
          <stop offset="55%" stopColor="#38E1FF" />
          <stop offset="100%" stopColor="#5BFF9D" />
        </linearGradient>
        <linearGradient id={`${g}f`} x1="12" y1="3.5" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38E1FF" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#19E3B1" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      {/* Frosted glass fill */}
      <polygon points="12,3.5 5,21 19,21" fill={`url(#${g}f)`} />
      {/* A legs */}
      <path d="M5 21 L12 3.5 L19 21" stroke={`url(#${g}s)`} strokeWidth="2.1" />
      {/* Crossbar */}
      <path d="M8.4 14.3 L15.6 14.3" stroke={`url(#${g}s)`} strokeWidth="1.8" />
      {/* Apex specular highlight */}
      <circle cx="12" cy="3.9" r="0.95" fill="#EAFBFF" />
    </svg>
  )
}
