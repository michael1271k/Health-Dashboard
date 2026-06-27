'use client'

import dynamic from 'next/dynamic'
import { BatteryOrbFallback } from '@/components/three/BatteryOrbFallback'

// Lazy-load R3F — never blocks first paint
const BatteryOrb = dynamic(
  () => import('@/components/three/BatteryOrb').then((m) => ({ default: m.BatteryOrb })),
  {
    ssr: false,
    loading: () => <BatteryOrbFallback battery={0} />,
  },
)

interface BatteryCardProps {
  battery: number | null
  isLoading?: boolean
}

function batteryLabel(battery: number): { label: string; color: string } {
  if (battery >= 80) return { label: 'Fully Charged', color: 'text-primary' }
  if (battery >= 60) return { label: 'Good Energy', color: 'text-primary' }
  if (battery >= 40) return { label: 'Moderate', color: 'text-warn' }
  if (battery >= 20) return { label: 'Low Energy', color: 'text-warn' }
  return { label: 'Depleted', color: 'text-danger' }
}

/** Neutral muted ring shown before today's score has been computed. */
function NeutralRing() {
  const c = 2 * Math.PI * 44
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="none" stroke="#243040" strokeWidth="8" />
      <circle
        cx="50" cy="50" r="44" fill="none" stroke="#3A4A66" strokeWidth="8"
        strokeLinecap="round" strokeDasharray={`${c * 0.08} ${c}`}
      />
    </svg>
  )
}

export function BatteryCard({ battery, isLoading }: BatteryCardProps) {
  const hasData = battery !== null && battery !== undefined
  const value = hasData ? battery : 0
  const { label, color } = hasData
    ? batteryLabel(value)
    : { label: 'Awaiting score', color: 'text-muted-vital' }

  return (
    <div className="vital-card flex flex-col h-full min-h-[240px] sm:min-h-[280px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold text-fluid-lg">Daily Battery</h2>
        <span className="text-fluid-xs text-muted-vital uppercase tracking-wider">Today</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-surface-2 animate-pulse" aria-hidden="true" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {/* Perfect circle at any width: aspect-ratio 1/1 + capped max width */}
          <div
            data-testid="battery-orb"
            className="relative w-full max-w-[160px] circle-square"
            aria-label={hasData ? `Battery: ${value}%` : 'Battery: awaiting today’s score'}
          >
            {hasData ? <BatteryOrb battery={value} /> : <NeutralRing />}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {hasData ? (
                <span className={`vital-number text-fluid-2xl font-bold ${color}`}>
                  {value}
                  <span className="text-fluid-lg">%</span>
                </span>
              ) : (
                <span className="vital-number text-fluid-2xl font-bold text-muted-vital">—</span>
              )}
            </div>
          </div>

          <div className="text-center space-y-0.5">
            <p className={`text-fluid-sm font-medium ${color}`}>{label}</p>
            <p className="text-fluid-xs text-muted-vital">
              {hasData ? 'Updates every minute' : 'Syncing today’s data…'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
