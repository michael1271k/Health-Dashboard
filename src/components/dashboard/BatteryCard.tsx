'use client'

import { LiquidBattery } from './LiquidBattery'

interface BatteryCardProps {
  battery: number | null
  sleepScore?: number | null
  recoveryScore?: number | null
  isLoading?: boolean
}

function batteryLabel(battery: number): { label: string; color: string } {
  if (battery >= 80) return { label: 'Fully Charged', color: '#43F59B' }  // mint
  if (battery >= 60) return { label: 'Good Energy', color: '#19E3B1' }    // teal
  if (battery >= 40) return { label: 'Moderate', color: '#38E1FF' }       // cyan
  if (battery >= 20) return { label: 'Low Energy', color: '#FFB020' }
  return { label: 'Depleted', color: '#FF5470' }
}

/** Daily Battery hero — a liquid-fill glass capsule, null-aware + live-updating. */
export function BatteryCard({ battery, isLoading }: BatteryCardProps) {
  const hasData = battery !== null && battery !== undefined
  const value = hasData ? battery : 0
  const { label, color } = hasData
    ? batteryLabel(value)
    : { label: 'Awaiting score', color: 'var(--color-muted-vital)' }

  return (
    <div className="vital-card flex flex-col h-full min-h-[240px] sm:min-h-[280px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold text-fluid-lg">Daily Battery</h2>
        <span className="text-fluid-xs text-muted-vital uppercase tracking-wider">Today</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-[92px] h-[168px] rounded-[2.75rem] bg-surface-2 animate-pulse" aria-hidden="true" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <LiquidBattery
            testId="battery-orb"
            value={hasData ? value : null}
            color={hasData ? color : '#3A4A66'}
            caption={label}
            captionColor={color}
          />
          <p className="text-fluid-xs text-muted-vital text-center">
            {hasData ? 'Updates live as the day drains' : 'Syncing today’s data…'}
          </p>
        </div>
      )}
    </div>
  )
}
