'use client'

import { memo } from 'react'

const SEGMENT_META = [
  { label: 'Sleep', color: '#B4522A' },
  { label: 'Water', color: '#8E9AAC' },
  { label: 'Food', color: '#E0703C' },
] as const

/**
 * Core Trio completeness arc — three 100° segments (sleep · water · food).
 * A day is never "invalid", only more or less complete; missing segments render
 * as faint tracks, not warnings.
 */
export const CompletenessArc = memo(function CompletenessArc({ parts, size = 46 }: {
  parts: [boolean, boolean, boolean]
  size?: number
}) {
  const stroke = 4.5
  const r = (size - stroke) / 2
  const c = size / 2
  // Three segments of ~100° with 20° gaps, starting at the top.
  const segAngle = 100
  const gap = 20
  const arc = (startDeg: number) => {
    const a0 = ((startDeg - 90) * Math.PI) / 180
    const a1 = ((startDeg + segAngle - 90) * Math.PI) / 180
    const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0)
    const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1)
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`
  }
  const done = parts.filter(Boolean).length
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`Day completeness: ${done} of 3 (${SEGMENT_META.filter((_, i) => parts[i]).map((m) => m.label).join(', ') || 'none'})`}>
      {SEGMENT_META.map((m, i) => {
        const start = i * (segAngle + gap)
        const on = parts[i]
        return (
          <path key={m.label} d={arc(start)} fill="none" strokeWidth={stroke} strokeLinecap="round"
            stroke={on ? m.color : 'rgba(255,255,255,0.08)'}
            style={on ? { filter: `drop-shadow(0 0 4px ${m.color}66)` } : undefined} />
        )
      })}
      <text x={c} y={c + 3.5} textAnchor="middle" fontSize={size * 0.24} fontWeight={700}
        fill={done === 3 ? '#E0703C' : '#79808C'} fontFamily="var(--font-mono, monospace)">
        {done}/3
      </text>
    </svg>
  )
})
