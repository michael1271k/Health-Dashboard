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

function BatteryLabel({ battery }: { battery: number }) {
  if (battery >= 80) return { label: 'Fully Charged', color: 'text-primary' }
  if (battery >= 60) return { label: 'Good Energy', color: 'text-primary' }
  if (battery >= 40) return { label: 'Moderate', color: 'text-warn' }
  if (battery >= 20) return { label: 'Low Energy', color: 'text-warn' }
  return { label: 'Depleted', color: 'text-danger' }
}

export function BatteryCard({ battery, isLoading }: BatteryCardProps) {
  const value = battery ?? 0
  const { label, color } = BatteryLabel({ battery: value })

  return (
    <div className="vital-card flex flex-col h-full min-h-[280px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold text-lg">Daily Battery</h2>
        <span className="text-xs text-muted-vital uppercase tracking-wider">Today</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-surface-2 animate-pulse" aria-hidden="true" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {/* The orb fills its parent — constrain with explicit size */}
          <div className="relative w-40 h-40" aria-label={`Battery: ${value}%`}>
            <BatteryOrb battery={value} />
            {/* Centered overlay text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className={`vital-number text-3xl font-bold ${color}`}>
                {value}
                <span className="text-lg">%</span>
              </span>
            </div>
          </div>

          <div className="text-center space-y-0.5">
            <p className={`text-sm font-medium ${color}`}>{label}</p>
            <p className="text-xs text-muted-vital">Updates every minute</p>
          </div>
        </div>
      )}
    </div>
  )
}
