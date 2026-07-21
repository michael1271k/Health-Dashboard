'use client'

interface RecoveryCardProps {
  recovery: number | null
  battery: number | null
  isLoading?: boolean
}

// Ring hue shifts with remaining battery: high = neon green/teal, mid =
// cyan/blue, low = orange/red — same scale the old Battery capsule used.
function batteryColor(b: number): string {
  if (b >= 85) return '#2DF5A0'
  if (b >= 70) return '#34D399'
  if (b >= 60) return '#22D3EE'
  if (b >= 50) return '#4F9DFF'
  if (b >= 35) return '#FBBF24'
  if (b >= 20) return '#FF8A3D'
  return '#FB7185'
}

/**
 * Merged Recovery + Battery hero — ONE element instead of two confusing ones.
 * Recovery score is the headline number; the ring fill is today's remaining
 * battery; the caption reads "X% energy left". (Replaces the separate Battery
 * capsule that crammed onto the same line as Recovery.)
 */
export function RecoveryCard({ recovery, battery, isLoading }: RecoveryCardProps) {
  const hasBat = battery != null
  const b = hasBat ? battery : 0
  const color = hasBat ? batteryColor(b) : '#3A4A66'
  const numberColor = recovery != null ? color : 'var(--color-muted)'
  const size = 168, stroke = 12
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r

  return (
    <div className="helix-card flex flex-col h-full min-h-[240px] sm:min-h-[280px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold text-fluid-lg">Recovery</h2>
        <span className="text-fluid-xs text-muted uppercase tracking-wider">Today</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-full bg-surface-2 animate-pulse" style={{ width: size, height: size }} aria-hidden="true" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
              {hasBat && b > 0 && (
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={circ * (1 - b / 100)}
                  style={{ filter: `drop-shadow(0 0 6px ${color}88)`, transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="helix-num text-5xl font-bold leading-none" style={{ color: numberColor }}>
                {recovery != null ? recovery : '—'}
              </span>
              <span className="text-[11px] text-muted uppercase tracking-widest mt-1.5">Recovery</span>
            </div>
          </div>
          <p className="text-fluid-sm" style={{ color: hasBat ? color : 'var(--color-muted)' }}>
            {hasBat ? `${b}% energy left` : 'Awaiting score'}
          </p>
        </div>
      )}
    </div>
  )
}
