'use client'

export interface Ring {
  label: string
  /** 0–100 */
  value: number
  /** hex */
  color: string
}

interface ScoreRingsProps {
  /** Big centered figure (mono). */
  centerValue: string | number | null
  centerUnit?: string
  /** Outer → inner. Up to 4 rings render cleanly. */
  rings: Ring[]
  /** Caption under the figure. */
  caption?: string
  captionColor?: string
  testId?: string
}

const VIEW = 100
const CENTER = VIEW / 2
const OUTER_R = 45
const RING_GAP = 11
const STROKE = 7

/**
 * Concentric glowing glass status rings — a performant SVG/CSS replacement for
 * the 3D R3F orb. Outer ring is the headline metric; inner rings add context.
 * Each progress arc glows in its accent via a drop-shadow filter. Reduced-motion
 * friendly (transitions only; no continuous animation).
 */
export function ScoreRings({ centerValue, centerUnit, rings, caption, captionColor, testId }: ScoreRingsProps) {
  const display = centerValue === null || centerValue === undefined || centerValue === '' ? '—' : centerValue

  return (
    <div data-testid={testId} className="relative w-full max-w-[180px] circle-square mx-auto">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="w-full h-full -rotate-90" aria-hidden="true">
        {rings.slice(0, 4).map((ring, i) => {
          const r = OUTER_R - i * RING_GAP
          const circ = 2 * Math.PI * r
          const pct = Math.max(0, Math.min(100, ring.value)) / 100
          return (
            <g key={ring.label}>
              {/* Track */}
              <circle
                cx={CENTER} cy={CENTER} r={r} fill="none"
                stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE}
              />
              {/* Progress arc with glow */}
              <circle
                cx={CENTER} cy={CENTER} r={r} fill="none"
                stroke={ring.color} strokeWidth={STROKE} strokeLinecap="round"
                strokeDasharray={`${circ * pct} ${circ - circ * pct}`}
                style={{
                  filter: `drop-shadow(0 0 3px ${ring.color}aa)`,
                  transition: 'stroke-dasharray 0.7s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
            </g>
          )
        })}
      </svg>

      {/* Center figure */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="vital-number text-fluid-2xl font-bold text-text leading-none">
          {display}
          {display !== '—' && centerUnit && <span className="text-fluid-base text-muted-vital">{centerUnit}</span>}
        </span>
        {caption && (
          <span className="text-fluid-xs font-medium mt-1" style={{ color: captionColor ?? 'var(--color-muted-vital)' }}>
            {caption}
          </span>
        )}
      </div>
    </div>
  )
}
