interface BatteryOrbFallbackProps {
  battery: number
}

export function BatteryOrbFallback({ battery }: BatteryOrbFallbackProps) {
  const t = battery / 100
  // Color interpolation matching the orb: danger → warn → primary
  const color =
    battery <= 20 ? '#FF4D6D' :
    battery <= 40 ? '#FFB020' :
    '#00E5A0'

  const circumference = 2 * Math.PI * 44
  const strokeDashoffset = circumference * (1 - t)

  return (
    <div className="relative w-full h-full flex items-center justify-center" aria-hidden="true">
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full max-w-[160px] max-h-[160px] -rotate-90"
      >
        {/* Background ring */}
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="#243040"
          strokeWidth="8"
        />
        {/* Charge ring */}
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease' }}
        />
      </svg>
    </div>
  )
}
